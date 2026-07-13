"""
Seed script for LeadFlow.

Run with:  python seed.py

- Always ensures a super admin account exists (from FIRST_ADMIN_* env vars,
  or sensible defaults if not set).
- If the database has no leads yet, also creates two sample individual
  users and a batch of realistic sample leads/follow-ups/activity so the
  app is ready to click around in immediately.

Safe to re-run: it will not create duplicate users or duplicate sample data.
"""
import os
import random
from datetime import date, datetime, timedelta

from dotenv import load_dotenv

load_dotenv()

from app.database import SessionLocal, Base, engine
from app import models
from app.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

FIRST_ADMIN_NAME = os.getenv("FIRST_ADMIN_NAME", "Super Admin")
FIRST_ADMIN_EMAIL = os.getenv("FIRST_ADMIN_EMAIL", "admin@leadflow.com").lower()
FIRST_ADMIN_PASSWORD = os.getenv("FIRST_ADMIN_PASSWORD", "ChangeMe123!")


def get_or_create_user(name, email, password, role):
    email = email.lower()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        return user, False
    user = models.User(
        name=name, email=email, password_hash=hash_password(password), role=role
    )
    db.add(user)
    db.flush()
    return user, True


def log(db, user_id, lead_id, action_type, description, when=None):
    a = models.Activity(user_id=user_id, lead_id=lead_id, action_type=action_type, description=description)
    if when:
        a.created_at = when
    db.add(a)


def main():
    admin, created = get_or_create_user(FIRST_ADMIN_NAME, FIRST_ADMIN_EMAIL, FIRST_ADMIN_PASSWORD, models.RoleEnum.super_admin)
    if created:
        print(f"Created super admin: {FIRST_ADMIN_EMAIL} / {FIRST_ADMIN_PASSWORD}")
    else:
        print(f"Super admin already exists: {FIRST_ADMIN_EMAIL}")

    consultant, c_created = get_or_create_user("Alex Rivera", "alex@leadflow.com", "Consultant123!", models.RoleEnum.user)
    partner, p_created = get_or_create_user("Jordan Blake", "jordan@leadflow.com", "Partner123!", models.RoleEnum.user)
    db.commit()

    if c_created:
        print("Created sample user: alex@leadflow.com / Consultant123!")
    if p_created:
        print("Created sample user: jordan@leadflow.com / Partner123!")

    existing_leads = db.query(models.Lead).count()
    if existing_leads > 0:
        print(f"Database already has {existing_leads} leads — skipping sample lead generation.")
        db.close()
        return

    sources = ["Website", "Referral", "LinkedIn", "Cold Call", "Trade Show", "Google Ads", "Instagram"]
    statuses = [models.LeadStatusEnum.new, models.LeadStatusEnum.contacted,
                models.LeadStatusEnum.qualified, models.LeadStatusEnum.closed]
    first_names = ["Priya", "Michael", "Sofia", "David", "Emma", "Raj", "Laura", "Kenji",
                   "Fatima", "Carlos", "Grace", "Tom", "Nina", "Omar", "Zoe", "Liam"]
    last_names = ["Sharma", "Chen", "Garcia", "Patel", "Johnson", "Kim", "Nguyen", "Brown",
                  "Ali", "Silva", "Novak", "Reed", "Costa", "Khan", "Fischer", "Diaz"]

    owners = [admin, consultant, partner]
    today = date.today()

    for i in range(28):
        owner = random.choice([consultant, partner])  # sample leads owned by individual users
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        status = random.choices(statuses, weights=[30, 30, 25, 15])[0]
        created_days_ago = random.randint(1, 45)
        created_at = datetime.utcnow() - timedelta(days=created_days_ago)

        lead = models.Lead(
            client_name=name,
            contact_phone=f"+1-555-{random.randint(200,999)}-{random.randint(1000,9999)}",
            contact_email=f"{name.lower().replace(' ', '.')}@example.com",
            source=random.choice(sources),
            status=status,
            notes="Initial inquiry logged from sample data seed.",
            owner_id=owner.id,
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(lead)
        db.flush()

        log(db, owner.id, lead.id, models.ActionTypeEnum.lead_created,
            f"{owner.name} created lead \"{lead.client_name}\"", when=created_at)

        # Give most leads 1-3 follow-ups
        if status != models.LeadStatusEnum.new:
            num_fups = random.randint(1, 3)
            for n in range(num_fups):
                fup_date = created_at.date() + timedelta(days=n * random.randint(2, 6))
                if fup_date > today:
                    fup_date = today
                is_last = n == num_fups - 1
                # Roughly half of open leads have an overdue next action for demo purposes
                if is_last and status != models.LeadStatusEnum.closed:
                    next_action = today + timedelta(days=random.choice([-5, -2, -1, 2, 4, 7]))
                    completed = False
                else:
                    next_action = fup_date + timedelta(days=3)
                    completed = True

                fup = models.FollowUp(
                    lead_id=lead.id,
                    user_id=owner.id,
                    note=random.choice([
                        "Called to introduce our services and gauge interest.",
                        "Sent proposal and pricing details via email.",
                        "Discussed requirements in more depth on a call.",
                        "Followed up after no response to initial email.",
                        "Client requested more time to review internally.",
                    ]),
                    follow_up_date=fup_date,
                    next_action_date=next_action,
                    completed=completed,
                )
                db.add(fup)
                db.flush()
                log(db, owner.id, lead.id, models.ActionTypeEnum.followup_logged,
                    f"{owner.name} logged a follow-up on \"{lead.client_name}\"",
                    when=datetime.combine(fup_date, datetime.min.time()))

        if status == models.LeadStatusEnum.closed:
            log(db, owner.id, lead.id, models.ActionTypeEnum.status_changed,
                f"{owner.name} changed \"{lead.client_name}\" status: qualified \u2192 closed",
                when=created_at + timedelta(days=5))

    db.commit()
    print("Seeded 28 sample leads with follow-ups and activity history.")
    db.close()


if __name__ == "__main__":
    main()

from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/leads", tags=["leads"])


def log_activity(db: Session, user_id: str, lead_id: str, action_type, description: str):
    db.add(models.Activity(user_id=user_id, lead_id=lead_id, action_type=action_type, description=description))


def enrich_lead(db: Session, lead: models.Lead) -> schemas.LeadOut:
    open_fups = (
        db.query(models.FollowUp)
        .filter(models.FollowUp.lead_id == lead.id, models.FollowUp.completed == False)  # noqa: E712
        .all()
    )
    next_dates = [f.next_action_date for f in open_fups if f.next_action_date]
    out = schemas.LeadOut.model_validate(lead)
    out.owner_name = lead.owner.name if lead.owner else None
    out.open_followups = len(open_fups)
    out.next_action_date = min(next_dates) if next_dates else None
    return out


@router.get("", response_model=list[schemas.LeadOut])
def list_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    user_id: Optional[str] = None,
    q: Optional[str] = Query(None, description="Search client name, email, phone"),
    location: Optional[str] = Query(None, description="Filter by address/location"),
    overdue_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Lead)

    # RBAC: individual users only ever see their own leads
    if current_user.role != models.RoleEnum.super_admin:
        query = query.filter(models.Lead.owner_id == current_user.id)
    elif user_id:
        query = query.filter(models.Lead.owner_id == user_id)

    if status:
        query = query.filter(models.Lead.status == status)
    if source:
        query = query.filter(models.Lead.source.ilike(f"%{source}%"))
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(
                models.Lead.client_name.ilike(like),
                models.Lead.contact_email.ilike(like),
                models.Lead.contact_phone.ilike(like),
            )
        )
    if location:
        query = query.filter(models.Lead.address.ilike(f"%{location}%"))

    leads = query.order_by(models.Lead.updated_at.desc()).all()
    results = [enrich_lead(db, lead) for lead in leads]

    if overdue_only:
        today = date.today()
        results = [r for r in results if r.next_action_date and r.next_action_date < today]

    return results


@router.post("", response_model=schemas.LeadOut)
def create_lead(
    payload: schemas.LeadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    first = payload.contacts[0] if payload.contacts else None
    lead = models.Lead(
        client_name=payload.client_name,
        contact_person=first.name if first else payload.contact_person,
        contact_phone=first.phone if first else payload.contact_phone,
        contact_email=first.email if first else payload.contact_email,
        address=payload.address,
        source=payload.source,
        status=payload.status,
        notes=payload.notes,
        owner_id=current_user.id,
    )
    db.add(lead)
    db.flush()
    for c in payload.contacts:
        name = (c.name or "").strip()
        if name:
            db.add(models.LeadContact(
                lead_id=lead.id,
                name=name,
                designation=c.designation,
                email=c.email,
                phone=c.phone,
            ))
    log_activity(db, current_user.id, lead.id, models.ActionTypeEnum.lead_created,
                 f"{current_user.name} created lead \"{lead.client_name}\"")
    db.commit()
    db.refresh(lead)
    return enrich_lead(db, lead)


@router.get("/locations", response_model=list[str])
def get_lead_locations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Lead.address).filter(
        models.Lead.address.isnot(None),
        models.Lead.address != '',
    )
    if current_user.role != models.RoleEnum.super_admin:
        query = query.filter(models.Lead.owner_id == current_user.id)
    rows = query.all()
    return sorted({row.address.strip() for row in rows if row.address and row.address.strip()})


def _get_lead_or_404(db: Session, lead_id: str, current_user: models.User) -> models.Lead:
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if current_user.role != models.RoleEnum.super_admin and lead.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this lead")
    return lead


@router.get("/{lead_id}", response_model=schemas.LeadOut)
def get_lead(lead_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    lead = _get_lead_or_404(db, lead_id, current_user)
    return enrich_lead(db, lead)


@router.patch("/{lead_id}", response_model=schemas.LeadOut)
def update_lead(
    lead_id: str,
    payload: schemas.LeadUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lead = _get_lead_or_404(db, lead_id, current_user)

    old_status = lead.status
    data = payload.model_dump(exclude_unset=True)

    if "owner_id" in data and current_user.role != models.RoleEnum.super_admin:
        del data["owner_id"]  # only admins may reassign leads

    contacts_data = data.pop("contacts", None)

    for field, value in data.items():
        setattr(lead, field, value)
    lead.updated_at = datetime.utcnow()

    if contacts_data is not None:
        db.query(models.LeadContact).filter(models.LeadContact.lead_id == lead.id).delete()
        for c in contacts_data:
            name = (c.get("name") or "").strip()
            if name:
                db.add(models.LeadContact(
                    lead_id=lead.id,
                    name=name,
                    designation=c.get("designation"),
                    email=c.get("email"),
                    phone=c.get("phone"),
                ))
        # Keep lead-level contact fields in sync with the first contact
        if contacts_data:
            first = contacts_data[0]
            first_name = (first.get("name") or "").strip()
            lead.contact_person = first_name or None
            lead.contact_phone = first.get("phone") or None
            lead.contact_email = first.get("email") or None
        else:
            lead.contact_person = None
            lead.contact_phone = None
            lead.contact_email = None

    db.flush()

    if "status" in data and data["status"] != old_status:
        log_activity(db, current_user.id, lead.id, models.ActionTypeEnum.status_changed,
                     f"{current_user.name} changed \"{lead.client_name}\" status: {old_status.value} \u2192 {lead.status.value}")
    else:
        log_activity(db, current_user.id, lead.id, models.ActionTypeEnum.lead_updated,
                     f"{current_user.name} updated \"{lead.client_name}\"")

    db.commit()
    db.refresh(lead)
    return enrich_lead(db, lead)


@router.delete("/{lead_id}")
def delete_lead(lead_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    lead = _get_lead_or_404(db, lead_id, current_user)
    db.delete(lead)
    db.commit()
    return {"detail": "Lead deleted"}

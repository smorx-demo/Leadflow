from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/followups", tags=["followups"])


def log_activity(db: Session, user_id: str, lead_id: str, action_type, description: str):
    db.add(models.Activity(user_id=user_id, lead_id=lead_id, action_type=action_type, description=description))


def to_out(fup: models.FollowUp) -> schemas.FollowUpOut:
    out = schemas.FollowUpOut.model_validate(fup)
    out.lead_client_name = fup.lead.client_name if fup.lead else None
    out.user_name = fup.user.name if fup.user else None
    return out


def _lead_accessible(db: Session, lead_id: str, current_user: models.User) -> models.Lead:
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if current_user.role != models.RoleEnum.super_admin and lead.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this lead")
    return lead


@router.get("", response_model=list[schemas.FollowUpOut])
def list_followups(
    lead_id: Optional[str] = None,
    overdue_only: bool = False,
    pending_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.FollowUp).join(models.Lead)

    if current_user.role != models.RoleEnum.super_admin:
        query = query.filter(models.Lead.owner_id == current_user.id)

    if lead_id:
        query = query.filter(models.FollowUp.lead_id == lead_id)
    if pending_only:
        query = query.filter(models.FollowUp.completed == False)  # noqa: E712
    if overdue_only:
        query = query.filter(
            models.FollowUp.completed == False,  # noqa: E712
            models.FollowUp.next_action_date < date.today(),
        )

    fups = query.order_by(models.FollowUp.next_action_date.asc().nullslast()).all()
    return [to_out(f) for f in fups]


@router.post("", response_model=schemas.FollowUpOut)
def create_followup(
    payload: schemas.FollowUpCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lead = _lead_accessible(db, payload.lead_id, current_user)
    fup = models.FollowUp(
        lead_id=lead.id,
        user_id=current_user.id,
        note=payload.note,
        follow_up_date=payload.follow_up_date,
        next_action_date=payload.next_action_date,
        completed=payload.completed,
    )
    db.add(fup)
    db.flush()
    log_activity(db, current_user.id, lead.id, models.ActionTypeEnum.followup_logged,
                 f"{current_user.name} logged a follow-up on \"{lead.client_name}\"")
    db.commit()
    db.refresh(fup)
    return to_out(fup)


@router.patch("/{followup_id}", response_model=schemas.FollowUpOut)
def update_followup(
    followup_id: str,
    payload: schemas.FollowUpUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fup = db.query(models.FollowUp).filter(models.FollowUp.id == followup_id).first()
    if not fup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    lead = _lead_accessible(db, fup.lead_id, current_user)

    was_completed = fup.completed
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(fup, field, value)

    if data.get("completed") and not was_completed:
        log_activity(db, current_user.id, lead.id, models.ActionTypeEnum.followup_completed,
                     f"{current_user.name} completed a follow-up on \"{lead.client_name}\"")

    db.commit()
    db.refresh(fup)
    return to_out(fup)


@router.delete("/{followup_id}")
def delete_followup(
    followup_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fup = db.query(models.FollowUp).filter(models.FollowUp.id == followup_id).first()
    if not fup:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    _lead_accessible(db, fup.lead_id, current_user)
    db.delete(fup)
    db.commit()
    return {"detail": "Follow-up deleted"}

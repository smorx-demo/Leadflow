from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/activities", tags=["activities"])


def to_out(a: models.Activity) -> schemas.ActivityOut:
    out = schemas.ActivityOut.model_validate(a)
    out.user_name = a.user.name if a.user else None
    out.lead_client_name = a.lead.client_name if a.lead else None
    return out


@router.get("", response_model=list[schemas.ActivityOut])
def list_activities(
    limit: int = Query(50, le=200),
    user_id: Optional[str] = None,
    lead_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Activity)

    if lead_id:
        lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        if current_user.role != models.RoleEnum.super_admin and lead.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="You do not have access to this lead")
        query = query.filter(models.Activity.lead_id == lead_id)
    else:
        if current_user.role != models.RoleEnum.super_admin:
            query = query.filter(models.Activity.user_id == current_user.id)
        elif user_id:
            query = query.filter(models.Activity.user_id == user_id)

    activities = query.order_by(models.Activity.created_at.desc()).limit(limit).all()
    return [to_out(a) for a in activities]

from datetime import date, datetime, timedelta
from collections import defaultdict

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _status_counts(db: Session, base_filter=None):
    query = db.query(models.Lead.status, func.count(models.Lead.id)).group_by(models.Lead.status)
    if base_filter is not None:
        query = query.filter(base_filter)
    rows = query.all()
    counts = {s.value: 0 for s in models.LeadStatusEnum}
    for status, count in rows:
        counts[status.value] = count
    return [schemas.StatusCount(status=k, count=v) for k, v in counts.items()]


@router.get("/admin", response_model=schemas.AdminDashboard)
def admin_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    total_leads = db.query(func.count(models.Lead.id)).scalar() or 0
    total_users = db.query(func.count(models.User.id)).filter(models.User.role == models.RoleEnum.user).scalar() or 0

    leads_by_status = _status_counts(db)

    today = date.today()
    overdue_followups = (
        db.query(func.count(models.FollowUp.id))
        .filter(models.FollowUp.completed == False, models.FollowUp.next_action_date < today)  # noqa: E712
        .scalar() or 0
    )

    total_followups = db.query(func.count(models.FollowUp.id)).scalar() or 0
    completed_followups = db.query(func.count(models.FollowUp.id)).filter(models.FollowUp.completed == True).scalar() or 0  # noqa: E712
    completion_rate = round((completed_followups / total_followups) * 100, 1) if total_followups else 0.0

    # Daily activity for last 14 days
    since = datetime.utcnow() - timedelta(days=14)
    activity_rows = (
        db.query(func.date(models.Activity.created_at), func.count(models.Activity.id))
        .filter(models.Activity.created_at >= since)
        .group_by(func.date(models.Activity.created_at))
        .all()
    )
    activity_map = {str(d): c for d, c in activity_rows}
    daily_activity = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i))
        daily_activity.append(schemas.DailyActivityPoint(date=str(d), count=activity_map.get(str(d), 0)))

    # Per-user breakdown
    users = db.query(models.User).filter(models.User.role == models.RoleEnum.user).all()
    week_ago = date.today() - timedelta(days=7)
    breakdown = []
    for u in users:
        leads = db.query(models.Lead).filter(models.Lead.owner_id == u.id).all()
        status_ct = defaultdict(int)
        for l in leads:
            status_ct[l.status.value] += 1
        overdue = (
            db.query(func.count(models.FollowUp.id))
            .join(models.Lead)
            .filter(
                models.Lead.owner_id == u.id,
                models.FollowUp.completed == False,  # noqa: E712
                models.FollowUp.next_action_date < today,
            )
            .scalar() or 0
        )
        fups_week = (
            db.query(func.count(models.FollowUp.id))
            .join(models.Lead)
            .filter(models.Lead.owner_id == u.id, models.FollowUp.follow_up_date >= week_ago)
            .scalar() or 0
        )
        breakdown.append(schemas.UserBreakdown(
            user_id=u.id,
            user_name=u.name,
            total_leads=len(leads),
            new=status_ct.get("new", 0),
            contacted=status_ct.get("contacted", 0),
            qualified=status_ct.get("qualified", 0),
            closed=status_ct.get("closed", 0),
            overdue_followups=overdue,
            followups_this_week=fups_week,
        ))
    breakdown.sort(key=lambda b: b.total_leads, reverse=True)

    recent = db.query(models.Activity).order_by(models.Activity.created_at.desc()).limit(20).all()
    recent_out = []
    for a in recent:
        out = schemas.ActivityOut.model_validate(a)
        out.user_name = a.user.name if a.user else None
        out.lead_client_name = a.lead.client_name if a.lead else None
        recent_out.append(out)

    return schemas.AdminDashboard(
        total_leads=total_leads,
        total_users=total_users,
        leads_by_status=leads_by_status,
        overdue_followups=overdue_followups,
        followups_completed_rate=completion_rate,
        daily_activity=daily_activity,
        user_breakdown=breakdown,
        recent_activity=recent_out,
    )


@router.get("/me", response_model=schemas.UserDashboard)
def my_dashboard(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    leads = db.query(models.Lead).filter(models.Lead.owner_id == current_user.id).all()
    total_leads = len(leads)
    status_ct = defaultdict(int)
    for l in leads:
        status_ct[l.status.value] += 1
    leads_by_status = [schemas.StatusCount(status=s.value, count=status_ct.get(s.value, 0)) for s in models.LeadStatusEnum]

    conversion_rate = round((status_ct.get("closed", 0) / total_leads) * 100, 1) if total_leads else 0.0

    today = date.today()
    pending_followups = (
        db.query(func.count(models.FollowUp.id))
        .join(models.Lead)
        .filter(models.Lead.owner_id == current_user.id, models.FollowUp.completed == False)  # noqa: E712
        .scalar() or 0
    )
    overdue_followups = (
        db.query(func.count(models.FollowUp.id))
        .join(models.Lead)
        .filter(
            models.Lead.owner_id == current_user.id,
            models.FollowUp.completed == False,  # noqa: E712
            models.FollowUp.next_action_date < today,
        )
        .scalar() or 0
    )

    week_ago = datetime.utcnow() - timedelta(days=7)
    activity_this_week = (
        db.query(func.count(models.Activity.id))
        .filter(models.Activity.user_id == current_user.id, models.Activity.created_at >= week_ago)
        .scalar() or 0
    )

    recent = (
        db.query(models.Activity)
        .filter(models.Activity.user_id == current_user.id)
        .order_by(models.Activity.created_at.desc())
        .limit(15)
        .all()
    )
    recent_out = []
    for a in recent:
        out = schemas.ActivityOut.model_validate(a)
        out.user_name = a.user.name if a.user else None
        out.lead_client_name = a.lead.client_name if a.lead else None
        recent_out.append(out)

    upcoming = (
        db.query(models.FollowUp)
        .join(models.Lead)
        .filter(models.Lead.owner_id == current_user.id, models.FollowUp.completed == False)  # noqa: E712
        .order_by(models.FollowUp.next_action_date.asc().nullslast())
        .limit(10)
        .all()
    )
    upcoming_out = []
    for f in upcoming:
        out = schemas.FollowUpOut.model_validate(f)
        out.lead_client_name = f.lead.client_name if f.lead else None
        out.user_name = f.user.name if f.user else None
        upcoming_out.append(out)

    return schemas.UserDashboard(
        total_leads=total_leads,
        leads_by_status=leads_by_status,
        conversion_rate=conversion_rate,
        pending_followups=pending_followups,
        overdue_followups=overdue_followups,
        activity_this_week=activity_this_week,
        recent_activity=recent_out,
        upcoming_followups=upcoming_out,
    )


# ---------------- Analytics ----------------

def _get_period_config(period: str):
    today = date.today()

    if period == 'daily':
        keys = [(today - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(29, -1, -1)]
        granularity = 'day'
        def label_fn(k): return datetime.strptime(k, '%Y-%m-%d').strftime('%b %d')

    elif period in ('weekly', '3m'):
        n_weeks = 12 if period == 'weekly' else 13
        monday = today - timedelta(days=today.weekday())
        keys = [(monday - timedelta(weeks=i)).strftime('%Y-W%V') for i in range(n_weeks - 1, -1, -1)]
        granularity = 'week'
        def label_fn(k):
            yr, wk = k.split('-W')
            d = date.fromisocalendar(int(yr), int(wk), 1)
            return d.strftime('%b %d')

    else:  # 6m, monthly, 12m
        n_months = {'6m': 6, 'monthly': 12, '12m': 12}.get(period, 12)
        keys, y, m = [], today.year, today.month
        for i in range(n_months - 1, -1, -1):
            mo, yr = m - i, y
            while mo <= 0:
                mo += 12
                yr -= 1
            keys.append(f'{yr}-{mo:02d}')
        granularity = 'month'
        def label_fn(k): return datetime.strptime(k + '-01', '%Y-%m-%d').strftime('%b %Y')

    return keys, granularity, label_fn


def _date_key(dt, granularity: str) -> str:
    d = dt.date() if hasattr(dt, 'date') else dt
    if granularity == 'day':
        return d.strftime('%Y-%m-%d')
    elif granularity == 'week':
        return d.strftime('%Y-W%V')
    return d.strftime('%Y-%m')


@router.get("/analytics", response_model=schemas.AnalyticsDashboard)
def analytics_dashboard(
    period: str = Query('monthly'),
    location: Optional[str] = None,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    lead_q = db.query(models.Lead)
    if current_user.role != models.RoleEnum.super_admin:
        lead_q = lead_q.filter(models.Lead.owner_id == current_user.id)
    elif user_id:
        lead_q = lead_q.filter(models.Lead.owner_id == user_id)
    if location:
        lead_q = lead_q.filter(models.Lead.address.ilike(f'%{location}%'))

    all_leads = lead_q.all()
    lead_ids = [l.id for l in all_leads]

    status_ct: dict = defaultdict(int)
    for l in all_leads:
        status_ct[l.status.value] += 1

    total = len(all_leads)
    today = date.today()

    overdue = total_fups = completed_fups = 0
    if lead_ids:
        overdue = (
            db.query(func.count(models.FollowUp.id))
            .filter(
                models.FollowUp.lead_id.in_(lead_ids),
                models.FollowUp.completed == False,  # noqa: E712
                models.FollowUp.next_action_date < today,
            )
            .scalar() or 0
        )
        total_fups = (
            db.query(func.count(models.FollowUp.id))
            .filter(models.FollowUp.lead_id.in_(lead_ids))
            .scalar() or 0
        )
        completed_fups = (
            db.query(func.count(models.FollowUp.id))
            .filter(models.FollowUp.lead_id.in_(lead_ids), models.FollowUp.completed == True)  # noqa: E712
            .scalar() or 0
        )

    summary = schemas.AnalyticsSummary(
        total_leads=total,
        new_leads=status_ct.get('new', 0),
        contacted=status_ct.get('contacted', 0),
        qualified=status_ct.get('qualified', 0),
        closed=status_ct.get('closed', 0),
        conversion_rate=round((status_ct.get('closed', 0) / total) * 100, 1) if total else 0.0,
        overdue_followups=overdue,
        followup_completion_rate=round((completed_fups / total_fups) * 100, 1) if total_fups else 0.0,
    )

    series_keys, granularity, label_fn = _get_period_config(period)
    series_set = set(series_keys)

    lead_counts: dict = defaultdict(int)
    for l in all_leads:
        k = _date_key(l.created_at, granularity)
        if k in series_set:
            lead_counts[k] += 1
    leads_over_time = [schemas.TimePoint(label=label_fn(k), count=lead_counts.get(k, 0)) for k in series_keys]

    fup_counts: dict = defaultdict(int)
    if lead_ids:
        for f in db.query(models.FollowUp).filter(models.FollowUp.lead_id.in_(lead_ids)).all():
            k = _date_key(f.created_at, granularity)
            if k in series_set:
                fup_counts[k] += 1
    followup_activity = [schemas.TimePoint(label=label_fn(k), count=fup_counts.get(k, 0)) for k in series_keys]

    status_distribution = [
        schemas.StatusCount(status=s.value, count=status_ct.get(s.value, 0))
        for s in models.LeadStatusEnum
    ]

    loc_map: dict = defaultdict(lambda: defaultdict(int))
    for l in all_leads:
        loc = (l.address or 'Unknown').strip() or 'Unknown'
        loc_map[loc]['total'] += 1
        loc_map[loc][l.status.value] += 1

    location_breakdown = [
        schemas.LocationCount(
            location=loc,
            total=ct['total'],
            new=ct.get('new', 0),
            contacted=ct.get('contacted', 0),
            qualified=ct.get('qualified', 0),
            closed=ct.get('closed', 0),
        )
        for loc, ct in sorted(loc_map.items(), key=lambda x: -x[1]['total'])
    ]

    if lead_ids:
        upcoming_fups = (
            db.query(models.FollowUp)
            .filter(models.FollowUp.completed == False, models.FollowUp.lead_id.in_(lead_ids))  # noqa: E712
            .order_by(models.FollowUp.next_action_date.asc().nullslast())
            .limit(10)
            .all()
        )
    else:
        upcoming_fups = []

    upcoming_out = []
    for f in upcoming_fups:
        out = schemas.FollowUpOut.model_validate(f)
        out.lead_client_name = f.lead.client_name if f.lead else None
        out.user_name = f.user.name if f.user else None
        upcoming_out.append(out)

    return schemas.AnalyticsDashboard(
        summary=summary,
        leads_over_time=leads_over_time,
        status_distribution=status_distribution,
        location_breakdown=location_breakdown,
        upcoming_followups=upcoming_out,
        followup_activity=followup_activity,
    )

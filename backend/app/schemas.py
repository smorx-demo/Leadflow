from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict

from .models import RoleEnum, LeadStatusEnum, ActionTypeEnum


# ---------- Auth ----------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ---------- Users ----------

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: RoleEnum = RoleEnum.user


class UserUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[RoleEnum] = None
    password: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: EmailStr
    role: RoleEnum
    is_active: bool
    created_at: datetime


# ---------- Lead Contacts ----------

class LeadContactCreate(BaseModel):
    name: str
    designation: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class LeadContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    lead_id: str
    name: str
    designation: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    created_at: datetime


# ---------- Leads ----------

class LeadCreate(BaseModel):
    client_name: str
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    address: Optional[str] = None
    source: Optional[str] = None
    status: LeadStatusEnum = LeadStatusEnum.new
    notes: Optional[str] = None
    contacts: List[LeadContactCreate] = []


class LeadUpdate(BaseModel):
    client_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    address: Optional[str] = None
    source: Optional[str] = None
    status: Optional[LeadStatusEnum] = None
    notes: Optional[str] = None
    owner_id: Optional[str] = None  # super admin can reassign
    contacts: Optional[List[LeadContactCreate]] = None


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    client_name: str
    contact_person: Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str]
    address: Optional[str]
    source: Optional[str]
    status: LeadStatusEnum
    notes: Optional[str]
    owner_id: str
    owner_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    open_followups: int = 0
    next_action_date: Optional[date] = None
    contacts: List[LeadContactOut] = []


# ---------- Follow-ups ----------

class FollowUpCreate(BaseModel):
    lead_id: str
    note: str
    follow_up_date: date
    next_action_date: Optional[date] = None
    completed: bool = False


class FollowUpUpdate(BaseModel):
    note: Optional[str] = None
    follow_up_date: Optional[date] = None
    next_action_date: Optional[date] = None
    completed: Optional[bool] = None


class FollowUpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    lead_id: str
    lead_client_name: Optional[str] = None
    user_id: str
    user_name: Optional[str] = None
    note: str
    follow_up_date: date
    next_action_date: Optional[date]
    completed: bool
    created_at: datetime


# ---------- Activity ----------

class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    user_name: Optional[str] = None
    lead_id: Optional[str]
    lead_client_name: Optional[str] = None
    action_type: ActionTypeEnum
    description: str
    created_at: datetime


# ---------- Analytics ----------

class StatusCount(BaseModel):
    status: str
    count: int


class AnalyticsSummary(BaseModel):
    total_leads: int
    new_leads: int
    contacted: int
    qualified: int
    closed: int
    conversion_rate: float
    overdue_followups: int
    followup_completion_rate: float

class TimePoint(BaseModel):
    label: str
    count: int

class LocationCount(BaseModel):
    location: str
    total: int
    new: int
    contacted: int
    qualified: int
    closed: int

class AnalyticsDashboard(BaseModel):
    summary: AnalyticsSummary
    leads_over_time: List[TimePoint]
    status_distribution: List[StatusCount]
    location_breakdown: List[LocationCount]
    upcoming_followups: List[FollowUpOut]
    followup_activity: List[TimePoint]

# ---------- Dashboards ----------

class UserBreakdown(BaseModel):
    user_id: str
    user_name: str
    total_leads: int
    new: int
    contacted: int
    qualified: int
    closed: int
    overdue_followups: int
    followups_this_week: int


class DailyActivityPoint(BaseModel):
    date: str
    count: int


class AdminDashboard(BaseModel):
    total_leads: int
    total_users: int
    leads_by_status: List[StatusCount]
    overdue_followups: int
    followups_completed_rate: float
    daily_activity: List[DailyActivityPoint]
    user_breakdown: List[UserBreakdown]
    recent_activity: List[ActivityOut]


class UserDashboard(BaseModel):
    total_leads: int
    leads_by_status: List[StatusCount]
    conversion_rate: float
    pending_followups: int
    overdue_followups: int
    activity_this_week: int
    recent_activity: List[ActivityOut]
    upcoming_followups: List[FollowUpOut]

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Boolean, DateTime, ForeignKey, Text, Enum, Date, Integer
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .database import Base


def gen_uuid():
    return str(uuid.uuid4())


class RoleEnum(str, enum.Enum):
    super_admin = "super_admin"
    user = "user"


class LeadStatusEnum(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    qualified = "qualified"
    closed = "closed"


class PriorityEnum(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"
    other = "other"


class ActionTypeEnum(str, enum.Enum):
    lead_created = "lead_created"
    lead_updated = "lead_updated"
    status_changed = "status_changed"
    followup_logged = "followup_logged"
    followup_completed = "followup_completed"
    user_created = "user_created"
    user_deactivated = "user_deactivated"
    user_activated = "user_activated"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum(RoleEnum), nullable=False, default=RoleEnum.user)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    leads = relationship("Lead", back_populates="owner", foreign_keys="Lead.owner_id")
    followups = relationship("FollowUp", back_populates="user")
    activities = relationship("Activity", back_populates="user")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    client_name = Column(String(200), nullable=False)
    contact_person = Column(String(200), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    contact_email = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    source = Column(String(120), nullable=True)
    status = Column(Enum(LeadStatusEnum), nullable=False, default=LeadStatusEnum.new)
    notes = Column(Text, nullable=True)
    owner_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = relationship("User", back_populates="leads", foreign_keys=[owner_id])
    followups = relationship("FollowUp", back_populates="lead", cascade="all, delete-orphan")
    activities = relationship("Activity", back_populates="lead", cascade="all, delete-orphan")
    contacts = relationship("LeadContact", back_populates="lead", cascade="all, delete-orphan", order_by="LeadContact.created_at")


class LeadContact(Base):
    __tablename__ = "lead_contacts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    lead_id = Column(UUID(as_uuid=False), ForeignKey("leads.id"), nullable=False)
    name = Column(String(200), nullable=False)
    designation = Column(String(200), nullable=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    priority = Column(Enum(PriorityEnum), nullable=False, default=PriorityEnum.medium)
    solution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="contacts")


class FollowUp(Base):
    __tablename__ = "followups"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    lead_id = Column(UUID(as_uuid=False), ForeignKey("leads.id"), nullable=False)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    note = Column(Text, nullable=False)
    follow_up_date = Column(Date, nullable=False)      # date the follow-up happened
    next_action_date = Column(Date, nullable=True)     # when the next touch is due
    completed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="followups")
    user = relationship("User", back_populates="followups")


class Activity(Base):
    __tablename__ = "activities"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    lead_id = Column(UUID(as_uuid=False), ForeignKey("leads.id"), nullable=True)
    action_type = Column(Enum(ActionTypeEnum), nullable=False)
    description = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="activities")
    lead = relationship("Lead", back_populates="activities")

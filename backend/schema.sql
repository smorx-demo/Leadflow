-- LeadFlow database schema (PostgreSQL / Neon)
-- Note: the FastAPI app creates these automatically on startup via SQLAlchemy.
-- This file is provided for reference, manual setup, or migration tooling.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE role_enum AS ENUM ('super_admin', 'user');
CREATE TYPE lead_status_enum AS ENUM ('new', 'contacted', 'qualified', 'closed');
CREATE TYPE action_type_enum AS ENUM (
  'lead_created', 'lead_updated', 'status_changed',
  'followup_logged', 'followup_completed',
  'user_created', 'user_deactivated', 'user_activated'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role role_enum NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_name VARCHAR(200) NOT NULL,
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  source VARCHAR(120),
  status lead_status_enum NOT NULL DEFAULT 'new',
  notes TEXT,
  owner_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE lead_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  designation VARCHAR(200),
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE followups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  note TEXT NOT NULL,
  follow_up_date DATE NOT NULL,
  next_action_date DATE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  action_type action_type_enum NOT NULL,
  description VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lead_contacts_lead ON lead_contacts(lead_id);
CREATE INDEX idx_leads_owner ON leads(owner_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_followups_lead ON followups(lead_id);
CREATE INDEX idx_followups_next_action ON followups(next_action_date) WHERE completed = FALSE;
CREATE INDEX idx_activities_user ON activities(user_id);
CREATE INDEX idx_activities_created ON activities(created_at);

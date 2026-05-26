-- Add assigned_call_date to contacts for daily call list assignment (200/day)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_call_date DATE;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_call_date
  ON contacts(assigned_call_date);

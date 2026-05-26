-- Support manual call marking when Quo record is not found
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS manually_marked BOOLEAN DEFAULT FALSE;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS manual_notes TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS from_number TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS to_number TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS direction TEXT;

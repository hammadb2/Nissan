-- Add recording_url column to call_records for Quo call recordings
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS recording_url TEXT;

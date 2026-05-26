-- Blackout dates: days Hammad marks as unavailable for appointments
CREATE TABLE IF NOT EXISTS blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  reason TEXT,
  created_by TEXT NOT NULL DEFAULT 'hammad',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blackout_dates_date ON blackout_dates(date);

-- Objection handler entries
CREATE TABLE IF NOT EXISTS objection_handlers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  objection TEXT NOT NULL,
  what_it_means TEXT,
  say_this TEXT NOT NULL,
  never_say TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

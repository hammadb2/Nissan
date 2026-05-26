-- Call Intelligence Dashboard Schema

-- Customers table for pre-call recent buyer check
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  purchase_date DATE,
  vehicle_purchased TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Call records with AI analysis
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quo_call_id TEXT UNIQUE,
  agent_name TEXT DEFAULT 'Jea',
  customer_name TEXT,
  customer_phone TEXT,
  customer_id UUID REFERENCES customers(id),
  call_duration_seconds INTEGER,
  call_started_at TIMESTAMPTZ,
  call_ended_at TIMESTAMPTZ,

  -- Raw data from Quo webhooks
  transcript TEXT,
  quo_summary TEXT,

  -- AI-generated analysis
  ai_summary TEXT,
  crm_notes TEXT,
  next_action_type TEXT CHECK (next_action_type IN ('schedule_appointment', 'schedule_callback', 'send_email', 'no_action')),
  next_action_date TIMESTAMPTZ,
  next_action_details TEXT,
  coaching_positive TEXT,
  coaching_improvement TEXT,

  -- Recent buyer flag
  is_recent_buyer BOOLEAN DEFAULT FALSE,
  purchase_date DATE,

  -- Processing state
  transcript_received BOOLEAN DEFAULT FALSE,
  summary_received BOOLEAN DEFAULT FALSE,
  analyzed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily call targets
CREATE TABLE IF NOT EXISTS daily_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_date DATE UNIQUE DEFAULT CURRENT_DATE,
  target_calls INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly coaching reports
CREATE TABLE IF NOT EXISTS weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT DEFAULT 'Jea',
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  report_content TEXT,
  total_calls INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  recent_buyer_flags INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_name);
CREATE INDEX IF NOT EXISTS idx_calls_quo_id ON calls(quo_call_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_purchase ON customers(purchase_date);
CREATE INDEX IF NOT EXISTS idx_daily_targets_date ON daily_targets(target_date);

-- Full CRM & Call Intelligence System Schema
-- Replaces the initial schema with the complete system

-- Drop old tables (from initial schema)
DROP TABLE IF EXISTS weekly_reports CASCADE;
DROP TABLE IF EXISTS daily_targets CASCADE;
DROP TABLE IF EXISTS calls CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

-- 1. contacts — replaces customers table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  vehicle_year INTEGER,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_ownership_duration TEXT,
  is_recent_buyer BOOLEAN,
  do_not_call_until DATE,
  trade_in_available BOOLEAN,
  monthly_budget TEXT,
  interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold', 'not_interested')),
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  next_action TEXT CHECK (next_action IN ('callback', 'send_email', 'book_appointment', 'no_action')),
  next_action_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dnc', 'recent_buyer', 'appointment_booked', 'closed')),
  notes TEXT,
  import_batch TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. call_records — replaces calls table
CREATE TABLE call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  quo_call_id TEXT,
  duration_seconds INTEGER,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transcript TEXT,
  quo_summary TEXT,
  gpt_summary TEXT,
  crm_notes TEXT,
  next_action TEXT CHECK (next_action IN ('callback', 'send_email', 'book_appointment', 'no_action')),
  next_action_at TIMESTAMPTZ,
  next_action_details TEXT,
  coaching_tip TEXT,
  what_went_well TEXT,
  sentiment TEXT CHECK (sentiment IN ('warm', 'neutral', 'cold', 'hostile')),
  outcome TEXT CHECK (outcome IN ('booked', 'hot', 'callback', 'voicemail', 'no_answer', 'not_interested', 'dnc', 'wrong_number', 'recent_buyer')),
  is_recent_buyer_flag BOOLEAN DEFAULT FALSE,
  recent_buyer_flag_reason TEXT,
  interest_level TEXT CHECK (interest_level IN ('hot', 'warm', 'cold', 'not_interested')),
  vehicle_ownership_duration TEXT,
  trade_in_available BOOLEAN,
  monthly_budget TEXT,
  gpt_processed BOOLEAN DEFAULT FALSE,
  transcript_received BOOLEAN DEFAULT FALSE,
  summary_received BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. listings — Dann's marketplace vehicles
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_year INTEGER NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_trim TEXT,
  mileage INTEGER,
  price NUMERIC,
  colour TEXT,
  marketplace_url TEXT,
  listed_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'not_listed' CHECK (status IN ('not_listed', 'listed', 'needs_refresh', 'sold')),
  inquiry_count INTEGER DEFAULT 0,
  phone_numbers_collected INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  listing_id UUID REFERENCES listings(id),
  source TEXT NOT NULL CHECK (source IN ('outbound_call', 'marketplace', 'walk_in')),
  appointment_type TEXT NOT NULL CHECK (appointment_type IN ('in_person', 'phone_call')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  vehicle_interested TEXT,
  budget TEXT,
  trade_in BOOLEAN,
  showed_up BOOLEAN,
  closed BOOLEAN DEFAULT FALSE,
  commission_amount NUMERIC,
  notes TEXT,
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id),
  call_record_id UUID REFERENCES call_records(id),
  assigned_to TEXT NOT NULL CHECK (assigned_to IN ('jea', 'dann', 'hammad')),
  task_type TEXT NOT NULL CHECK (task_type IN ('callback', 'send_email', 'book_appointment', 'follow_up_no_show')),
  due_at TIMESTAMPTZ NOT NULL,
  details TEXT,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. daily_stats
CREATE TABLE daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('jea', 'dann')),
  calls_made INTEGER DEFAULT 0,
  calls_target INTEGER DEFAULT 200,
  appointments_booked INTEGER DEFAULT 0,
  hot_leads INTEGER DEFAULT 0,
  phone_numbers_collected INTEGER DEFAULT 0,
  listings_live INTEGER DEFAULT 0,
  listings_added INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, user_role)
);

-- 7. user_profiles — maps auth users to roles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('hammad', 'jea', 'dann')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_next_action_at ON contacts(next_action_at);
CREATE INDEX idx_contacts_interest_level ON contacts(interest_level);
CREATE INDEX idx_contacts_last_called_at ON contacts(last_called_at);
CREATE INDEX idx_call_records_contact ON call_records(contact_id);
CREATE INDEX idx_call_records_called_at ON call_records(called_at DESC);
CREATE INDEX idx_call_records_quo_id ON call_records(quo_call_id);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_appointments_scheduled ON appointments(scheduled_at);
CREATE INDEX idx_appointments_source ON appointments(source);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_due ON tasks(due_at);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_daily_stats_date ON daily_stats(date, user_role);

-- Row Level Security
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_profiles: users can read their own profile
CREATE POLICY "Users can read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Hammad sees everything
CREATE POLICY "Hammad full access contacts" ON contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

CREATE POLICY "Hammad full access call_records" ON call_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

CREATE POLICY "Hammad full access listings" ON listings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

CREATE POLICY "Hammad full access appointments" ON appointments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

CREATE POLICY "Hammad full access tasks" ON tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

CREATE POLICY "Hammad full access daily_stats" ON daily_stats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'hammad')
  );

-- Jea: can see contacts, her call records, her tasks
CREATE POLICY "Jea read contacts" ON contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
  );

CREATE POLICY "Jea update contacts" ON contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
  );

CREATE POLICY "Jea read call_records" ON call_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
  );

CREATE POLICY "Jea read own tasks" ON tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
    AND assigned_to = 'jea'
  );

CREATE POLICY "Jea update own tasks" ON tasks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
    AND assigned_to = 'jea'
  );

CREATE POLICY "Jea read own daily_stats" ON daily_stats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'jea')
    AND user_role = 'jea'
  );

-- Dann: can see listings, his appointments, his tasks
CREATE POLICY "Dann read listings" ON listings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'dann')
  );

CREATE POLICY "Dann read own appointments" ON appointments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'dann')
  );

CREATE POLICY "Dann read own tasks" ON tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'dann')
    AND assigned_to = 'dann'
  );

CREATE POLICY "Dann update own tasks" ON tasks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'dann')
    AND assigned_to = 'dann'
  );

CREATE POLICY "Dann read own daily_stats" ON daily_stats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'dann')
    AND user_role = 'dann'
  );

-- Service role bypass for webhooks and server-side operations
-- (service_role key bypasses RLS automatically in Supabase)

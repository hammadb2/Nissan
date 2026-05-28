-- Kijiji multi-account listing system

-- 1. kijiji_accounts — employee accounts for Kijiji posting
CREATE TABLE kijiji_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  listings_count INTEGER DEFAULT 0,
  max_listings INTEGER DEFAULT 10,
  last_posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. kijiji_listings — vehicle listings assigned to accounts
CREATE TABLE kijiji_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES kijiji_accounts(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES listings(id),
  autotrader_title TEXT NOT NULL,
  kijiji_title TEXT NOT NULL,
  kijiji_description TEXT NOT NULL,
  vehicle_year INTEGER NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_trim TEXT,
  mileage INTEGER,
  price NUMERIC,
  fuel_type TEXT,
  transmission TEXT,
  drivetrain TEXT,
  body_type TEXT,
  colour TEXT,
  features TEXT,
  autotrader_url TEXT,
  kijiji_status TEXT DEFAULT 'draft' CHECK (kijiji_status IN ('draft', 'posted', 'expired', 'removed', 'sold')),
  posted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  inquiry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. kijiji_inquiries — incoming leads from Kijiji
CREATE TABLE kijiji_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kijiji_listing_id UUID REFERENCES kijiji_listings(id) ON DELETE SET NULL,
  account_id UUID REFERENCES kijiji_accounts(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  message TEXT,
  source_email_subject TEXT,
  replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  reply_message TEXT,
  contact_id UUID REFERENCES contacts(id),
  appointment_id UUID REFERENCES appointments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_kijiji_listings_account ON kijiji_listings(account_id);
CREATE INDEX idx_kijiji_listings_status ON kijiji_listings(kijiji_status);
CREATE INDEX idx_kijiji_inquiries_listing ON kijiji_inquiries(kijiji_listing_id);
CREATE INDEX idx_kijiji_inquiries_account ON kijiji_inquiries(account_id);
CREATE INDEX idx_kijiji_inquiries_replied ON kijiji_inquiries(replied);

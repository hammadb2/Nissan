-- Facebook Marketplace automation system

-- 1. facebook_listings — vehicles queued / posted to Facebook Marketplace
CREATE TABLE facebook_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  listing_id_fb TEXT,
  vehicle_year INTEGER NOT NULL,
  vehicle_make TEXT NOT NULL,
  vehicle_model TEXT NOT NULL,
  vehicle_trim TEXT,
  mileage INTEGER,
  price NUMERIC,
  colour TEXT,
  transmission TEXT DEFAULT 'Automatic',
  fuel_type TEXT,
  features TEXT,
  description TEXT,
  image_urls TEXT[],
  fb_listing_url TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'generating', 'ready', 'posting', 'posted', 'failed', 'sold', 'updated')),
  compliance_passed BOOLEAN DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  updated_on_fb_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. facebook_conversations — buyer conversation threads
CREATE TABLE facebook_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fb_conversation_id TEXT NOT NULL UNIQUE,
  buyer_name TEXT,
  buyer_profile_url TEXT,
  buyer_profile_info JSONB,
  listing_id UUID REFERENCES facebook_listings(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'replied', 'booked', 'cold', 'needs_human')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  message_count INTEGER DEFAULT 0,
  ai_sequence_step INTEGER DEFAULT 0,
  extracted_phone TEXT,
  extracted_budget TEXT,
  extracted_trade_in BOOLEAN,
  extracted_timeline TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. facebook_messages — individual messages in conversations
CREATE TABLE facebook_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES facebook_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_body TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  sent_by TEXT DEFAULT 'ai' CHECK (sent_by IN ('ai', 'human')),
  fb_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. facebook_alerts — safety alerts for the dashboard
CREATE TABLE facebook_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('warning_popup', 'restriction', 'shadow_ban', 'posting_error', 'rate_limit')),
  message TEXT NOT NULL,
  listing_id UUID REFERENCES facebook_listings(id) ON DELETE SET NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_fb_listings_status ON facebook_listings(status);
CREATE INDEX idx_fb_listings_listing_id ON facebook_listings(listing_id);
CREATE INDEX idx_fb_conversations_status ON facebook_conversations(status);
CREATE INDEX idx_fb_conversations_fb_id ON facebook_conversations(fb_conversation_id);
CREATE INDEX idx_fb_messages_conversation ON facebook_messages(conversation_id);
CREATE INDEX idx_fb_messages_direction ON facebook_messages(direction);
CREATE INDEX idx_fb_alerts_resolved ON facebook_alerts(resolved);

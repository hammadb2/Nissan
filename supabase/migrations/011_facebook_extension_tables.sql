-- New tables for Facebook Marketplace extension endpoints

-- 1. facebook_listing_errors — stores posting failures with screenshots
CREATE TABLE IF NOT EXISTS facebook_listing_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES facebook_listings(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  screenshot_base64 TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_listing_errors_listing ON facebook_listing_errors(listing_id);

-- 2. facebook_settings — global settings/flags for the extension
CREATE TABLE IF NOT EXISTS facebook_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings
INSERT INTO facebook_settings (key, value) VALUES
  ('facebook_paused', 'false'),
  ('last_inbox_check', '1970-01-01T00:00:00Z')
ON CONFLICT (key) DO NOTHING;

-- 3. facebook_extension_logs — audit trail for extension actions
CREATE TABLE IF NOT EXISTS facebook_extension_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_ext_logs_level ON facebook_extension_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_fb_ext_logs_occurred ON facebook_extension_logs(occurred_at);

-- 4. Add shadow_banned status to facebook_listings
ALTER TABLE facebook_listings DROP CONSTRAINT IF EXISTS facebook_listings_status_check;
ALTER TABLE facebook_listings ADD CONSTRAINT facebook_listings_status_check
  CHECK (status IN ('queued', 'generating', 'ready', 'posting', 'posted', 'failed', 'sold', 'updated', 'shadow_banned'));

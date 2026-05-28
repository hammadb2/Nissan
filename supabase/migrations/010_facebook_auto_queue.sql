-- Drop the FK to empty listings table, add kijiji_listing_id reference
ALTER TABLE facebook_listings DROP CONSTRAINT IF EXISTS facebook_listings_listing_id_fkey;
ALTER TABLE facebook_listings ADD COLUMN IF NOT EXISTS kijiji_listing_id UUID REFERENCES kijiji_listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fb_listings_kijiji_id ON facebook_listings(kijiji_listing_id);

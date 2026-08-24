-- ============================================================
-- Shopify webhooks: audit trail + uninstall/redaction handling
-- ============================================================
-- Adds the state needed to serve Shopify's mandatory compliance webhooks
-- (customers/data_request, customers/redact, shop/redact) and app/uninstalled.
-- ============================================================

-- ─── Stores: track uninstalls instead of deleting history ─────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;

COMMENT ON COLUMN stores.uninstalled_at IS
  'Set when app/uninstalled arrives. The access token is revoked by Shopify at '
  'that point and is nulled out here; the row is kept so past requests stay readable.';

COMMENT ON COLUMN stores.shopify_access_token IS
  'AES-256-GCM encrypted, prefixed "enc:v1:". See lib/crypto/tokens.ts. '
  'Legacy rows may still hold plaintext; decryptToken() tolerates both.';

-- ─── Webhook audit trail ──────────────────────────────────────────────────────
-- Compliance requires being able to show a data request or redaction was
-- received and acted on, so every delivery is recorded.
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,
  shop_domain TEXT,
  -- X-Shopify-Webhook-Id: stable across Shopify's retries, so it doubles as an
  -- idempotency key.
  webhook_id TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_webhook_id_key
  ON webhook_events (webhook_id)
  WHERE webhook_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_events_topic_idx
  ON webhook_events (topic, received_at DESC);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Writes happen only through the service role (the webhook route). Admins can
-- read the trail; nobody else sees it.
DROP POLICY IF EXISTS "Admins can view webhook events" ON webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON webhook_events FOR SELECT
  USING (public.current_user_role() = 'admin');

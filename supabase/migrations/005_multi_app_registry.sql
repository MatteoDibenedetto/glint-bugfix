-- ============================================================
-- Multi-app registry: one Shopify connector app per client
-- ============================================================
-- The app is distributed with Shopify's "custom distribution", which is
-- limited to a single store (or to the stores of a single Plus organization).
-- Reaching more than one client therefore means creating more than one app,
-- each with its own client_id / client_secret.
--
-- Until now those two values lived in SHOPIFY_API_KEY / SHOPIFY_API_SECRET,
-- so the whole backend could only ever talk to one app. This migration moves
-- them into a registry keyed by shop domain.
--
-- Note on ownership: the apps do NOT all live in Glint's Partner organization.
-- When a client is not part of our organization the app is created inside
-- THEIR organization, where we act as collaborators — hence partner_org_* on
-- client_orgs. Losing collaborator access means losing the ability to
-- regenerate install links or change app config; already-installed apps keep
-- working, since client_id and client_secret do not depend on that access.
-- ============================================================

-- Helper: true if the current user may CHANGE the registry. Staff can read it,
-- but only devs and admins write to it. store_manager is staff yet has no
-- business creating apps.
CREATE OR REPLACE FUNCTION public.current_user_is_dev()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'frontend_dev', 'backend_dev')
  )
$$;

-- ─── Client organizations ────────────────────────────────────────────────────
-- One row per commercial client. A Plus organization is ONE row covering many
-- stores, because a single custom app can serve every store in that
-- organization. A non-Plus client is one row with one store.
CREATE TABLE client_orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_plus BOOLEAN NOT NULL DEFAULT false,
  -- Partner/Dev organization that OWNS the apps for this client. Usually the
  -- client's own, not Glint's.
  partner_org_name TEXT,
  partner_org_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── The connector apps ──────────────────────────────────────────────────────
CREATE TABLE shopify_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES client_orgs(id) ON DELETE RESTRICT,
  -- Name of the Shopify CLI config file: shopify.app.<handle>.toml
  handle TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT 'read_themes,write_themes',
  -- NEXT_PUBLIC_APP_URL as it was when this app was last deployed. Kept per
  -- app so that a future domain change shows exactly which apps still point
  -- at the old one and need reconfiguring.
  app_url TEXT NOT NULL,
  partner_app_gid TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'configured', 'link_pending', 'installed', 'revoked')),
  -- Install links are signed by Shopify and expire, so this column holds a
  -- short-lived value, not a permanent one. Never treat a stored link as valid
  -- without checking install_link_expires_at.
  install_link TEXT,
  install_link_generated_at TIMESTAMPTZ,
  install_link_expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shopify_apps_org ON shopify_apps(org_id);

-- ─── Secrets, isolated ───────────────────────────────────────────────────────
-- Separate table because RLS is row-level, not column-level: keeping the
-- secret in shopify_apps would make it readable by anyone allowed to read a
-- row. This table has RLS enabled and NO policy at all, so every anon and
-- authenticated request is denied; only the service role (which bypasses RLS)
-- can read it, i.e. only server-side code.
-- Value is encrypted with TOKEN_ENCRYPTION_KEY via lib/crypto/tokens.ts.
CREATE TABLE shopify_app_secrets (
  app_id UUID PRIMARY KEY REFERENCES shopify_apps(id) ON DELETE CASCADE,
  client_secret_encrypted TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Which app serves which store ────────────────────────────────────────────
-- This mapping must exist BEFORE the first install: the OAuth callback has to
-- pick a client_secret to verify the HMAC with, and at that moment no row in
-- `stores` exists yet. Devs pre-assign the domain when they create the app.
--
-- UNIQUE on shop_domain enforces the invariant the whole credential lookup
-- rests on: a store is served by exactly one of our apps.
CREATE TABLE app_store_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL REFERENCES shopify_apps(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL UNIQUE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_app ON app_store_assignments(app_id);

-- ─── Link stores to the registry ─────────────────────────────────────────────
-- Denormalised for convenience in staff views; the authoritative lookup for
-- credentials is app_store_assignments, which exists before the store does.
ALTER TABLE stores ADD COLUMN org_id UUID REFERENCES client_orgs(id) ON DELETE SET NULL;
ALTER TABLE stores ADD COLUMN app_id UUID REFERENCES shopify_apps(id) ON DELETE SET NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE client_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_store_assignments ENABLE ROW LEVEL SECURITY;

-- Deliberately no policies: service role only. See comment above.
ALTER TABLE shopify_app_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read orgs" ON client_orgs
  FOR SELECT USING (public.current_user_is_staff());
CREATE POLICY "Devs manage orgs" ON client_orgs
  FOR ALL USING (public.current_user_is_dev());

CREATE POLICY "Staff read apps" ON shopify_apps
  FOR SELECT USING (public.current_user_is_staff());
CREATE POLICY "Devs manage apps" ON shopify_apps
  FOR ALL USING (public.current_user_is_dev());

CREATE POLICY "Staff read assignments" ON app_store_assignments
  FOR SELECT USING (public.current_user_is_staff());
CREATE POLICY "Devs manage assignments" ON app_store_assignments
  FOR ALL USING (public.current_user_is_dev());

-- ─── Seed: the clients we start from ─────────────────────────────────────────
-- Apps and secrets are NOT seeded here — migrations live in git, secrets do
-- not. Run scripts/backfill-first-app.mjs to register the existing app.
INSERT INTO client_orgs (name, is_plus, notes) VALUES
  ('Glint (test)', false, 'Internal test store, first app of the registry'),
  ('Rifo', false, NULL),
  ('Wycon Cosmetics', false, 'Plus status not confirmed — flip is_plus if the org covers several stores');

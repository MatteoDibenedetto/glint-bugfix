-- ============================================================
-- Staff sign-in with Google, restricted to Glint domains
-- ============================================================
-- Before this migration a profiles row could only be created by the Shopify
-- OAuth callback, so anyone without a Shopify store — i.e. every Glint
-- developer — could not exist in the system at all.
--
-- Google sign-in fills that gap. The domain restriction is enforced HERE, not
-- in the browser: Google's `hd` parameter is only a UI hint on the account
-- chooser and is trivially bypassed by crafting the authorize URL by hand.
-- This trigger runs inside the transaction that inserts into auth.users, so a
-- disallowed domain aborts account creation outright.
-- ============================================================

-- Keep in sync with lib/auth/staff-domains.ts
CREATE OR REPLACE FUNCTION public.staff_email_domains()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT ARRAY['glintcompany.com', 'tngp.it']
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signup_provider TEXT;
  email_domain TEXT;
  assigned_role TEXT;
BEGIN
  signup_provider := NEW.raw_app_meta_data ->> 'provider';
  email_domain := lower(split_part(NEW.email, '@', 2));

  IF signup_provider = 'google' THEN
    -- Reject non-Glint Google accounts. Raising here rolls back the auth.users
    -- insert, so no orphaned account is left behind.
    IF NOT (email_domain = ANY (public.staff_email_domains())) THEN
      RAISE EXCEPTION
        'Google sign-in is limited to Glint staff domains (got "%")', email_domain
        USING ERRCODE = 'check_violation';
    END IF;

    -- Domain membership is the trust boundary: anyone in the Google Workspace
    -- gets staff access. frontend_dev is the least-privileged staff role — it
    -- can review and deploy fixes but cannot manage roles or stores. An admin
    -- adjusts this from /admin/staff.
    assigned_role := 'frontend_dev';
  ELSE
    -- Merchants arriving through Shopify OAuth. Their email is the shop's
    -- email and may be any domain, so no restriction applies.
    assigned_role := 'client';
  END IF;

  INSERT INTO public.profiles (id, email, role, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    assigned_role,
    NULLIF(NEW.raw_user_meta_data ->> 'given_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'family_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- The trigger itself already exists from migration 001 and points at this
-- function; recreating it defensively keeps the migration self-contained.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

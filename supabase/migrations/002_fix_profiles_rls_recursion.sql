-- ============================================================
-- FIX: infinite recursion in profiles RLS policies
-- ============================================================
-- The "Admins can view all profiles" and "Staff can view all profiles"
-- policies on the profiles table query the profiles table itself, which
-- re-triggers RLS evaluation → infinite recursion (Postgres error 42P17).
--
-- Fix: SECURITY DEFINER helper functions that bypass RLS to read the
-- caller's role. These can then be used safely inside any policy.
-- ============================================================

-- Helper: returns role of the currently-authenticated user, bypassing RLS.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper: true if the current user has any staff role.
CREATE OR REPLACE FUNCTION public.current_user_is_staff()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'frontend_dev', 'backend_dev', 'store_manager')
  )
$$;

-- ─── Drop and recreate profiles policies without recursion ────────────────────
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "Staff can view all profiles"
  ON profiles FOR SELECT
  USING (public.current_user_is_staff());

-- Same recursion risk exists on UPDATE policies that reference profiles.
-- Find and fix the "Admins can update profiles" policy if present.
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles"
  ON profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

-- ─── Update other tables' policies to use helpers (cleaner + faster) ──────────
DROP POLICY IF EXISTS "Staff see all stores" ON stores;
CREATE POLICY "Staff see all stores"
  ON stores FOR SELECT
  USING (public.current_user_is_staff());

DROP POLICY IF EXISTS "Admins manage stores" ON stores;
CREATE POLICY "Admins manage stores"
  ON stores FOR ALL
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "Staff see all requests" ON bug_requests;
CREATE POLICY "Staff see all requests"
  ON bug_requests FOR SELECT
  USING (public.current_user_is_staff());

DROP POLICY IF EXISTS "Staff can update requests" ON bug_requests;
CREATE POLICY "Staff can update requests"
  ON bug_requests FOR UPDATE
  USING (public.current_user_is_staff());

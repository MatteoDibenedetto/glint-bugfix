-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'client'
    CHECK (role IN ('client', 'frontend_dev', 'backend_dev', 'store_manager', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STORES
-- ============================================================
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_domain TEXT NOT NULL UNIQUE,
  shop_name TEXT,
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  store_manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shopify_access_token TEXT, -- store encrypted in production
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BUG REQUESTS
-- ============================================================
CREATE TABLE bug_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  contact_email TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  -- AI classification
  fix_type TEXT DEFAULT 'unknown'
    CHECK (fix_type IN ('frontend', 'backend', 'unknown')),
  ai_classification_reason TEXT,
  -- workflow status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',         -- submitted, waiting for AI
      'ai_processing',   -- Claude is generating fix
      'ai_completed',    -- fix ready for review
      'in_review',       -- dev is reviewing
      'changes_requested', -- dev asked for clarification
      'approved',        -- fix approved, ready to deploy
      'deployed',        -- pushed to staging theme
      'rejected'         -- request rejected
    )),
  -- assignment
  assigned_dev_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- AI fix output: array of { file, original_content, modified_content, explanation }
  ai_fix_suggestion JSONB,
  -- approved fix (may differ from AI suggestion after manual edits)
  approved_fix JSONB,
  -- reviewer notes
  reviewer_notes TEXT,
  -- staging theme info after deploy
  staging_theme_id TEXT,
  staging_theme_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATION LOGS
-- ============================================================
CREATE TABLE notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bug_request_id UUID REFERENCES bug_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE bug_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- profiles: users see their own row; admins see all
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Staff can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'frontend_dev', 'backend_dev', 'store_manager')
    )
  );

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- stores: clients see their own; staff see all
CREATE POLICY "Clients see their stores"
  ON stores FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Staff see all stores"
  ON stores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'frontend_dev', 'backend_dev', 'store_manager')
    )
  );

CREATE POLICY "Admins manage stores"
  ON stores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- bug_requests: clients see their own; staff see all
CREATE POLICY "Clients see their requests"
  ON bug_requests FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "Clients can insert requests"
  ON bug_requests FOR INSERT
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "Staff see all requests"
  ON bug_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'frontend_dev', 'backend_dev', 'store_manager')
    )
  );

CREATE POLICY "Staff can update requests"
  ON bug_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'frontend_dev', 'backend_dev', 'store_manager')
    )
  );

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bug_requests_updated_at
  BEFORE UPDATE ON bug_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Conversation thread on a bug request
-- ============================================================
-- The workflow had a status for "changes_requested" but nowhere for the client
-- to answer, so asking a question ended the request instead of advancing it.
-- ============================================================

CREATE TABLE IF NOT EXISTS request_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bug_request_id UUID REFERENCES bug_requests(id) ON DELETE CASCADE NOT NULL,
  -- Kept when a profile is deleted so the thread stays readable.
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS request_messages_request_idx
  ON request_messages (bug_request_id, created_at);

-- Helper in the style of migration 002: SECURITY DEFINER so the policy can read
-- bug_requests without re-entering its own RLS.
CREATE OR REPLACE FUNCTION public.can_access_request(req_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bug_requests r
    WHERE r.id = req_id
      AND (r.client_id = auth.uid() OR public.current_user_is_staff())
  )
$$;

ALTER TABLE request_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can read the thread" ON request_messages;
CREATE POLICY "Participants can read the thread"
  ON request_messages FOR SELECT
  USING (public.can_access_request(bug_request_id));

-- author_id must be the caller: a participant cannot post as someone else.
DROP POLICY IF EXISTS "Participants can post to the thread" ON request_messages;
CREATE POLICY "Participants can post to the thread"
  ON request_messages FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND public.can_access_request(bug_request_id)
  );

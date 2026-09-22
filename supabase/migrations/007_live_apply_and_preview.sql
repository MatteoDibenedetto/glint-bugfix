-- ============================================================
-- Preview before approval, then apply to the published theme
-- ============================================================
-- The fix now lands on the live theme instead of being left on a copy for the
-- merchant to publish. Because that writes to the storefront customers are
-- looking at, two things are recorded: a preview the reviewer must be able to
-- open first, and the previous contents of every file touched.
--
-- staging_theme_id / staging_theme_name keep their names but change meaning:
-- they now hold the TEMPORARY preview theme, which is deleted once the fix is
-- applied to the live theme.
-- ============================================================

ALTER TABLE bug_requests ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE bug_requests ADD COLUMN IF NOT EXISTS live_backup JSONB;
ALTER TABLE bug_requests ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE bug_requests ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

COMMENT ON COLUMN bug_requests.staging_theme_id IS
  'Temporary preview theme carrying the proposed fix. Deleted after the fix is '
  'applied to the published theme.';

COMMENT ON COLUMN bug_requests.preview_url IS
  'Shareable ?preview_theme_id= link for the preview theme.';

COMMENT ON COLUMN bug_requests.live_backup IS
  'Contents of each touched file as they were on the published theme immediately '
  'before the fix was written, as [{file, content}]. content null means the file '
  'did not exist, so restoring it means deleting it. This is the rollback path: '
  'Shopify theme history does not reliably cover API writes.';

COMMENT ON COLUMN bug_requests.applied_at IS
  'When the fix was written to the published theme.';

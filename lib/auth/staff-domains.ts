/**
 * Email domains allowed to sign in as Glint staff via Google.
 *
 * This list is enforced in two places and both matter:
 *  - in Postgres, by handle_new_user (migration 004) — the authoritative check,
 *    because it runs inside the transaction that creates the user and cannot be
 *    reached from the browser at all;
 *  - here, in the OAuth callback — so a rejected sign-in produces a readable
 *    message instead of a raw database error.
 *
 * Keep the two in sync: the SQL copy lives in
 * supabase/migrations/004_staff_google_auth.sql.
 */
export const STAFF_EMAIL_DOMAINS = ['glintcompany.com', 'tngp.it'] as const

export function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return false
  return (STAFF_EMAIL_DOMAINS as readonly string[]).includes(domain)
}

/**
 * One-off backfill: move the single app that currently lives in
 * SHOPIFY_API_KEY / SHOPIFY_API_SECRET into the multi-app registry.
 *
 * Run once, after applying migration 005:
 *
 *   node --env-file=.env.local scripts/backfill-first-app.mjs
 *
 * Safe to re-run: an app already registered under the same client_id is left
 * alone. Pass --dry-run to see what would change without writing.
 *
 * Credentials are deliberately NOT in the migration — migrations are committed
 * to git, secrets are not.
 */

import { createClient } from '@supabase/supabase-js'
import { encryptToken } from '../lib/crypto/tokens.ts'

const dryRun = process.argv.includes('--dry-run')

// The store the existing app is installed on, and the org seeded by
// migration 005 that it belongs to.
const SHOP_DOMAIN = 'dibe-test-store-glint.myshopify.com'
const ORG_NAME = 'Glint (test)'
const HANDLE = 'glint-test'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const clientId = process.env.SHOPIFY_API_KEY
const clientSecret = process.env.SHOPIFY_API_SECRET
const appUrl = process.env.NEXT_PUBLIC_APP_URL

for (const [name, value] of [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ['SHOPIFY_API_KEY', clientId],
  ['SHOPIFY_API_SECRET', clientSecret],
  ['NEXT_PUBLIC_APP_URL', appUrl],
  ['TOKEN_ENCRYPTION_KEY', process.env.TOKEN_ENCRYPTION_KEY],
]) {
  if (!value) {
    console.error(`${name} must be set.`)
    process.exit(1)
  }
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const fail = (what, error) => {
  console.error(`${what}: ${error.message}`)
  process.exit(1)
}

// ─── Already done? ───────────────────────────────────────────────────────────

const { data: existing, error: existingError } = await supabase
  .from('shopify_apps')
  .select('id, handle')
  .eq('client_id', clientId)
  .maybeSingle()

if (existingError) fail('Could not read shopify_apps', existingError)

if (existing) {
  console.log(`App ${clientId} is already registered as "${existing.handle}". Nothing to do.`)
  process.exit(0)
}

// ─── The org seeded by migration 005 ─────────────────────────────────────────

const { data: org, error: orgError } = await supabase
  .from('client_orgs')
  .select('id')
  .eq('name', ORG_NAME)
  .maybeSingle()

if (orgError) fail('Could not read client_orgs', orgError)
if (!org) {
  console.error(`No client_orgs row named "${ORG_NAME}". Apply migration 005 first.`)
  process.exit(1)
}

if (dryRun) {
  console.log('[dry-run] would register:')
  console.log(`  app        ${HANDLE} (client_id ${clientId}) under org ${ORG_NAME}`)
  console.log(`  secret     encrypted, ${clientSecret.length} chars`)
  console.log(`  assignment ${SHOP_DOMAIN} -> ${HANDLE}`)
  process.exit(0)
}

// ─── Write ───────────────────────────────────────────────────────────────────

const { data: app, error: appError } = await supabase
  .from('shopify_apps')
  .insert({
    org_id: org.id,
    handle: HANDLE,
    client_id: clientId,
    app_url: appUrl,
    status: 'installed',
  })
  .select('id')
  .single()

if (appError) fail('Could not insert the app', appError)

const { error: secretError } = await supabase
  .from('shopify_app_secrets')
  .insert({ app_id: app.id, client_secret_encrypted: encryptToken(clientSecret) })

if (secretError) fail('Could not store the secret', secretError)

// The assignment is what OAuth and webhooks look up, so it has to exist even
// though this store is already installed.
const { error: assignmentError } = await supabase
  .from('app_store_assignments')
  .insert({ app_id: app.id, shop_domain: SHOP_DOMAIN })

if (assignmentError) fail('Could not insert the assignment', assignmentError)

const { error: storeError } = await supabase
  .from('stores')
  .update({ app_id: app.id, org_id: org.id })
  .eq('shop_domain', SHOP_DOMAIN)

if (storeError) fail('Could not link the store row', storeError)

console.log(`Registered "${HANDLE}" (${clientId}) and assigned ${SHOP_DOMAIN}.`)
console.log('SHOPIFY_API_KEY / SHOPIFY_API_SECRET are now only a fallback for the')
console.log('unused account-login flow; store OAuth reads the registry.')

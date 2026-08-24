/**
 * One-off backfill: encrypt any Shopify access tokens still stored in plaintext.
 *
 * Run once after setting TOKEN_ENCRYPTION_KEY:
 *
 *   node --env-file=.env.local scripts/reencrypt-store-tokens.mjs
 *
 * Safe to re-run: rows already carrying the "enc:v1:" prefix are skipped.
 * Pass --dry-run to see what would change without writing.
 */

import { createClient } from '@supabase/supabase-js'
import { encryptToken, isEncrypted } from '../lib/crypto/tokens.ts'

const dryRun = process.argv.includes('--dry-run')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  console.error(
    'TOKEN_ENCRYPTION_KEY must be set. Generate one with:\n' +
      '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  )
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: stores, error } = await supabase
  .from('stores')
  .select('id, shop_domain, shopify_access_token')

if (error) {
  console.error('Could not read stores:', error.message)
  process.exit(1)
}

let encrypted = 0
let skipped = 0
let empty = 0

for (const store of stores ?? []) {
  const token = store.shopify_access_token

  if (!token) {
    empty++
    continue
  }
  if (isEncrypted(token)) {
    skipped++
    continue
  }

  console.log(`${dryRun ? '[dry-run] would encrypt' : 'encrypting'} ${store.shop_domain}`)

  if (!dryRun) {
    const { error: updateError } = await supabase
      .from('stores')
      .update({ shopify_access_token: encryptToken(token) })
      .eq('id', store.id)

    if (updateError) {
      console.error(`  failed: ${updateError.message}`)
      process.exitCode = 1
      continue
    }
  }
  encrypted++
}

console.log(
  `\n${encrypted} ${dryRun ? 'to encrypt' : 'encrypted'}, ` +
    `${skipped} already encrypted, ${empty} without a token.`
)

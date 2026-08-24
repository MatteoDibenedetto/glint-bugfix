import crypto from 'crypto'

/**
 * Envelope encryption for Shopify access tokens at rest.
 *
 * Stored format: "enc:v1:" + base64(iv[12] || authTag[16] || ciphertext)
 * AES-256-GCM, so tampering with a stored value fails decryption rather than
 * yielding garbage.
 *
 * Values without the prefix are treated as legacy plaintext and returned as-is,
 * so the switch does not require a coordinated migration. Run
 * scripts/reencrypt-store-tokens.mjs to backfill.
 */

const PREFIX = 'enc:v1:'
const IV_BYTES = 12
const TAG_BYTES = 16

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes base64-encoded (got ${key.length} bytes)`
    )
  }
  return key
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptToken(plaintext: string): string {
  if (!plaintext) throw new Error('Refusing to encrypt an empty token')

  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
}

export function decryptToken(stored: string): string {
  // Legacy rows written before encryption was introduced.
  if (!isEncrypted(stored)) return stored

  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('Stored token is malformed (too short to contain iv + tag)')
  }

  const iv = raw.subarray(0, IV_BYTES)
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES)

  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv)
  decipher.setAuthTag(tag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key, or the stored value was tampered with.
    throw new Error(
      'Failed to decrypt stored Shopify token. Check that TOKEN_ENCRYPTION_KEY matches ' +
        'the key used to encrypt it.'
    )
  }
}

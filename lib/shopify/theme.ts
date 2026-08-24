import type { ShopifyTheme, ThemeFile } from '@/types'
import { shopifyGraphQL, assertNoUserErrors, ShopifyApiError } from './graphql'

/** Files we never write to, regardless of what a fix asks for. */
const PROTECTED_FILES = new Set([
  // Merchant's live theme settings — overwriting resets the storefront.
  'config/settings_data.json',
])

/** Top-level theme directories a fix is allowed to touch. */
const ALLOWED_DIRS = [
  'assets', 'blocks', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates',
]

// ─── Themes ──────────────────────────────────────────────────────────────────

const THEME_FIELDS = 'id name role processing processingFailed'

export async function getMainTheme(shop: string, token: string): Promise<ShopifyTheme> {
  const data = await shopifyGraphQL<{
    themes: { nodes: ShopifyTheme[] }
  }>(
    shop,
    token,
    `query MainTheme { themes(first: 1, roles: [MAIN]) { nodes { ${THEME_FIELDS} } } }`
  )

  const main = data.themes.nodes[0]
  if (!main) throw new ShopifyApiError('No published (MAIN) theme found on this store')
  return main
}

export async function getTheme(
  shop: string,
  token: string,
  themeId: string
): Promise<ShopifyTheme> {
  const data = await shopifyGraphQL<{ theme: ShopifyTheme | null }>(
    shop,
    token,
    `query Theme($id: ID!) { theme(id: $id) { ${THEME_FIELDS} } }`,
    { id: themeId }
  )
  if (!data.theme) throw new ShopifyApiError(`Theme ${themeId} not found`)
  return data.theme
}

/**
 * Duplicates a theme server-side. Shopify copies every file (including images
 * and fonts) itself — we never move file bytes through this app.
 *
 * The returned theme is usually still `processing`; call waitForThemeReady
 * before writing to it.
 */
export async function duplicateTheme(
  shop: string,
  token: string,
  sourceThemeId: string,
  newName: string
): Promise<ShopifyTheme> {
  const data = await shopifyGraphQL<{
    themeDuplicate: {
      newTheme: ShopifyTheme | null
      userErrors: { field?: string[] | null; message: string }[]
    }
  }>(
    shop,
    token,
    `mutation DuplicateTheme($id: ID!, $name: String) {
       themeDuplicate(id: $id, name: $name) {
         newTheme { ${THEME_FIELDS} }
         userErrors { field message }
       }
     }`,
    { id: sourceThemeId, name: newName }
  )

  assertNoUserErrors(data.themeDuplicate.userErrors, 'themeDuplicate failed')
  const theme = data.themeDuplicate.newTheme
  if (!theme) throw new ShopifyApiError('themeDuplicate returned no theme')
  return theme
}

/** Polls until the theme finishes processing. Throws on timeout or failure. */
export async function waitForThemeReady(
  shop: string,
  token: string,
  themeId: string,
  { timeoutMs = 120_000, intervalMs = 3_000 } = {}
): Promise<ShopifyTheme> {
  const deadline = Date.now() + timeoutMs
  let theme = await getTheme(shop, token, themeId)

  while (theme.processing) {
    if (theme.processingFailed) {
      throw new ShopifyApiError(`Theme ${themeId} failed to process on Shopify side`)
    }
    if (Date.now() >= deadline) {
      throw new ShopifyApiError(
        `Theme ${themeId} still processing after ${Math.round(timeoutMs / 1000)}s. ` +
          `The theme exists — retry the deploy to resume without duplicating again.`
      )
    }
    await new Promise((r) => setTimeout(r, intervalMs))
    theme = await getTheme(shop, token, themeId)
  }

  if (theme.processingFailed) {
    throw new ShopifyApiError(`Theme ${themeId} failed to process on Shopify side`)
  }
  return theme
}

// ─── Reading files ───────────────────────────────────────────────────────────

/**
 * Lists every filename in a theme without downloading any content.
 * Body is deliberately not requested — a theme's full contents would be
 * megabytes and would exceed the GraphQL payload limit.
 */
export async function listThemeFilenames(
  shop: string,
  token: string,
  themeId: string
): Promise<{ filename: string; contentType: string; size: number }[]> {
  const out: { filename: string; contentType: string; size: number }[] = []
  let after: string | null = null

  do {
    const data: {
      theme: {
        files: {
          nodes: { filename: string; contentType: string; size: number }[]
          pageInfo: { hasNextPage: boolean; endCursor: string | null }
        }
      } | null
    } = await shopifyGraphQL(
      shop,
      token,
      `query ThemeFilenames($id: ID!, $after: String) {
         theme(id: $id) {
           files(first: 250, after: $after) {
             nodes { filename contentType size }
             pageInfo { hasNextPage endCursor }
           }
         }
       }`,
      { id: themeId, after }
    )

    if (!data.theme) throw new ShopifyApiError(`Theme ${themeId} not found`)
    out.push(...data.theme.files.nodes)
    after = data.theme.files.pageInfo.hasNextPage ? data.theme.files.pageInfo.endCursor : null
  } while (after)

  return out
}

/**
 * Reads the full text content of specific theme files.
 * Content is never truncated — callers that need to bound size must drop whole
 * files rather than cut them, or they will corrupt the theme on write-back.
 */
export async function readThemeFiles(
  shop: string,
  token: string,
  themeId: string,
  filenames: string[]
): Promise<ThemeFile[]> {
  const out: ThemeFile[] = []

  // The `filenames` argument accepts at most 50 entries per request.
  for (let i = 0; i < filenames.length; i += 50) {
    const batch = filenames.slice(i, i + 50)
    const data = await shopifyGraphQL<{
      theme: {
        files: {
          nodes: {
            filename: string
            contentType: string
            checksumMd5: string | null
            size: number
            body: { content?: string } | null
          }[]
          userErrors: { code: string; filename: string }[]
        }
      } | null
    }>(
      shop,
      token,
      `query ThemeFiles($id: ID!, $filenames: [String!]) {
         theme(id: $id) {
           files(first: 50, filenames: $filenames) {
             nodes {
               filename
               contentType
               checksumMd5
               size
               body { ... on OnlineStoreThemeFileBodyText { content } }
             }
             userErrors { code filename }
           }
         }
       }`,
      { id: themeId, filenames: batch }
    )

    if (!data.theme) throw new ShopifyApiError(`Theme ${themeId} not found`)

    const readErrors = data.theme.files.userErrors ?? []
    if (readErrors.length) {
      throw new ShopifyApiError(
        `Could not read theme files: ${readErrors
          .map((e) => `${e.filename} (${e.code})`)
          .join(', ')}`
      )
    }

    out.push(
      ...data.theme.files.nodes.map((n) => ({
        filename: n.filename,
        content: n.body?.content ?? null,
        contentType: n.contentType,
        checksumMd5: n.checksumMd5,
        size: n.size,
      }))
    )
  }

  return out
}

// ─── Writing files ───────────────────────────────────────────────────────────

export async function writeThemeFiles(
  shop: string,
  token: string,
  themeId: string,
  files: { filename: string; content: string }[]
): Promise<string[]> {
  const written: string[] = []

  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20)
    const data = await shopifyGraphQL<{
      themeFilesUpsert: {
        upsertedThemeFiles: { filename: string }[] | null
        userErrors: { field?: string[] | null; message: string }[]
      }
    }>(
      shop,
      token,
      `mutation UpsertThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
         themeFilesUpsert(themeId: $themeId, files: $files) {
           upsertedThemeFiles { filename }
           userErrors { field message }
         }
       }`,
      {
        themeId,
        files: batch.map((f) => ({
          filename: f.filename,
          body: { type: 'TEXT', value: f.content },
        })),
      }
    )

    assertNoUserErrors(data.themeFilesUpsert.userErrors, 'themeFilesUpsert failed')
    written.push(...(data.themeFilesUpsert.upsertedThemeFiles ?? []).map((f) => f.filename))
  }

  return written
}

// ─── Applying a reviewed fix ─────────────────────────────────────────────────

/** Trailing-whitespace and CRLF differences are not meaningful changes. */
function normalizeContent(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\s+$/, '')
}

function assertWritableFilename(filename: string): void {
  if (filename.includes('..') || filename.startsWith('/')) {
    throw new ShopifyApiError(`Refusing to write suspicious path: ${filename}`)
  }
  if (PROTECTED_FILES.has(filename)) {
    throw new ShopifyApiError(`Refusing to overwrite protected file: ${filename}`)
  }
  const dir = filename.split('/')[0]
  if (!ALLOWED_DIRS.includes(dir)) {
    throw new ShopifyApiError(
      `Refusing to write outside theme directories (${ALLOWED_DIRS.join(', ')}): ${filename}`
    )
  }
}

export interface FixToApply {
  file: string
  original_content: string
  modified_content: string
}

/**
 * Verifies each fix against the theme's live content before writing.
 *
 * This is the guard that makes a full-file overwrite safe: if the content the
 * fix was derived from no longer matches what is on the theme, the fix is
 * rejected instead of silently amputating the file. It catches truncated model
 * input, hallucinated filenames, and fixes that went stale while in review.
 */
export async function verifyFixesAgainstTheme(
  shop: string,
  token: string,
  themeId: string,
  fixes: FixToApply[]
): Promise<void> {
  for (const fix of fixes) assertWritableFilename(fix.file)

  const live = await readThemeFiles(
    shop,
    token,
    themeId,
    fixes.map((f) => f.file)
  )
  const byName = new Map(live.map((f) => [f.filename, f]))

  for (const fix of fixes) {
    const current = byName.get(fix.file)
    const isNewFile = fix.original_content === ''

    if (isNewFile) {
      if (current) {
        throw new ShopifyApiError(
          `Fix for ${fix.file} claims to create a new file, but the file already ` +
            `exists on the theme. Regenerate the fix.`
        )
      }
      continue
    }

    if (!current) {
      throw new ShopifyApiError(
        `Fix targets ${fix.file}, which does not exist on the theme. Regenerate the fix.`
      )
    }
    if (current.content === null) {
      throw new ShopifyApiError(
        `Fix targets ${fix.file}, which is a binary file (${current.contentType}) and ` +
          `cannot be edited as text.`
      )
    }
    if (normalizeContent(current.content) !== normalizeContent(fix.original_content)) {
      throw new ShopifyApiError(
        `Fix for ${fix.file} was generated from different content than what is on the ` +
          `theme now (fix saw ${fix.original_content.length} chars, theme has ` +
          `${current.content.length}). Writing it would destroy the file. Regenerate the fix.`
      )
    }
  }
}

export interface ApplyFixOptions {
  /** Resume onto an already-duplicated staging theme instead of creating a new one. */
  existingThemeId?: string | null
  /** Called as soon as the staging theme exists, before the slow wait/verify steps. */
  onThemeCreated?: (theme: ShopifyTheme) => Promise<void> | void
}

export async function applyFixToStagingTheme(
  shop: string,
  token: string,
  fixes: FixToApply[],
  { existingThemeId = null, onThemeCreated }: ApplyFixOptions = {}
): Promise<ShopifyTheme> {
  let stagingTheme: ShopifyTheme

  if (existingThemeId) {
    stagingTheme = await getTheme(shop, token, existingThemeId)
    if (stagingTheme.role === 'MAIN') {
      throw new ShopifyApiError('Refusing to write to the published theme')
    }
  } else {
    const mainTheme = await getMainTheme(shop, token)
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
    stagingTheme = await duplicateTheme(shop, token, mainTheme.id, `[glint. fix] ${stamp}`)
    // Persist before the slow steps so a timeout is resumable, not orphaned.
    await onThemeCreated?.(stagingTheme)
  }

  await waitForThemeReady(shop, token, stagingTheme.id)
  await verifyFixesAgainstTheme(shop, token, stagingTheme.id, fixes)

  await writeThemeFiles(
    shop,
    token,
    stagingTheme.id,
    fixes.map((f) => ({ filename: f.file, content: f.modified_content }))
  )

  return stagingTheme
}

import { listThemeFilenames, readThemeFiles } from './theme'
import { pickFilesForFix } from '@/lib/anthropic/file-picker'
import type { ThemeFile } from '@/types'

/** Text-editable theme files we are willing to send to the model. */
const TEXT_EXTENSIONS = /\.(liquid|css|js|json)$/

/**
 * Compiled and minified bundles. They are text and they match the extensions
 * above, but they are machine output: enormous, unreadable, and never the right
 * place to apply a hand-written fix.
 */
const MINIFIED = /\.min\.(js|css)$/

/**
 * Largest single file we will send. A theme's compiled CSS or JS can run to
 * several hundred KB on its own — at roughly 4 characters per token one such
 * file is more input than the entire rest of the request.
 */
const MAX_FILE_BYTES = 50_000

/**
 * Total characters of theme source we will send in one request. Files that do
 * not fit are dropped whole and reported — never truncated, because the model
 * is shown these files as the exact current state of the theme.
 *
 * This was 600,000, which is ~150k tokens: a single request could fill the
 * context with theme source and cost more in input than the fix was worth.
 * Five files under the per-file cap fit comfortably in 80,000.
 */
const CONTENT_BUDGET_CHARS = 80_000

// Fewer files means less input to read and less for the model to weigh, which
// is the second lever on generation time. The triage pass ranks by likelihood,
// so the file that matters is normally in the first two or three.
const MAX_FILES = 5

export interface FileSelection {
  files: ThemeFile[]
  /** Files that were chosen but did not fit the character budget. */
  excluded: string[]
  /** How the choice was made, for the audit trail. */
  strategy: 'ai-triage' | 'keyword-fallback'
  /** The picker's stated reasoning, when AI triage was used. */
  reason?: string
}

/**
 * Fallback when triage is unavailable: score filenames against words in the
 * description. This rarely matches anything useful (descriptions are Italian,
 * paths are English), so it exists only so a picker outage degrades to
 * "something plausible" instead of failing the request.
 */
function keywordFallback(
  candidates: { filename: string }[],
  description: string
): string[] {
  const keywords = description
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)

  const scored = candidates
    .map((f) => ({
      filename: f.filename,
      score: keywords.filter((kw) => f.filename.toLowerCase().includes(kw)).length,
    }))
    .sort((a, b) => b.score - a.score)

  const picked: string[] = []
  if (candidates.some((c) => c.filename === 'layout/theme.liquid')) {
    picked.push('layout/theme.liquid')
  }
  for (const { filename } of scored) {
    if (picked.length >= MAX_FILES) break
    if (!picked.includes(filename)) picked.push(filename)
  }
  return picked
}

/**
 * Picks the theme files most likely to be relevant to a bug description, then
 * reads their full contents.
 *
 * Two passes: a cheap triage call chooses filenames from the theme manifest,
 * then only those files are read. Sending the whole theme is not an option
 * (megabytes), and choosing by keyword does not work, so the triage step is
 * what makes the fix step see the right code.
 */
export async function selectRelevantFiles(
  shop: string,
  token: string,
  themeId: string,
  description: string
): Promise<FileSelection> {
  const manifest = await listThemeFilenames(shop, token, themeId)

  const eligible = manifest.filter(
    (f) =>
      TEXT_EXTENSIONS.test(f.filename) &&
      !f.filename.startsWith('assets/vendor') &&
      !MINIFIED.test(f.filename)
  )

  // The manifest already carries every file's size, so oversized files can be
  // dropped before the picker ever sees them — cheaper than letting one get
  // chosen and then discarding it after it has been fetched.
  const candidates = eligible.filter((f) => f.size <= MAX_FILE_BYTES)
  const oversized = eligible
    .filter((f) => f.size > MAX_FILE_BYTES)
    .map((f) => `${f.filename} (${Math.round(f.size / 1024)}KB)`)

  if (oversized.length) {
    console.warn(
      `[file-selection] skipping ${oversized.length} file(s) over ` +
        `${MAX_FILE_BYTES / 1000}KB: ${oversized.join(', ')}`
    )
  }

  if (candidates.length === 0) {
    return { files: [], excluded: oversized, strategy: 'keyword-fallback' }
  }

  let picked: string[]
  let strategy: FileSelection['strategy'] = 'ai-triage'
  let reason: string | undefined

  try {
    const pick = await pickFilesForFix(description, candidates, MAX_FILES)
    picked = pick.filenames
    reason = pick.reason
    if (picked.length === 0) {
      throw new Error('triage returned no usable filenames')
    }
  } catch (err) {
    console.warn(
      '[file-selection] AI triage failed, falling back to keyword scoring:',
      err instanceof Error ? err.message : err
    )
    picked = keywordFallback(candidates, description)
    strategy = 'keyword-fallback'
    reason = undefined
  }

  const fetched = await readThemeFiles(shop, token, themeId, picked)

  // Preserve the picker's ordering so the most likely file leads the prompt.
  const byName = new Map(fetched.map((f) => [f.filename, f]))
  const ordered = picked.map((name) => byName.get(name)).filter((f): f is ThemeFile => !!f)

  // Apply the budget by dropping whole files, so one huge file cannot crowd out
  // everything else — and is never cut in half.
  const files: ThemeFile[] = []
  const excluded: string[] = [...oversized]
  let used = 0

  for (const f of ordered) {
    if (f.content === null) continue
    if (used + f.content.length > CONTENT_BUDGET_CHARS) {
      excluded.push(f.filename)
      continue
    }
    files.push(f)
    used += f.content.length
  }

  return { files, excluded, strategy, reason }
}

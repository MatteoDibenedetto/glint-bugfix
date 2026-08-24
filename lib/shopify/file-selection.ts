import { listThemeFilenames, readThemeFiles } from './theme'
import { pickFilesForFix } from '@/lib/anthropic/file-picker'
import type { ThemeFile } from '@/types'

/** Text-editable theme files we are willing to send to the model. */
const TEXT_EXTENSIONS = /\.(liquid|css|js|json)$/

/**
 * Total characters of theme source we will send in one request.
 * Files that do not fit are dropped whole and reported — never truncated,
 * because the model is asked to echo back exact file content.
 */
const CONTENT_BUDGET_CHARS = 600_000

const MAX_FILES = 8

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

  const candidates = manifest.filter(
    (f) => TEXT_EXTENSIONS.test(f.filename) && !f.filename.startsWith('assets/vendor')
  )

  if (candidates.length === 0) {
    return { files: [], excluded: [], strategy: 'keyword-fallback' }
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
  const excluded: string[] = []
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

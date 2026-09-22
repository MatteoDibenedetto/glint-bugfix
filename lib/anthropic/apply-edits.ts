/**
 * Applying anchored find/replace edits to a file.
 *
 * Split out from fix-generator so it can be exercised directly: this is the one
 * place where a subtle bug silently produces wrong file content instead of an
 * error, and wrong content is what gets deployed to a live theme.
 */

/** A single anchored replacement within one file. */
export interface ModelEdit {
  find: string
  replace: string
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type Location = { start: number; end: number } | 'none' | 'ambiguous'

/**
 * Finds the one place an edit applies.
 *
 * Exact match first. Failing that, a retry that treats every run of whitespace
 * as interchangeable: models reproduce code faithfully but reflow indentation,
 * and a rejected fix costs a full regeneration.
 *
 * Uniqueness is required either way. Applying an edit to the wrong one of two
 * matching regions is a silent corruption, which is far worse than an error a
 * reviewer can act on.
 *
 * Precedence matters: a unique exact match wins even when the whitespace-blind
 * pass would have found several candidates, because an exact quote is the
 * strongest anchor available. The residual risk is narrow but real — a model
 * that reflows the whitespace of its intended target can land exactly on a
 * differently-spaced neighbour, and the edit then applies to the wrong line.
 * Nothing here can distinguish that case; it is caught by the reviewer reading
 * the diff, which no fix can skip.
 */
export function locate(haystack: string, needle: string): Location {
  const first = haystack.indexOf(needle)
  if (first !== -1) {
    return haystack.indexOf(needle, first + 1) !== -1
      ? 'ambiguous'
      : { start: first, end: first + needle.length }
  }

  const words = needle.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'none'

  const matches = [...haystack.matchAll(new RegExp(words.map(escapeRegex).join('\\s+'), 'g'))]
  if (matches.length === 0) return 'none'
  if (matches.length > 1) return 'ambiguous'

  const m = matches[0]
  return { start: m.index, end: m.index + m[0].length }
}

export function applyEdits(file: string, original: string, edits: ModelEdit[]): string {
  if (edits.length === 0) {
    throw new Error(`Claude returned no edits for ${file}`)
  }

  // Sequential, over the content as it stands after earlier edits — so later
  // anchors are evaluated against what the reviewer will actually see.
  let content = original

  for (const [i, edit] of edits.entries()) {
    const label = `${file} (edit ${i + 1} of ${edits.length})`

    if (!edit.find) {
      throw new Error(`${label}: empty "find". Generate again.`)
    }

    const at = locate(content, edit.find)
    if (at === 'none') {
      throw new Error(
        `${label}: the quoted snippet is not in the file. Either it was copied ` +
          `from a different file or it was not copied verbatim. Generate again.`
      )
    }
    if (at === 'ambiguous') {
      throw new Error(
        `${label}: the quoted snippet appears more than once, so there is no way ` +
          `to tell which one to change. Generate again.`
      )
    }

    content = content.slice(0, at.start) + edit.replace + content.slice(at.end)
  }

  return content
}

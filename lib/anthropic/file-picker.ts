const MODEL = 'claude-opus-5'

/** Filenames are cheap to reason about; the fix itself is the expensive call. */
const MAX_MANIFEST_ENTRIES = 1500

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    filenames: {
      type: 'array',
      items: { type: 'string' },
    },
    reason: { type: 'string' },
  },
  required: ['filenames', 'reason'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are an expert Shopify theme developer triaging a bug report.

You are given a merchant's bug description and the complete list of files in their theme. Choose the files most likely to contain the cause of the bug, so a second step can read them and write a fix.

Rules:
- Return only filenames that appear verbatim in the provided list. Never invent or guess a path.
- Order them most-likely first.
- Return at most the requested number of files. Fewer is better than padding with irrelevant ones.
- Prefer the specific file that renders the affected element over generic layout files. Include layout/theme.liquid only if the bug plausibly involves global markup, scripts, or styles.
- Think about Shopify theme conventions: product page issues usually live in sections/ or snippets/ named for the feature, cart issues in cart templates and snippets, styling in assets/*.css.
- The description may be written in Italian.`

export interface FilePick {
  filenames: string[]
  reason: string
}

/**
 * First pass: pick which theme files are worth reading.
 *
 * Replaces keyword-matching against file paths, which effectively never matched
 * because bug descriptions are in Italian and theme paths are in English.
 */
export async function pickFilesForFix(
  description: string,
  manifest: { filename: string; size: number }[],
  maxFiles: number
): Promise<FilePick> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }

  const entries = manifest.slice(0, MAX_MANIFEST_ENTRIES)
  if (entries.length < manifest.length) {
    console.warn(
      `[file-picker] theme has ${manifest.length} text files; considering the first ${entries.length}`
    )
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const fileList = entries.map((f) => `${f.filename} (${f.size} bytes)`).join('\n')

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2_000,
    system: SYSTEM_PROMPT,
    output_config: {
      // Triage, not authorship — this does not need deep reasoning.
      effort: 'low',
      format: { type: 'json_schema', schema: PICK_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content:
          `## Bug report\n${description}\n\n` +
          `## Theme files (${entries.length})\n${fileList}\n\n` +
          `Choose at most ${maxFiles} files.`,
      },
    ],
  })

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to triage this request')
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const parsed = JSON.parse(textBlock.text) as FilePick

  // Drop anything not actually in the theme; the model is instructed not to
  // invent paths, but a hallucinated filename must not reach the read step.
  const known = new Set(entries.map((f) => f.filename))
  const filenames = parsed.filenames.filter((f) => known.has(f)).slice(0, maxFiles)

  return { filenames, reason: parsed.reason }
}

import type { FileFix, FixType, ThemeFile } from '@/types'
import { applyEdits, type ModelEdit } from './apply-edits'

const MODEL = 'claude-sonnet-5'

/**
 * Output budget. The model now returns small find/replace edits rather than
 * whole files, so the only thing that can still be large is the body of a
 * brand-new file. This is a ceiling, not a cost — only generated tokens are
 * billed — but keeping it tight surfaces a runaway response early.
 */
const MAX_TOKENS = 16_000

/**
 * Timing note: a run on a Horizon theme once took 275s — 8 files of context in,
 * a complete 17KB file echoed back out, against Vercel's 300s function cap.
 * Both halves of that have since been cut: file-selection caps the input, and
 * edits replaced the whole-file echo on the way out.
 *
 * If generation ever approaches the ceiling again, the real fix is to run it as
 * a background job and have the UI poll, which removes the limit entirely.
 */

interface GenerateFixResult {
  fixes: FileFix[]
  fix_type: FixType
  classification_reason: string
}

/**
 * What the model returns.
 *
 * It carries neither the original file nor the modified one. The original is
 * already on the server — those bytes came from the theme moments earlier — and
 * the modified version is derived by applying `edits` to it. A typical fix
 * touches a handful of lines, so this costs a few hundred output tokens where
 * echoing both copies of a 17KB file cost close to ten thousand.
 *
 * `find` doubles as the proof that the model is editing the file it named: text
 * quoted from the wrong file simply will not match, which is a stronger check
 * than comparing a file's first and last lines and costs nothing extra.
 */
interface ModelFix {
  file: string
  is_new_file: boolean
  edits: ModelEdit[]
  new_content: string
  explanation: string
}

/** Constrains the response shape, replacing regex extraction of JSON. */
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fix_type: { type: 'string', enum: ['frontend', 'backend'] },
    classification_reason: { type: 'string' },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          is_new_file: { type: 'boolean' },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                find: { type: 'string' },
                replace: { type: 'string' },
              },
              required: ['find', 'replace'],
              additionalProperties: false,
            },
          },
          new_content: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['file', 'is_new_file', 'edits', 'new_content', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['fix_type', 'classification_reason', 'fixes'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are an expert Shopify theme developer. Given a merchant's bug report and the current contents of the relevant theme files, produce the exact edits that fix the issue.

Classify the request as "frontend" (Liquid templates, CSS, JS, UI, layout) or "backend" (app logic, API integrations, webhooks, Shopify Functions).

Rules:
- Only modify files that appear in the provided theme files. Never invent a filename.
- Express each change as an entry in "edits": "find" is a snippet copied verbatim from the file as provided to you, and "replace" is what it becomes.
- "find" must appear EXACTLY ONCE in that file. Include enough surrounding lines to make it unique, but no more than that — a snippet that matches nothing, or matches twice, is rejected and the whole fix has to be generated again.
- Never return the whole file. Keep each "find" to the smallest unique region around the change.
- Use several edits for several separate changes in one file, rather than one large edit spanning them.
- Change as little as possible to fix the reported issue. Do not reformat, refactor, or tidy surrounding code.
- For an existing file: set is_new_file to false, fill "edits", and leave new_content empty.
- To create a new file: set is_new_file to true, put the complete file body in new_content, and leave "edits" empty.
- classification_reason must be written in Italian (the merchants are Italian).`

function buildUserMessage(description: string, themeFiles: ThemeFile[]): string {
  const filesContext = themeFiles
    .map((f) => `### FILE: ${f.filename}\n\`\`\`\n${f.content ?? ''}\n\`\`\``)
    .join('\n\n')

  return `## Bug report\n${description}\n\n## Current theme files\n${filesContext}`
}

function mockFix(description: string, themeFiles: ThemeFile[]): GenerateFixResult {
  const isFrontend = !/api|webhook|function|integraz|backend/i.test(description)
  const target = themeFiles.find((f) => f.filename.endsWith('.liquid')) ?? themeFiles[0]
  const original = target?.content ?? ''

  return {
    fix_type: isFrontend ? 'frontend' : 'backend',
    classification_reason: '[MOCK] Generazione simulata: ANTHROPIC_API_KEY non configurata.',
    fixes: [
      {
        file: target?.filename ?? 'layout/theme.liquid',
        original_content: original,
        modified_content:
          original + `\n\n<!-- [MOCK FIX] ${description.slice(0, 80)} -->`,
        explanation:
          '[MOCK] Fix simulato. Imposta ANTHROPIC_API_KEY per abilitare Claude.',
      },
    ],
  }
}

/**
 * A placeholder copied from .env.example is a non-empty string, so a plain
 * presence check treats it as configured and the failure only shows up as a 401
 * from the API. Checking the prefix turns that into an actionable message.
 */
function assertUsableApiKey(key: string): void {
  if (!key.startsWith('sk-ant-')) {
    throw new Error(
      'ANTHROPIC_API_KEY does not look like an Anthropic key (expected it to start ' +
        'with "sk-ant-"). It is probably still the placeholder from .env.example — ' +
        'get a real key at console.anthropic.com and set it in .env.local and in the ' +
        'Vercel environment variables.'
    )
  }
}

export async function generateThemeFix(
  description: string,
  themeFiles: ThemeFile[]
): Promise<GenerateFixResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // A mock fix is deployable content. Never let it reach a real theme silently.
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_MOCK_FIX !== '1') {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Refusing to generate a mock fix that could be ' +
          'deployed to a live theme. Set ALLOW_MOCK_FIX=1 outside production to use mocks.'
      )
    }
    return mockFix(description, themeFiles)
  }

  if (themeFiles.length === 0) {
    throw new Error('No theme files were provided to analyse')
  }

  assertUsableApiKey(process.env.ANTHROPIC_API_KEY)

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    thinking: { type: 'adaptive' },
    output_config: {
      // Thinking tokens are billed as output, so this is the main quality/cost
      // dial left on this call. 'medium' is the compromise; 'low' is materially
      // cheaper and fine for one-line CSS and markup fixes, 'high' earns its
      // cost on bugs that span files.
      effort: 'medium',
      format: { type: 'json_schema', schema: FIX_SCHEMA },
    },
    messages: [{ role: 'user', content: buildUserMessage(description, themeFiles) }],
  })

  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to generate a fix for this request')
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      `Response hit the ${MAX_TOKENS}-token output limit and is incomplete. ` +
        `Generate again, or narrow the request to fewer files.`
    )
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const result = JSON.parse(textBlock.text) as {
    fix_type: FixType
    classification_reason: string
    fixes: ModelFix[]
  }

  if (!result.fixes?.length) {
    throw new Error('Claude returned no file changes for this request')
  }

  const provided = new Map(themeFiles.map((f) => [f.filename, f.content ?? '']))

  // The model may only touch files we actually sent it.
  const unknown = result.fixes
    .filter((f) => !f.is_new_file && !provided.has(f.file))
    .map((f) => f.file)
  if (unknown.length) {
    throw new Error(
      `Claude proposed changes to files that were not provided: ${unknown.join(', ')}`
    )
  }

  // is_new_file skips the deploy step's comparison against the live theme, so a
  // file wrongly flagged as new would be overwritten unchecked. The flag
  // contradicting a file we demonstrably read is reason enough to stop.
  const falselyNew = result.fixes
    .filter((f) => f.is_new_file && provided.has(f.file))
    .map((f) => f.file)
  if (falselyNew.length) {
    throw new Error(
      `Claude marked existing files as new: ${falselyNew.join(', ')}. Generate again.`
    )
  }

  const fixes: FileFix[] = result.fixes.map((f) => {
    if (f.is_new_file) {
      return {
        file: f.file,
        original_content: '',
        modified_content: f.new_content,
        explanation: f.explanation,
      }
    }

    // original_content is byte-exact by construction: it is the copy the fix was
    // generated against, and what the deploy step compares to the live theme.
    const original = provided.get(f.file)!
    return {
      file: f.file,
      original_content: original,
      modified_content: applyEdits(f.file, original, f.edits),
      explanation: f.explanation,
    }
  })

  return {
    fixes,
    fix_type: result.fix_type,
    classification_reason: result.classification_reason,
  }
}

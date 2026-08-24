import type { FileFix, FixType, ThemeFile } from '@/types'

const MODEL = 'claude-opus-5'

/**
 * Generous output budget: a fix echoes back complete file contents, so a tight
 * limit truncates the response mid-file. Requests this large must stream or the
 * SDK hits its HTTP timeout.
 */
const MAX_TOKENS = 64_000

interface GenerateFixResult {
  fixes: FileFix[]
  fix_type: FixType
  classification_reason: string
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
          original_content: { type: 'string' },
          modified_content: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['file', 'original_content', 'modified_content', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['fix_type', 'classification_reason', 'fixes'],
  additionalProperties: false,
} as const

const SYSTEM_PROMPT = `You are an expert Shopify theme developer. Given a merchant's bug report and the current contents of the relevant theme files, produce the exact file modifications that fix the issue.

Classify the request as "frontend" (Liquid templates, CSS, JS, UI, layout) or "backend" (app logic, API integrations, webhooks, Shopify Functions).

Rules:
- Only modify files that appear in the provided theme files. Never invent a filename.
- original_content must be the byte-exact current content of the file as provided to you, complete and unmodified. It is compared against the live theme before anything is written, and any difference causes the fix to be rejected.
- modified_content must be the complete file with the fix applied — not a diff, not an excerpt.
- Include only files that actually need to change.
- Change as little as possible to fix the reported issue. Do not reformat, refactor, or tidy surrounding code.
- To create a new file, set original_content to an empty string.
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

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: {
      // Raise to 'xhigh' if fix quality on hard bugs is the bottleneck.
      effort: 'high',
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
      `Response hit the ${MAX_TOKENS}-token output limit and is incomplete. The theme ` +
        `files involved are too large to rewrite whole — narrow the request to fewer files.`
    )
  }

  const textBlock = message.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content')
  }

  const result = JSON.parse(textBlock.text) as {
    fix_type: FixType
    classification_reason: string
    fixes: FileFix[]
  }

  if (!result.fixes?.length) {
    throw new Error('Claude returned no file changes for this request')
  }

  // The model may only touch files we actually sent it.
  const provided = new Set(themeFiles.map((f) => f.filename))
  const unknown = result.fixes
    .filter((f) => f.original_content !== '' && !provided.has(f.file))
    .map((f) => f.file)
  if (unknown.length) {
    throw new Error(
      `Claude proposed changes to files that were not provided: ${unknown.join(', ')}`
    )
  }

  return {
    fixes: result.fixes,
    fix_type: result.fix_type,
    classification_reason: result.classification_reason,
  }
}

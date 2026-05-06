import type { FileFix, FixType } from '@/types'

interface GenerateFixResult {
  fixes: FileFix[]
  fix_type: FixType
  classification_reason: string
}

function mockFix(
  description: string,
  themeFiles: { key: string; content: string }[]
): GenerateFixResult {
  const isFrontend = !/api|webhook|function|integraz|backend/i.test(description)
  const targetFile = themeFiles.find((f) => f.key.endsWith('.liquid')) || themeFiles[0]

  const original = targetFile?.content || '<!-- file vuoto -->'
  const modified = original + `\n\n<!-- [MOCK FIX] Modifica generata per: ${description.slice(0, 80)} -->`

  return {
    fix_type: isFrontend ? 'frontend' : 'backend',
    classification_reason: isFrontend
      ? 'La richiesta riguarda elementi visivi del tema (MOCK — API key non configurata).'
      : 'La richiesta riguarda logica di backend o integrazioni (MOCK — API key non configurata).',
    fixes: [
      {
        file: targetFile?.key || 'layout/theme.liquid',
        original_content: original,
        modified_content: modified,
        explanation:
          '[MOCK] Questo è un fix simulato. Aggiungi ANTHROPIC_API_KEY in .env.local per abilitare Claude.',
      },
    ],
  }
}

export async function generateThemeFix(
  description: string,
  themeFiles: { key: string; content: string }[]
): Promise<GenerateFixResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return mockFix(description, themeFiles)
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const filesContext = themeFiles
    .map((f) => `### FILE: ${f.key}\n\`\`\`\n${f.content.slice(0, 4000)}\n\`\`\``)
    .join('\n\n')

  const systemPrompt = `You are an expert Shopify theme developer. Your job is to:
1. Analyze a bug/fix request from a merchant
2. Classify it as "frontend" (Liquid templates, CSS, JS, UI/layout) or "backend" (app logic, API integrations, webhooks, Shopify Functions)
3. Generate the exact file modifications needed to fix the issue

Respond ONLY with valid JSON matching this exact schema:
{
  "fix_type": "frontend" | "backend",
  "classification_reason": "one sentence explaining why this is frontend or backend",
  "fixes": [
    {
      "file": "path/to/file.liquid",
      "original_content": "the original file content",
      "modified_content": "the modified file content with the fix applied",
      "explanation": "what was changed and why"
    }
  ]
}

Rules:
- Only include files that actually need modification
- Provide the COMPLETE file content in original_content and modified_content (not just the diff)
- Be precise and minimal — change only what is needed
- If a fix requires creating a new file, set original_content to empty string
- classification_reason must be in Italian (the app is for Italian merchants)`

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: `## Fix Request\n${description}\n\n## Current Theme Files\n${filesContext}` }],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')

  const jsonMatch =
    content.text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    content.text.match(/(\{[\s\S]*\})/)

  if (!jsonMatch) throw new Error('No JSON found in AI response')

  const result = JSON.parse(jsonMatch[1] || jsonMatch[0])

  return {
    fixes: result.fixes as FileFix[],
    fix_type: result.fix_type as FixType,
    classification_reason: result.classification_reason as string,
  }
}

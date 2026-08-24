import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookHmac } from '@/lib/shopify/auth'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Single entry point for every Shopify webhook, dispatched on X-Shopify-Topic.
 * Point all four webhook URLs (app/uninstalled plus the three mandatory
 * compliance topics) at this path.
 *
 * Contract Shopify enforces:
 *  - HMAC is base64 HMAC-SHA256 over the RAW body, keyed with the app secret.
 *  - An invalid HMAC must return 401.
 *  - Anything outside 2xx counts as a failure and is retried.
 *  - Five-second budget for the whole request, so the work here stays minimal.
 */

type Topic =
  | 'app/uninstalled'
  | 'customers/data_request'
  | 'customers/redact'
  | 'shop/redact'

const HANDLED_TOPICS: Topic[] = [
  'app/uninstalled',
  'customers/data_request',
  'customers/redact',
  'shop/redact',
]

export async function POST(request: NextRequest) {
  // Must be the raw body — parsing and re-serialising changes the bytes and
  // breaks the signature.
  const rawBody = await request.text()

  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const secret = process.env.SHOPIFY_API_SECRET
  if (!secret) {
    console.error('[webhook] SHOPIFY_API_SECRET is not set')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    // Shopify requires 401 specifically for a bad HMAC.
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  const topic = request.headers.get('x-shopify-topic') as Topic | null
  const shopDomain = request.headers.get('x-shopify-shop-domain')
  const webhookId = request.headers.get('x-shopify-webhook-id')

  if (!topic) {
    return NextResponse.json({ error: 'Missing topic' }, { status: 400 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = rawBody ? JSON.parse(rawBody) : {}
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 })
  }

  const supabaseAdmin = await createAdminClient()

  // Record the delivery first. The unique index on webhook_id makes Shopify's
  // retries idempotent: a duplicate insert means we already have this event.
  const { error: insertError } = await supabaseAdmin.from('webhook_events').insert({
    topic,
    shop_domain: shopDomain,
    webhook_id: webhookId,
    payload,
  })

  if (insertError) {
    // 23505 = unique violation → already processed, acknowledge and stop.
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true })
    }
    console.error(`[webhook] failed to record ${topic}:`, insertError.message)
    return NextResponse.json({ error: 'Could not record webhook' }, { status: 500 })
  }

  if (!HANDLED_TOPICS.includes(topic)) {
    // Acknowledge unknown topics — retrying will not help.
    console.warn(`[webhook] unhandled topic: ${topic}`)
    return NextResponse.json({ ok: true, handled: false })
  }

  try {
    await handleTopic(supabaseAdmin, topic, shopDomain, payload)

    if (webhookId) {
      await supabaseAdmin
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('webhook_id', webhookId)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown'
    console.error(`[webhook] ${topic} handler failed:`, message)

    if (webhookId) {
      await supabaseAdmin
        .from('webhook_events')
        .update({ error: message })
        .eq('webhook_id', webhookId)
    }

    // Non-2xx so Shopify retries.
    return NextResponse.json({ error: 'Handler failed', detail: message }, { status: 500 })
  }
}

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>

async function handleTopic(
  supabaseAdmin: AdminClient,
  topic: Topic,
  shopDomain: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  switch (topic) {
    case 'app/uninstalled': {
      // Shopify has already revoked the token; drop our copy so nothing tries
      // to use it, but keep the row so past requests remain readable.
      const domain = shopDomain ?? (payload.domain as string | undefined)
      if (!domain) throw new Error('app/uninstalled without a shop domain')

      const { error } = await supabaseAdmin
        .from('stores')
        .update({ shopify_access_token: null, uninstalled_at: new Date().toISOString() })
        .eq('shop_domain', domain)
      if (error) throw new Error(error.message)
      return
    }

    case 'customers/data_request':
    case 'customers/redact': {
      // This app stores no customer personal data: only staff/merchant profiles,
      // bug reports, and theme file contents. Nothing to export or erase, so
      // recording the request in webhook_events is the whole obligation.
      return
    }

    case 'shop/redact': {
      // 48h after uninstall. Erase the shop's data: deleting the store cascades
      // to its bug_requests (and their notification_logs).
      const domain = (payload.shop_domain as string | undefined) ?? shopDomain
      if (!domain) throw new Error('shop/redact without a shop domain')

      const { error } = await supabaseAdmin.from('stores').delete().eq('shop_domain', domain)
      if (error) throw new Error(error.message)
      return
    }
  }
}

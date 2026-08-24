import { shopifyGraphQL } from './graphql'

/**
 * Registers the app/uninstalled webhook for a shop.
 *
 * The three mandatory compliance webhooks (customers/data_request,
 * customers/redact, shop/redact) are NOT registered here — Shopify only accepts
 * those from the app's configuration, not from the API. See README.
 *
 * Registration is best-effort: a failure here must never block a merchant from
 * logging in, so this logs and returns instead of throwing. Re-registering an
 * identical topic + URI is a no-op on Shopify's side, so calling it on every
 * OAuth completion is safe.
 */
export async function ensureAppUninstalledWebhook(
  shop: string,
  token: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.warn('[webhooks] NEXT_PUBLIC_APP_URL not set; skipping registration')
    return
  }

  const uri = `${appUrl}/api/webhooks/shopify`

  try {
    const data = await shopifyGraphQL<{
      webhookSubscriptionCreate: {
        webhookSubscription: { id: string } | null
        userErrors: { field?: string[] | null; message: string }[]
      }
    }>(
      shop,
      token,
      `mutation RegisterUninstall($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
         webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
           webhookSubscription { id }
           userErrors { field message }
         }
       }`,
      { topic: 'APP_UNINSTALLED', sub: { uri, format: 'JSON' } }
    )

    const { webhookSubscription, userErrors } = data.webhookSubscriptionCreate

    if (userErrors?.length) {
      // "has already been taken" just means it is already registered.
      console.warn(
        `[webhooks] app/uninstalled for ${shop}: ` +
          userErrors.map((e) => e.message).join('; ')
      )
      return
    }

    console.log(
      `[webhooks] app/uninstalled registered for ${shop} (${webhookSubscription?.id})`
    )
  } catch (err) {
    console.error(
      `[webhooks] could not register app/uninstalled for ${shop}:`,
      err instanceof Error ? err.message : err
    )
  }
}

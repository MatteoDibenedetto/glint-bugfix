/**
 * Shared transport for the Shopify GraphQL Admin API.
 *
 * The REST Admin API is legacy and is not permitted for new public apps
 * (Shopify, April 2025), so everything this app does against a store goes
 * through here.
 */

export const SHOPIFY_API_VERSION = '2026-07'

export class ShopifyApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShopifyApiError'
  }
}

interface GraphQLResponse<T> {
  data?: T
  errors?: { message: string }[]
}

export async function shopifyGraphQL<T>(
  shop: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    }
  )

  if (!res.ok) {
    throw new ShopifyApiError(
      `Shopify GraphQL HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`
    )
  }

  const json = (await res.json()) as GraphQLResponse<T>
  if (json.errors?.length) {
    throw new ShopifyApiError(
      `Shopify GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`
    )
  }
  if (!json.data) {
    throw new ShopifyApiError('Shopify GraphQL returned no data')
  }
  return json.data
}

/** Mutations report business-rule failures in `userErrors`, not in `errors`. */
export function assertNoUserErrors(
  errors: { field?: string[] | null; message: string }[] | undefined,
  context: string
): void {
  if (errors?.length) {
    throw new ShopifyApiError(
      `${context}: ${errors
        .map((e) => `${e.field?.join('.') ?? 'error'} — ${e.message}`)
        .join('; ')}`
    )
  }
}

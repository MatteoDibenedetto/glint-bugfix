import type { ShopifyTheme, ShopifyAsset } from '@/types'

const API_VERSION = '2024-10'

async function shopifyFetch(
  shop: string,
  token: string,
  path: string,
  options: RequestInit = {}
) {
  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}${path}`,
    {
      ...options,
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Shopify API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function listThemes(
  shop: string,
  token: string
): Promise<ShopifyTheme[]> {
  const data = await shopifyFetch(shop, token, '/themes.json')
  return data.themes
}

export async function getMainTheme(
  shop: string,
  token: string
): Promise<ShopifyTheme> {
  const themes = await listThemes(shop, token)
  const main = themes.find((t) => t.role === 'main')
  if (!main) throw new Error('No main theme found')
  return main
}

export async function listThemeAssets(
  shop: string,
  token: string,
  themeId: number
): Promise<ShopifyAsset[]> {
  const data = await shopifyFetch(shop, token, `/themes/${themeId}/assets.json`)
  return data.assets
}

export async function getThemeAsset(
  shop: string,
  token: string,
  themeId: number,
  assetKey: string
): Promise<ShopifyAsset> {
  const params = new URLSearchParams({ 'asset[key]': assetKey })
  const data = await shopifyFetch(
    shop,
    token,
    `/themes/${themeId}/assets.json?${params}`
  )
  return data.asset
}

export async function getRelevantThemeFiles(
  shop: string,
  token: string,
  themeId: number,
  description: string
): Promise<{ key: string; content: string }[]> {
  const assets = await listThemeAssets(shop, token, themeId)

  // Filter to text-based files most likely relevant to the fix description
  const textAssets = assets.filter((a) =>
    /\.(liquid|css|js|json)$/.test(a.key) &&
    !a.key.startsWith('assets/vendor')
  )

  // Score files by keyword relevance to the description
  const descLower = description.toLowerCase()
  const keywords = descLower.split(/\s+/).filter((w) => w.length > 3)

  const scored = textAssets
    .map((a) => {
      const keyLower = a.key.toLowerCase()
      const score = keywords.filter((kw) => keyLower.includes(kw)).length
      return { asset: a, score }
    })
    .sort((a, b) => b.score - a.score)

  // Always include layout/theme.liquid + top scoring files (max 8 total)
  const alwaysInclude = textAssets.filter((a) =>
    ['layout/theme.liquid', 'config/settings_schema.json'].includes(a.key)
  )
  const topFiles = scored.slice(0, 6).map((s) => s.asset)
  const seen = new Set<string>()
  const toFetch = [...alwaysInclude, ...topFiles]
    .filter((a) => seen.has(a.key) ? false : (seen.add(a.key), true))
    .slice(0, 8)

  const results = await Promise.all(
    toFetch.map(async (asset) => {
      try {
        const full = await getThemeAsset(shop, token, themeId, asset.key)
        return { key: asset.key, content: full.value || '' }
      } catch {
        return null
      }
    })
  )

  return results.filter(Boolean) as { key: string; content: string }[]
}

export async function duplicateTheme(
  shop: string,
  token: string,
  sourceThemeId: number,
  newName: string
): Promise<ShopifyTheme> {
  // Create new theme
  const created = await shopifyFetch(shop, token, '/themes.json', {
    method: 'POST',
    body: JSON.stringify({ theme: { name: newName, role: 'unpublished' } }),
  })
  const newTheme: ShopifyTheme = created.theme

  // Copy all assets from source to new theme
  const assets = await listThemeAssets(shop, token, sourceThemeId)
  const textAssets = assets.filter((a) =>
    /\.(liquid|css|js|json)$/.test(a.key)
  )

  // Copy in batches of 5 to avoid rate limits
  for (let i = 0; i < textAssets.length; i += 5) {
    const batch = textAssets.slice(i, i + 5)
    await Promise.all(
      batch.map(async (asset) => {
        try {
          const full = await getThemeAsset(shop, token, sourceThemeId, asset.key)
          if (full.value) {
            await updateThemeAsset(shop, token, newTheme.id, asset.key, full.value)
          }
        } catch {}
      })
    )
  }

  return newTheme
}

export async function updateThemeAsset(
  shop: string,
  token: string,
  themeId: number,
  assetKey: string,
  value: string
): Promise<ShopifyAsset> {
  const data = await shopifyFetch(shop, token, `/themes/${themeId}/assets.json`, {
    method: 'PUT',
    body: JSON.stringify({ asset: { key: assetKey, value } }),
  })
  return data.asset
}

export async function applyFixToStagingTheme(
  shop: string,
  token: string,
  fixes: { file: string; modified_content: string }[]
): Promise<ShopifyTheme> {
  const mainTheme = await getMainTheme(shop, token)
  const stagingName = `[glint. fix] ${new Date().toISOString().slice(0, 10)}`
  const stagingTheme = await duplicateTheme(shop, token, mainTheme.id, stagingName)

  await Promise.all(
    fixes.map((fix) =>
      updateThemeAsset(shop, token, stagingTheme.id, fix.file, fix.modified_content)
    )
  )

  return stagingTheme
}

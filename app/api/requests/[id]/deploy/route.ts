import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { applyFixToStagingTheme } from '@/lib/shopify/theme'
import { notifyClientDeployed, notifyStoreManager } from '@/lib/email/sender'
import type { Profile, BugRequest } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isStaff = profile && ['admin', 'frontend_dev', 'backend_dev'].includes(profile.role)
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: bugRequest, error } = await supabase
    .from('bug_requests')
    .select(`*, store:stores(*), client:profiles!client_id(*)`)
    .eq('id', id)
    .single()

  if (error || !bugRequest) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (bugRequest.status !== 'approved') {
    return NextResponse.json({ error: 'Request must be approved before deploying' }, { status: 409 })
  }

  const store = bugRequest.store
  if (!store?.shopify_access_token) {
    return NextResponse.json({ error: 'Store not connected' }, { status: 400 })
  }

  const fixesToApply = (bugRequest.approved_fix || bugRequest.ai_fix_suggestion) as {
    file: string
    modified_content: string
  }[]

  if (!fixesToApply || fixesToApply.length === 0) {
    return NextResponse.json({ error: 'No fix to deploy' }, { status: 400 })
  }

  try {
    const stagingTheme = await applyFixToStagingTheme(
      store.shop_domain,
      store.shopify_access_token,
      fixesToApply
    )

    const supabaseAdmin = await createAdminClient()
    await supabaseAdmin
      .from('bug_requests')
      .update({
        status: 'deployed',
        staging_theme_id: String(stagingTheme.id),
        staging_theme_name: stagingTheme.name,
      })
      .eq('id', id)

    // Notify client
    const clientEmail = bugRequest.contact_email
    await notifyClientDeployed(
      clientEmail,
      bugRequest as BugRequest,
      stagingTheme.name
    )
    await supabaseAdmin.from('notification_logs').insert({
      bug_request_id: id,
      email_to: clientEmail,
      notification_type: 'client_deployed',
    })

    // Notify store manager
    if (store.store_manager_id) {
      const { data: manager } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', store.store_manager_id)
        .single()

      if (manager) {
        await notifyStoreManager(manager as Profile, { ...bugRequest, status: 'deployed' } as BugRequest)
      }
    }

    return NextResponse.json({
      staging_theme_id: stagingTheme.id,
      staging_theme_name: stagingTheme.name,
    })
  } catch (err) {
    console.error('Deploy error:', err)
    return NextResponse.json({ error: 'Deploy failed. Check Shopify credentials.' }, { status: 500 })
  }
}

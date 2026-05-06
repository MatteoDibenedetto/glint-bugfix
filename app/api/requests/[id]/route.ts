import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bug_requests')
    .select(`
      *,
      client:profiles!client_id(id, email, first_name, last_name),
      store:stores(id, shop_domain, shop_name, shopify_access_token, store_manager_id),
      assigned_dev:profiles!assigned_dev_id(id, email, first_name, last_name)
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(
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

  const isStaff = profile && ['admin', 'frontend_dev', 'backend_dev', 'store_manager'].includes(profile.role)
  if (!isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const allowedFields = [
    'status', 'assigned_dev_id', 'reviewer_notes',
    'approved_fix', 'fix_type', 'ai_classification_reason',
  ]
  const updates: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) updates[field] = body[field]
  }

  const { data, error } = await supabase
    .from('bug_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

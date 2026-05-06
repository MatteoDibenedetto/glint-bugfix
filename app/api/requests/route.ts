import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  let query = supabase
    .from('bug_requests')
    .select(`
      *,
      client:profiles!client_id(id, email, first_name, last_name),
      store:stores(id, shop_domain, shop_name),
      assigned_dev:profiles!assigned_dev_id(id, email, first_name, last_name)
    `)
    .order('created_at', { ascending: false })

  if (profile?.role === 'client') {
    query = query.eq('client_id', user.id)
  } else if (profile?.role === 'store_manager') {
    // Store managers see requests for their stores
    const { data: managedStores } = await supabase
      .from('stores')
      .select('id')
      .eq('store_manager_id', user.id)
    const storeIds = (managedStores || []).map((s: { id: string }) => s.id)
    query = query.in('store_id', storeIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, description, store_id, contact_email } = body

  if (!title || !description || !store_id || !contact_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Verify the store belongs to this user
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .eq('id', store_id)
    .eq('owner_id', user.id)
    .single()

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('bug_requests')
    .insert({
      client_id: user.id,
      store_id,
      contact_email,
      title,
      description,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

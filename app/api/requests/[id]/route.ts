import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notifyClientChangesRequested, notifyClientRejected } from '@/lib/email/sender'
import type { BugRequest } from '@/types'

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
      store:stores(id, shop_domain, shop_name, store_manager_id),
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

  // Needed to tell a real transition from a no-op save, so the client is not
  // emailed twice for the same decision.
  const { data: before } = await supabase
    .from('bug_requests')
    .select('status')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('bug_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data.status !== before?.status) {
    await notifyClientOfStatus(data as BugRequest, id)
  }

  return NextResponse.json(data)
}

/**
 * Emails the client when a decision is taken on their request.
 *
 * `deployed` is not handled here — the deploy route sends that one once the
 * staging theme actually exists, which is the point at which the news is true.
 *
 * A failure here must not fail the request: the status change is already
 * committed, and rolling it back because an email bounced would be worse.
 */
async function notifyClientOfStatus(request: BugRequest, id: string): Promise<void> {
  const notes = request.reviewer_notes ?? ''

  try {
    let type: string
    if (request.status === 'changes_requested') {
      await notifyClientChangesRequested(request.contact_email, request, notes)
      type = 'client_changes_requested'
    } else if (request.status === 'rejected') {
      await notifyClientRejected(request.contact_email, request, notes)
      type = 'client_rejected'
    } else {
      return
    }

    const supabaseAdmin = await createAdminClient()
    await supabaseAdmin.from('notification_logs').insert({
      bug_request_id: id,
      email_to: request.contact_email,
      notification_type: type,
    })
  } catch (err) {
    console.error(
      `[requests/${id}] could not email the client about status ${request.status}:`,
      err instanceof Error ? err.message : err
    )
  }
}

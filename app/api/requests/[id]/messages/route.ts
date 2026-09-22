import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notifyNewMessage } from '@/lib/email/sender'
import type { BugRequest, Profile } from '@/types'

const STAFF_ROLES = ['admin', 'frontend_dev', 'backend_dev', 'store_manager']

/**
 * The conversation thread on a request.
 *
 * Row-level security decides who may read or post: a client sees only their own
 * requests, staff see all. This route adds what RLS cannot — moving the request
 * forward when the client answers, and notifying the other side.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('request_messages')
    .select('*, author:profiles!author_id(id, email, first_name, last_name, role)')
    .eq('bug_request_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await request.json()
  if (typeof body !== 'string' || !body.trim()) {
    return NextResponse.json({ error: 'Il messaggio non può essere vuoto' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profilo non trovato' }, { status: 403 })

  // RLS rejects a post to a request the caller cannot see, so no separate
  // ownership check is needed here.
  const { data: message, error } = await supabase
    .from('request_messages')
    .insert({ bug_request_id: id, author_id: user.id, body: body.trim() })
    .select('*, author:profiles!author_id(id, email, first_name, last_name, role)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const isStaff = STAFF_ROLES.includes(profile.role)
  const supabaseAdmin = await createAdminClient()

  const { data: bugRequest } = await supabaseAdmin
    .from('bug_requests')
    .select('*, assigned_dev:profiles!assigned_dev_id(id, email, first_name, last_name)')
    .eq('id', id)
    .single()

  if (!bugRequest) return NextResponse.json(message, { status: 201 })

  // A client answering a clarification hands the request back to the team.
  // Without this the request would sit in changes_requested forever, which is
  // what made asking a question a dead end.
  let newStatus: string | null = null
  if (!isStaff && bugRequest.status === 'changes_requested') {
    newStatus = 'in_review'
    await supabaseAdmin.from('bug_requests').update({ status: newStatus }).eq('id', id)
  }

  const authorLabel = isStaff
    ? 'glint.'
    : [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email

  // Notification failures must not lose the message, which is already stored.
  try {
    const recipient = isStaff
      ? bugRequest.contact_email
      : (bugRequest.assigned_dev as Profile | null)?.email

    if (recipient) {
      await notifyNewMessage(recipient, bugRequest as BugRequest, body.trim(), {
        authorLabel,
        toStaff: !isStaff,
      })
      await supabaseAdmin.from('notification_logs').insert({
        bug_request_id: id,
        email_to: recipient,
        notification_type: isStaff ? 'message_to_client' : 'message_to_staff',
      })
    } else if (!isStaff) {
      console.warn(`[messages] ${id}: client replied but no dev is assigned; nobody notified`)
    }
  } catch (err) {
    console.error(
      `[messages] ${id}: could not send notification:`,
      err instanceof Error ? err.message : err
    )
  }

  return NextResponse.json({ ...message, new_status: newStatus }, { status: 201 })
}

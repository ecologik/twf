// notify-signup: emails the approvers (public.signup_approvers with
// receives_emails = true) when someone new signs in and is waiting for access.
//
// Called by the on_auth_user_created trigger with { user_id }. Deployed with
// --no-verify-jwt because the database calls it without a user token. That is
// safe: it only ever emails about a user who is really pending and hasn't been
// emailed about yet, so calling it by hand can't send anything extra.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   SENDGRID_API_KEY  SendGrid API key with "Mail Send" permission
//   NOTIFY_FROM       sender address on TWF's authenticated SendGrid domain,
//                     e.g. noreply@<twf-domain>
//   NOTIFY_FROM_NAME  optional display name (default "TWF Dashboard")
//   SITE_URL          e.g. https://twf.ecologik.net
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let userId: string | undefined
  try {
    userId = (await req.json())?.user_id
  } catch {
    return json({ error: 'bad body' }, 400)
  }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: 'user_id required' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Claim the notification atomically, so a retry never sends twice.
  const { data: profile, error: claimError } = await admin
    .from('profiles')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('role', 'pending')
    .is('notified_at', null)
    .select('email, full_name, created_at')
    .maybeSingle()

  if (claimError) return json({ error: claimError.message }, 500)
  if (!profile) return json({ skipped: 'not pending or already notified' })

  const { data: approvers, error: approverError } = await admin
    .from('signup_approvers')
    .select('email')
    .eq('receives_emails', true)

  if (approverError) return json({ error: approverError.message }, 500)
  const to = (approvers ?? []).map((a) => a.email)
  if (to.length === 0) return json({ skipped: 'no approvers set up' })
  if (!Deno.env.get('NOTIFY_FROM')) return json({ error: 'NOTIFY_FROM secret not set' }, 500)

  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://twf.ecologik.net').replace(/\/$/, '')
  const who = profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email
  const link = `${siteUrl}/admin/users`

  const subject = `New dashboard sign-up: ${profile.full_name ?? profile.email}`
  const text =
    `${who} signed in to the Watershed Foundation dashboard and is waiting for access.\n\n` +
    `Choose Admin (whole dashboard), Board (Board section only) or Deny here:\n${link}\n\n` +
    `They can't see anything until you choose.`
  const html =
    `<p><strong>${escapeHtml(who)}</strong> signed in to the Watershed Foundation dashboard and is waiting for access.</p>` +
    `<p>Choose <strong>Admin</strong> (whole dashboard), <strong>Board</strong> (Board section only) or <strong>Deny</strong>:</p>` +
    `<p><a href="${link}">Review sign-ups</a></p>` +
    `<p style="color:#666">They can't see anything until you choose.</p>`

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // One personalization per approver, so they don't see each other's address.
      personalizations: to.map((email) => ({ to: [{ email }] })),
      from: { email: Deno.env.get('NOTIFY_FROM'), name: Deno.env.get('NOTIFY_FROM_NAME') ?? 'TWF Dashboard' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    }),
  })

  if (!res.ok) {
    // Release the claim so a later call can try again.
    await admin.from('profiles').update({ notified_at: null }).eq('id', userId)
    return json({ error: `SendGrid ${res.status}: ${await res.text()}` }, 502)
  }

  return json({ sent: to.length })
})

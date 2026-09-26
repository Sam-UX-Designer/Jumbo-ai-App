/**
 * Making an account, with a straight answer.
 *
 * Supabase's own sign-up endpoint cannot give one. With email confirmation
 * on it refuses to say whether an address is already registered — it
 * answers success with a hollow user and sends nothing — because a sign-up
 * form that answers that question is a way to find out who has an account.
 * Sensible as a default, useless for telling somebody the truth about their
 * own account.
 *
 * This runs server-side with the service role, so it can ask the admin API
 * directly and get a real answer: the account exists, or it does not. The
 * person is told which, and a new account is created already confirmed so
 * they go straight into setting Jumbo up rather than out to an inbox.
 *
 * The trade: an address is not proven before it holds a record. That is the
 * deliberate choice behind this file. Turning `Confirm email` back on in the
 * dashboard does not undo it — deleting this function does, and the client
 * then falls back to `supabase.auth.signUp` on its own.
 *
 * `verify_jwt` is off, because somebody creating their first account has no
 * token yet. The gateway in front of this still requires the project's
 * publishable key, so the exposure is the same as Supabase's own public
 * sign-up route, and the service role key never leaves this function: it is
 * read from the platform environment and is never returned or logged.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'method' })

  let email = ''
  let password = ''
  try {
    const body = await req.json()
    email = String(body?.email ?? '').trim().toLowerCase()
    password = String(body?.password ?? '')
  } catch {
    return reply(400, { error: 'body' })
  }

  // The same rules the form applies, applied again here. A browser is not a
  // place to enforce anything.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply(400, { error: 'email' })
  if (password.length < 8) return reply(400, { error: 'password' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    // Straight in. See the note at the top of this file.
    email_confirm: true,
  })

  if (error) {
    const said = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase()
    if (/already|exists|registered|duplicate/.test(said)) return reply(409, { error: 'exists' })
    if (/password/.test(said)) return reply(400, { error: 'password' })
    // Nothing from the provider goes to the browser; the app has its own
    // wording for an unexplained failure.
    console.error('createUser failed', error)
    return reply(500, { error: 'failed' })
  }

  return reply(200, { ok: true })
})

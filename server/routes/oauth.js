import { Router } from 'express'
import { randomBytes, createHash } from 'node:crypto'
import { PROVIDERS, readiness, publicProvider, listProviders } from '../lib/providers.js'
import { env } from '../lib/env.js'
import {
  clearProvider, createSession, getSession, setProviderTokens, signState, updateSession, verifyState,
} from '../lib/store.js'

export const oauth = Router()

const COOKIE = 'jumbo_sid'
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.publicUrl.startsWith('https'),
  maxAge: 1000 * 60 * 60 * 24 * 90,
  path: '/',
}

async function sessionFrom(req, res) {
  let id = req.cookies?.[COOKIE]
  let s = await getSession(id)
  if (!s) {
    id = await createSession()
    res.cookie(COOKIE, id, cookieOpts)
    s = await getSession(id)
  }
  return s
}

const pkce = () => {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

/* ------------------------------------------------------------------ list */
oauth.get('/providers', async (req, res) => {
  const s = await sessionFrom(req, res)
  const connected = s.providers ?? {}
  res.json({
    providers: listProviders().map((p) => ({
      ...p,
      connection: connected[p.id]
        ? {
            status: 'connected',
            connectedAt: connected[p.id].connectedAt,
            lastSyncAt: connected[p.id].lastSyncAt,
            scope: connected[p.id].scope ?? null,
          }
        : null,
    })),
  })
})

/* --------------------------------------------------------------- connect */
oauth.post('/connect/:id', async (req, res) => {
  const { id } = req.params
  const provider = PROVIDERS[id]
  if (!provider) return res.status(404).json({ error: 'unknown_provider' })

  const r = readiness(id)

  if (provider.transport === 'native') {
    return res.status(501).json({
      error: 'native_only',
      provider: publicProvider(id),
      message: provider.why,
      docs: provider.docs,
    })
  }

  if (!r.ok) {
    return res.status(501).json({
      error: 'setup_required',
      provider: publicProvider(id),
      missing: r.missing,
      docs: provider.docs,
      note: provider.note ?? null,
      message: `Jumbo can complete this connection once ${r.missing.join(', ')} are set on the server.`,
    })
  }

  const s = await sessionFrom(req, res)
  const creds = env.providers[id]
  const redirectUri = `${env.publicUrl}/api/oauth/callback/${id}`
  const nonce = randomBytes(16).toString('base64url')
  const state = signState({ sid: s.id, provider: id, nonce, t: Date.now() })

  const url = new URL(provider.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', creds.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  if (provider.scopes.length) {
    url.searchParams.set('scope', provider.scopes.join(provider.scopeSeparator))
  }

  const pending = { ...(s.pending ?? {}) }
  if (provider.usesPkce) {
    const { verifier, challenge } = pkce()
    url.searchParams.set('code_challenge', challenge)
    url.searchParams.set('code_challenge_method', 'S256')
    pending[id] = { verifier, nonce }
  } else {
    pending[id] = { nonce }
  }
  await updateSession(s.id, { pending })

  res.json({ authorizeUrl: url.toString(), provider: publicProvider(id) })
})

/* -------------------------------------------------------------- callback */
oauth.get('/callback/:id', async (req, res) => {
  const { id } = req.params
  const provider = PROVIDERS[id]
  const fail = (reason) =>
    res.redirect(`${env.webOrigin}/?connect=${encodeURIComponent(id)}&status=error&reason=${encodeURIComponent(reason)}`)

  if (!provider || provider.transport !== 'oauth') return fail('unknown_provider')
  if (req.query.error) return fail(String(req.query.error))

  const parsed = verifyState(req.query.state)
  if (!parsed || parsed.provider !== id) return fail('bad_state')

  const s = await getSession(parsed.sid)
  if (!s) return fail('no_session')
  const pending = s.pending?.[id]
  if (!pending || pending.nonce !== parsed.nonce) return fail('state_mismatch')

  const creds = env.providers[id]
  const redirectUri = `${env.publicUrl}/api/oauth/callback/${id}`

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(req.query.code ?? ''),
    redirect_uri: redirectUri,
    client_id: creds.clientId,
  })
  if (provider.usesPkce && pending.verifier) body.set('code_verifier', pending.verifier)

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  // Withings takes the secret in the body; the others use HTTP Basic.
  if (id === 'withings') {
    body.set('action', 'requesttoken')
    body.set('client_secret', creds.clientSecret)
  } else {
    headers.Authorization =
      'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  }

  try {
    const r = await fetch(provider.tokenUrl, { method: 'POST', headers, body })
    const json = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error(`[oauth:${id}] token exchange failed`, r.status, json)
      return fail(`token_exchange_${r.status}`)
    }

    // Withings wraps its payload; everyone else returns it flat.
    const t = id === 'withings' ? (json.body ?? {}) : json
    if (!t.access_token) return fail('no_access_token')

    const nextPending = { ...(s.pending ?? {}) }
    delete nextPending[id]
    await updateSession(s.id, { pending: nextPending })
    await setProviderTokens(s.id, id, {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? Date.now() + Number(t.expires_in) * 1000 : null,
      scope: t.scope ?? null,
      externalUserId: t.user_id ?? t.userid ?? null,
    })

    res.redirect(`${env.webOrigin}/?connect=${encodeURIComponent(id)}&status=connected`)
  } catch (err) {
    console.error(`[oauth:${id}] token exchange threw`, err)
    fail('network_error')
  }
})

/* ------------------------------------------------------------ disconnect */
oauth.post('/disconnect/:id', async (req, res) => {
  const s = await sessionFrom(req, res)
  await clearProvider(s.id, req.params.id)
  res.json({ ok: true, provider: req.params.id })
})

/** Shared helper: a valid access token, refreshed if the provider allows it. */
export async function accessTokenFor(sid, id) {
  const s = await getSession(sid)
  const rec = s?.providers?.[id]
  if (!rec) return null
  if (!rec.expiresAt || rec.expiresAt - Date.now() > 60_000) return rec.accessToken
  if (!rec.refreshToken) return rec.accessToken

  const provider = PROVIDERS[id]
  const creds = env.providers[id]
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: rec.refreshToken,
    client_id: creds.clientId,
  })
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
  if (id === 'withings') {
    body.set('action', 'requesttoken')
    body.set('client_secret', creds.clientSecret)
  } else {
    headers.Authorization =
      'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
  }

  try {
    const r = await fetch(provider.tokenUrl, { method: 'POST', headers, body })
    const json = await r.json().catch(() => ({}))
    const t = id === 'withings' ? (json.body ?? {}) : json
    if (!r.ok || !t.access_token) return null
    await setProviderTokens(sid, id, {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? rec.refreshToken,
      expiresAt: t.expires_in ? Date.now() + Number(t.expires_in) * 1000 : null,
      scope: t.scope ?? rec.scope,
      externalUserId: rec.externalUserId,
    })
    return t.access_token
  } catch {
    return null
  }
}

export { sessionFrom, COOKIE }

import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env, has } from './lib/env.js'
import { listProviders } from './lib/providers.js'
import { oauth } from './routes/oauth.js'
import { health } from './routes/health.js'
import { ai } from './routes/ai.js'
import { youtube } from './routes/youtube.js'

/**
 * Jumbo's API, as a plain Express app with no listener of its own.
 *
 * `server/index.js` gives it a port for local development. On Vercel,
 * `api/index.js` hands it straight to the serverless runtime. One app, one
 * set of routes, no second implementation to keep in step.
 */
export const app = express()

// In production the web app and this API are served from the same origin, so
// there is no cross-origin request to permit. Locally they are on different
// ports, and only the configured web origin is allowed.
if (env.isProduction) {
  app.use(cors({ origin: env.webOrigin || true, credentials: true }))
} else {
  app.use(cors({ origin: env.webOrigin, credentials: true }))
}

app.use(cookieParser())
app.use(express.json({ limit: '12mb' }))

/**
 * The capability report. The client uses this to decide what it can honestly
 * offer, so it must never overstate what is configured — and it carries only
 * booleans and a model name. No key, and no part of one, ever crosses here.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    ai: {
      configured: has(env.geminiKey),
      model: has(env.geminiKey) ? env.geminiModel : null,
    },
    youtube: {
      // Explore works either way: with a key it searches all of YouTube,
      // without one it reads the curated creators' own public feeds.
      configured: true,
      searchEnabled: has(env.youtubeKey),
    },
    providers: listProviders(),
    publicUrl: env.publicUrl,
  })
})

app.get('/api/healthz', (_req, res) => res.json({ ok: true, at: Date.now() }))

app.use('/api/oauth', oauth)
app.use('/api/health', health)
app.use('/api/ai', ai)
app.use('/api/youtube', youtube)

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

/**
 * The last line of defence. An unhandled throw must never reach the browser
 * as a stack trace: it is logged for whoever runs the server, and the client
 * gets the same plain sentence it gets for any other failure.
 */
app.use('/api', (err, _req, res, _next) => {
  console.error('[api] unhandled:', err)
  res.status(500).json({ error: 'failed', message: 'Something went wrong on Jumbo’s side. Please try again.' })
})

/** What is switched on, for the local startup line. Never values. */
export function configuredSummary() {
  return [
    has(env.geminiKey) && 'Gemini',
    has(env.youtubeKey) && 'YouTube search',
    ...Object.entries(env.providers)
      .filter(([, c]) => has(c.clientId) && has(c.clientSecret))
      .map(([id]) => id),
  ].filter(Boolean)
}

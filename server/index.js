import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env, has } from './lib/env.js'
import { listProviders } from './lib/providers.js'
import { oauth } from './routes/oauth.js'
import { health } from './routes/health.js'
import { ai } from './routes/ai.js'
import { youtube } from './routes/youtube.js'

const app = express()

app.use(cors({ origin: env.webOrigin, credentials: true }))
app.use(cookieParser())
app.use(express.json({ limit: '12mb' }))

/**
 * The capability report. The client uses this to decide what it can honestly
 * offer, so it must never overstate what is configured.
 */
app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    ai: {
      configured: has(env.anthropicKey),
      model: has(env.anthropicKey) ? env.anthropicModel : null,
      missing: has(env.anthropicKey) ? [] : ['ANTHROPIC_API_KEY'],
    },
    youtube: {
      configured: has(env.youtubeKey),
      missing: has(env.youtubeKey) ? [] : ['YOUTUBE_API_KEY'],
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

app.listen(env.port, () => {
  const configured = [
    has(env.anthropicKey) && 'Claude',
    has(env.youtubeKey) && 'YouTube',
    ...Object.entries(env.providers)
      .filter(([, c]) => has(c.clientId) && has(c.clientSecret))
      .map(([id]) => id),
  ].filter(Boolean)

  console.log(`Jumbo API on ${env.publicUrl}`)
  console.log(configured.length
    ? `Configured: ${configured.join(', ')}`
    : 'Nothing configured yet. The app will run in demo mode and say so. See .env.example.')
})

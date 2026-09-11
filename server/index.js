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
    // Ask Jumbo runs on Gemini; meal photos, insights and Future run on
    // Claude. Only the booleans and the model name cross to the browser —
    // never a key, and never any part of one.
    ai: {
      configured: has(env.geminiKey),
      model: has(env.geminiKey) ? env.geminiModel : null,
      missing: has(env.geminiKey) ? [] : ['GEMINI_API_KEY'],
    },
    analysis: {
      configured: has(env.anthropicKey),
      model: has(env.anthropicKey) ? env.anthropicModel : null,
      missing: has(env.anthropicKey) ? [] : ['ANTHROPIC_API_KEY'],
    },
    youtube: {
      // Explore works either way: with a key it searches, without one it
      // reads the curated creators' own public feeds.
      configured: true,
      searchEnabled: has(env.youtubeKey),
      missing: [],
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
    has(env.geminiKey) && 'Gemini (Ask Jumbo)',
    has(env.anthropicKey) && 'Claude (insights, meals, Future)',
    has(env.youtubeKey) && 'YouTube search',
    ...Object.entries(env.providers)
      .filter(([, c]) => has(c.clientId) && has(c.clientSecret))
      .map(([id]) => id),
  ].filter(Boolean)

  console.log(`Jumbo API on ${env.publicUrl}`)
  console.log(configured.length
    ? `Configured: ${configured.join(', ')}`
    : 'Nothing configured yet. The app will run in demo mode and say so. See .env.example.')
  if (!has(env.youtubeKey)) {
    console.log('Explore is reading the curated creators’ public channel feeds (no key needed).')
  }
})

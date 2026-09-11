import { app, configuredSummary } from './app.js'
import { env, has } from './lib/env.js'

/**
 * Local development only. On Vercel the app is served by api/index.js as a
 * serverless function and nothing here runs.
 */
app.listen(env.port, () => {
  const configured = configuredSummary()
  console.log(`Jumbo API on ${env.publicUrl}`)
  console.log(configured.length
    ? `Configured: ${configured.join(', ')}`
    : 'Nothing configured yet. AI features will say they are unavailable. See .env.example.')
  if (!has(env.youtubeKey)) {
    console.log('Explore is reading the curated creators’ public channel feeds (no key needed).')
  }
})

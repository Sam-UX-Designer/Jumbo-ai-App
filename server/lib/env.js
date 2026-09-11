import 'dotenv/config'

/**
 * Every credential the app can use. Nothing here has a default value that
 * pretends to work: if a variable is missing, the feature that needs it
 * reports "setup required" to the client rather than faking a connection.
 */
/**
 * Where this deployment actually lives.
 *
 * On Vercel the web app and the API share one origin, and Vercel supplies the
 * hostname, so nothing has to be hard-coded per environment. PUBLIC_URL and
 * WEB_ORIGIN still win when set, which is how a custom domain is configured.
 */
const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)

// VERCEL_PROJECT_PRODUCTION_URL is the stable production hostname; VERCEL_URL
// is the per-deployment one, which is what a preview build should use.
const vercelHost = process.env.VERCEL_ENV === 'production'
  ? (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL)
  : process.env.VERCEL_URL
const vercelUrl = vercelHost ? `https://${vercelHost}` : ''

const localUrl = `http://localhost:${process.env.PORT || 8787}`

export const env = {
  isProduction,
  port: Number(process.env.PORT || 8787),
  publicUrl: process.env.PUBLIC_URL || vercelUrl || localUrl,
  // In production the browser is on the same origin as the API, so there is
  // no separate web origin to name unless a custom one is configured.
  webOrigin: process.env.WEB_ORIGIN || vercelUrl || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || '',

  // Jumbo's only AI provider. Server-side: never returned by /api/config,
  // never present in the client bundle, never logged.
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // Optional. Explore reads the curated creators' public feeds without it.
  youtubeKey: process.env.YOUTUBE_API_KEY || '',

  providers: {
    whoop: {
      clientId: process.env.WHOOP_CLIENT_ID || '',
      clientSecret: process.env.WHOOP_CLIENT_SECRET || '',
    },
    oura: {
      clientId: process.env.OURA_CLIENT_ID || '',
      clientSecret: process.env.OURA_CLIENT_SECRET || '',
    },
    fitbit: {
      clientId: process.env.FITBIT_CLIENT_ID || '',
      clientSecret: process.env.FITBIT_CLIENT_SECRET || '',
    },
    withings: {
      clientId: process.env.WITHINGS_CLIENT_ID || '',
      clientSecret: process.env.WITHINGS_CLIENT_SECRET || '',
    },
    garmin: {
      clientId: process.env.GARMIN_CLIENT_ID || '',
      clientSecret: process.env.GARMIN_CLIENT_SECRET || '',
      // Garmin's Health API is gated behind an approved developer programme and
      // its endpoints are issued with that approval, so they are not hard-coded
      // here. Supply them explicitly or the provider stays unavailable.
      authorizeUrl: process.env.GARMIN_AUTHORIZE_URL || '',
      tokenUrl: process.env.GARMIN_TOKEN_URL || '',
      apiBase: process.env.GARMIN_API_BASE || '',
    },
  },
}

export const has = (v) => typeof v === 'string' && v.trim().length > 0

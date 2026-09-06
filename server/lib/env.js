import 'dotenv/config'

/**
 * Every credential the app can use. Nothing here has a default value that
 * pretends to work: if a variable is missing, the feature that needs it
 * reports "setup required" to the client rather than faking a connection.
 */
export const env = {
  port: Number(process.env.PORT || 8787),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`,
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET || '',

  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5',

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

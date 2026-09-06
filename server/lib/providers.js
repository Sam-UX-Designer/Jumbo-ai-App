import { env, has } from './env.js'

/**
 * The real integration registry.
 *
 * `transport` is the honest part of this file:
 *   'oauth'  - a real OAuth 2.0 flow this server can complete end to end.
 *   'native' - a platform SDK with no browser equivalent. The web build cannot
 *              connect it; the native shell can, through the JumboNative bridge.
 *
 * Endpoint URLs are overridable by environment so an operator can correct them
 * without a code change if a provider moves them.
 */
export const PROVIDERS = {
  /* ------------------------------------------------------- native SDKs */
  apple_health: {
    id: 'apple_health',
    name: 'Apple Health',
    vendor: 'HealthKit',
    transport: 'native',
    platform: 'ios',
    provides: ['sleep', 'steps', 'workouts', 'heart', 'body', 'nutrition'],
    blurb: 'Everything already on your iPhone and Apple Watch.',
    why: 'HealthKit is an iOS framework. Browsers have no API for it, so this connects only inside the Jumbo iOS app.',
    docs: 'https://developer.apple.com/documentation/healthkit',
  },
  health_connect: {
    id: 'health_connect',
    name: 'Health Connect',
    vendor: 'Android',
    transport: 'native',
    platform: 'android',
    provides: ['sleep', 'steps', 'workouts', 'heart', 'body', 'nutrition'],
    blurb: 'The shared health store on your Android phone.',
    why: 'Health Connect uses the Android SDK. Browsers have no API for it, so this connects only inside the Jumbo Android app.',
    docs: 'https://developer.android.com/health-and-fitness/guides/health-connect',
  },

  /* -------------------------------------------------------- OAuth 2.0 */
  whoop: {
    id: 'whoop',
    name: 'WHOOP',
    vendor: 'WHOOP, Inc.',
    transport: 'oauth',
    provides: ['sleep', 'workouts', 'heart', 'body'],
    blurb: 'Recovery, sleep and strain from your WHOOP band.',
    authorizeUrl: process.env.WHOOP_AUTHORIZE_URL || 'https://api.prod.whoop.com/oauth/oauth2/auth',
    tokenUrl: process.env.WHOOP_TOKEN_URL || 'https://api.prod.whoop.com/oauth/oauth2/token',
    apiBase: process.env.WHOOP_API_BASE || 'https://api.prod.whoop.com/developer',
    scopes: ['read:profile', 'read:sleep', 'read:recovery', 'read:workout', 'read:cycles', 'read:body_measurement'],
    scopeSeparator: ' ',
    usesPkce: false,
    docs: 'https://developer.whoop.com',
  },
  oura: {
    id: 'oura',
    name: 'Oura',
    vendor: 'Oura Health',
    transport: 'oauth',
    provides: ['sleep', 'heart', 'workouts'],
    blurb: 'Sleep stages, readiness and overnight HRV from your ring.',
    authorizeUrl: process.env.OURA_AUTHORIZE_URL || 'https://cloud.ouraring.com/oauth/authorize',
    tokenUrl: process.env.OURA_TOKEN_URL || 'https://api.ouraring.com/oauth/token',
    apiBase: process.env.OURA_API_BASE || 'https://api.ouraring.com/v2',
    scopes: ['personal', 'daily', 'heartrate', 'workout', 'session'],
    scopeSeparator: ' ',
    usesPkce: false,
    docs: 'https://cloud.ouraring.com/v2/docs',
  },
  fitbit: {
    id: 'fitbit',
    name: 'Fitbit',
    vendor: 'Google',
    transport: 'oauth',
    provides: ['sleep', 'steps', 'workouts', 'heart', 'body', 'nutrition'],
    blurb: 'Steps, sleep, heart rate and weight from Fitbit.',
    authorizeUrl: process.env.FITBIT_AUTHORIZE_URL || 'https://www.fitbit.com/oauth2/authorize',
    tokenUrl: process.env.FITBIT_TOKEN_URL || 'https://api.fitbit.com/oauth2/token',
    apiBase: process.env.FITBIT_API_BASE || 'https://api.fitbit.com',
    scopes: ['activity', 'heartrate', 'sleep', 'weight', 'profile', 'nutrition'],
    scopeSeparator: ' ',
    usesPkce: true,
    docs: 'https://dev.fitbit.com/build/reference/web-api/',
  },
  withings: {
    id: 'withings',
    name: 'Withings',
    vendor: 'Withings',
    transport: 'oauth',
    provides: ['body', 'sleep', 'heart'],
    blurb: 'Weight and body composition from your scale.',
    authorizeUrl: process.env.WITHINGS_AUTHORIZE_URL || 'https://account.withings.com/oauth2_user/authorize2',
    tokenUrl: process.env.WITHINGS_TOKEN_URL || 'https://wbsapi.withings.net/v2/oauth2',
    apiBase: process.env.WITHINGS_API_BASE || 'https://wbsapi.withings.net',
    scopes: ['user.metrics', 'user.activity'],
    scopeSeparator: ',',
    usesPkce: false,
    docs: 'https://developer.withings.com/api-reference',
  },
  garmin: {
    id: 'garmin',
    name: 'Garmin',
    vendor: 'Garmin Health',
    transport: 'oauth',
    provides: ['workouts', 'heart', 'steps', 'sleep'],
    blurb: 'Training sessions and fitness estimates from your watch.',
    authorizeUrl: env.providers.garmin.authorizeUrl,
    tokenUrl: env.providers.garmin.tokenUrl,
    apiBase: env.providers.garmin.apiBase,
    scopes: [],
    scopeSeparator: ' ',
    usesPkce: true,
    docs: 'https://developer.garmin.com/health-api/overview/',
    note: 'Garmin issues Health API endpoints with programme approval, so they must be supplied as GARMIN_AUTHORIZE_URL, GARMIN_TOKEN_URL and GARMIN_API_BASE.',
  },
}

/** What a provider still needs before it can actually connect. */
export function readiness(id) {
  const p = PROVIDERS[id]
  if (!p) return { ok: false, missing: ['unknown provider'] }

  if (p.transport === 'native') {
    return {
      ok: false,
      transport: 'native',
      missing: [],
      reason: p.why,
      docs: p.docs,
    }
  }

  const creds = env.providers[id] || {}
  const missing = []
  if (!has(creds.clientId)) missing.push(`${id.toUpperCase()}_CLIENT_ID`)
  if (!has(creds.clientSecret)) missing.push(`${id.toUpperCase()}_CLIENT_SECRET`)
  if (!has(p.authorizeUrl)) missing.push(`${id.toUpperCase()}_AUTHORIZE_URL`)
  if (!has(p.tokenUrl)) missing.push(`${id.toUpperCase()}_TOKEN_URL`)

  return {
    ok: missing.length === 0,
    transport: 'oauth',
    missing,
    docs: p.docs,
    note: p.note,
  }
}

/** The public shape sent to the client. Never includes secrets. */
export function publicProvider(id) {
  const p = PROVIDERS[id]
  const r = readiness(id)
  return {
    id: p.id,
    name: p.name,
    vendor: p.vendor,
    transport: p.transport,
    platform: p.platform ?? null,
    provides: p.provides,
    blurb: p.blurb,
    docs: p.docs,
    ready: r.ok,
    missing: r.missing,
    reason: r.reason ?? null,
    note: r.note ?? null,
  }
}

export const listProviders = () => Object.keys(PROVIDERS).map(publicProvider)

/* ============================================================
   Jumbo — image assets

   Every photograph, illustration, mascot, avatar and logo in the product
   is declared once, here, and shipped as a clearly-marked placeholder in
   `public/assets/`. Nothing else in the codebase writes an image path.

   ── Replacing a placeholder with the finished artwork ──────────────
   Drop the real file into the matching folder under `public/assets/`,
   keeping the filename below. If your export has a different extension
   (an .svg or .webp where the placeholder is a .png), change the `file:` line
   for that asset — that is the only edit required.

   ── Hosting the artwork somewhere else ─────────────────────────────
   Set VITE_ASSET_BASE_URL and every path below is resolved against it,
   for example the raw GitHub view of this repository's public folder:

     VITE_ASSET_BASE_URL=https://raw.githubusercontent.com/\
       Sam-UX-Designer/Jumbo-ai-App/main/public/assets

   Left unset — the default — assets are served from this app's own
   `public/assets` folder, which is the same set of files.

   `docs/ASSETS.md` lists every asset with its size, format and the
   screens it appears on.
   ============================================================ */

const CONFIGURED_BASE = (import.meta.env.VITE_ASSET_BASE_URL as string | undefined)?.trim()

/** Where asset files are served from, with no trailing slash. */
export const ASSET_BASE = (CONFIGURED_BASE || `${import.meta.env.BASE_URL}assets`).replace(/\/+$/, '')

export interface AssetDef {
  /** Path under the asset base. Change this line when the real export lands. */
  file: string
  /** Default alternative text. Decorative uses pass `alt=""` at the call site. */
  alt: string
  /** Width ÷ height of the artwork the design expects. */
  ratio: number
}

export const ASSETS = {
  /* ── Brand ─────────────────────────────────────────────────────── */
  brandMark: {
    file: 'brand/jumbo-mark.png',
    alt: 'Jumbo',
    ratio: 1,
  },
  brandWordmark: {
    file: 'brand/jumbo-wordmark.png',
    alt: 'Jumbo',
    ratio: 4,
  },

  /* ── AI mascot ─────────────────────────────────────────────────── */
  mascot: {
    file: 'mascot/jumbo-mascot.png',
    alt: 'Jumbo, your health companion',
    ratio: 1,
  },

  /* ── People ────────────────────────────────────────────────────── */
  avatar: {
    file: 'avatar/user-placeholder.png',
    alt: 'Your profile photo',
    ratio: 1,
  },
  /* ── Illustrations ─────────────────────────────────────────────── */
  welcomeHero: {
    file: 'illustrations/onboarding-welcome.svg',
    alt: '',
    ratio: 1.5,
  },
  futurePath: {
    file: 'illustrations/future-path.svg',
    alt: '',
    ratio: 3,
  },
  celebration: {
    file: 'illustrations/celebration.svg',
    alt: '',
    ratio: 1,
  },
  ready: {
    file: 'illustrations/ready-rocket.svg',
    alt: '',
    ratio: 1,
  },

  /* ── Content ───────────────────────────────────────────────────── */
  videoThumbnail: {
    file: 'content/video-thumbnail.png',
    alt: '',
    ratio: 16 / 9,
  },
  mealPhoto: {
    file: 'content/meal-photo.png',
    alt: '',
    ratio: 1,
  },

  /* ── Health source logos ───────────────────────────────────────────
     Placeholders only. Each provider's real mark must come from that
     company's own brand assets and follow their usage rules — see
     docs/ASSETS.md. Keys match the provider ids the server returns. */
  'provider:apple_health':   { file: 'providers/apple-health.png',   alt: 'Apple Health', ratio: 1 },
  'provider:health_connect': { file: 'providers/health-connect.png', alt: 'Health Connect', ratio: 1 },
  'provider:whoop':          { file: 'providers/whoop.png',          alt: 'WHOOP', ratio: 1 },
  'provider:oura':           { file: 'providers/oura.png',           alt: 'Oura', ratio: 1 },
  'provider:fitbit':         { file: 'providers/fitbit.png',         alt: 'Fitbit', ratio: 1 },
  'provider:withings':       { file: 'providers/withings.png',       alt: 'Withings', ratio: 1 },
  'provider:garmin':         { file: 'providers/garmin.png',         alt: 'Garmin', ratio: 1 },
} satisfies Record<string, AssetDef>

export type AssetKey = keyof typeof ASSETS

/** The URL to fetch an asset from. */
export function assetUrl(key: AssetKey): string {
  return `${ASSET_BASE}/${ASSETS[key].file}`
}

/**
 * The logo for a connected health source, or null when that provider has no
 * declared artwork. Never guesses a filename from the id.
 */
export function providerAsset(providerId: string): AssetKey | null {
  const key = `provider:${providerId}`
  return key in ASSETS ? (key as AssetKey) : null
}

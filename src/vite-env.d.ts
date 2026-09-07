/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where image assets are served from. Blank uses this app's own
   * public/assets folder — see src/lib/assets.ts and docs/ASSETS.md.
   */
  readonly VITE_ASSET_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

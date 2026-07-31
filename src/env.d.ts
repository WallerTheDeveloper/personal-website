/// <reference types="vite/client" />

/**
 * Both are optional: analytics is a no-op unless the owner supplies a script
 * URL and a website id. See `analytics.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_UMAMI_SRC?: string;
  readonly VITE_UMAMI_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

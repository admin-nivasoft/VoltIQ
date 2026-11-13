/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" includes the development login switcher. Anything else leaves it out of the bundle. */
  readonly VITE_MOCK_AUTH?: string;
  /** "true" builds the browser-only demo with sample data and a DEMO banner. Anything else leaves it out. */
  readonly VITE_DEMO?: string;
  readonly VITE_PRODUCT_NAME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

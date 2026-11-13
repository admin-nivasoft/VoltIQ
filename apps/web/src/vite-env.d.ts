/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" includes the development login switcher. Anything else leaves it out of the bundle. */
  readonly VITE_MOCK_AUTH?: string;
  readonly VITE_PRODUCT_NAME?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

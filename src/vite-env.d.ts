/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Cloudflare Web Analytics beacon token (optional). When set, the beacon
   *  is injected at runtime to measure real human page views. */
  readonly VITE_CF_BEACON_TOKEN?: string;
  /** Image proxy for DOCX export when a host blocks CORS; "{url}" is
   *  replaced. Empty disables. Default: wsrv.nl. */
  readonly VITE_IMAGE_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

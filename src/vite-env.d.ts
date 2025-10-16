interface ImportMetaEnv {
  readonly BASE_URL: string;
  // adicione outras se precisar: MODE, DEV, PROD, VITE_*
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

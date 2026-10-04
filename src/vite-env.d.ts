/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TEST_HOOKS?: string;
}
declare module '*.woff' {
  const url: string;
  export default url;
}
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}

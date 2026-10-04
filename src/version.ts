declare const __APP_VERSION__: string;
/** Version de l'application (package.json), pour distinguer les builds. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

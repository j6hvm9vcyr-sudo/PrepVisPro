/** Logo de l'application : l'éventail « Nuit » (trois champs de focale depuis un même point caméra), comme l'icône. */
export function AppLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="50 50 412 412" aria-hidden="true">
      <rect x="50" y="50" width="412" height="412" rx="92" fill="#1B1915" />
      <path d="M 256 384 L 88.9 184.8 A 260 260 0 0 1 423.1 184.8 Z" fill="#3A332B" />
      <path d="M 256 384 L 146.1 148.4 A 260 260 0 0 1 365.9 148.4 Z" fill="#9C7752" />
      <path d="M 256 384 L 206.4 128.8 A 260 260 0 0 1 305.6 128.8 Z" fill="#F1E4C8" />
    </svg>
  );
}

/** Logo de l'application : un champ de caméra et une source de lumière (même dessin que l'icône). */
export function AppLogo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#202a42" />
          <stop offset="1" stopColor="#0b0f17" />
        </linearGradient>
        <radialGradient id="lg-cone" cx="15.5" cy="48.5" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8fb0ff" />
          <stop offset="0.7" stopColor="#5677dc" stopOpacity="0.5" />
          <stop offset="1" stopColor="#4060c8" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lg-bg)" />
      <path d="M15.5,48.5 L48.49,40.27 A34,34 0 0 0 23.73,15.51 Z" fill="url(#lg-cone)" />
      <circle cx="34.73" cy="29.27" r="5.2" fill="#f2ac3c" />
      <circle cx="15.5" cy="48.5" r="2.6" fill="#fff" />
    </svg>
  );
}

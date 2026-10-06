/** Icônes de l'interface (traits 1,8 px, taille 16), dessinées sur une grille de 24. */
import type { ReactNode } from 'react';

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconUndo = () => (
  <Svg>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10a6 6 0 010 12h-3" />
  </Svg>
);
export const IconRedo = () => (
  <Svg>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H10a6 6 0 000 12h3" />
  </Svg>
);
/** Panneau latéral droit (Détails). */
export const IconSidebar = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M15 4v16" />
  </Svg>
);
/** Versions (horloge à rebours). */
export const IconHistory = () => (
  <Svg>
    <path d="M3 12a9 9 0 103-6.7" />
    <path d="M3 4v5h5" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconGear = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Svg>
);
export const IconHelp = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 014.9.8c0 1.7-2.4 2.2-2.4 3.7" />
    <path d="M12 17.2h.01" />
  </Svg>
);
export const IconInfo = ({ size = 14 }: { size?: number }) => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.6h.01" />
  </Svg>
);
export const IconChevron = ({ open }: { open: boolean }) => (
  <Svg size={12}>
    <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
  </Svg>
);
/** À vérifier. */
export const IconWarn = () => (
  <Svg>
    <path d="M12 3.5l9 16H3z" />
    <path d="M12 10v4.5M12 17.4v.1" />
  </Svg>
);
/** Fermer un panneau. */
export const IconClose = () => (
  <Svg size={14}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
/** Outils du plan au sol. */
export const ToolIcons = {
  select: () => (
    <Svg>
      <path d="M5 3l14 8-6 1.5L10 19z" />
    </Svg>
  ),
  camera: () => (
    <Svg>
      <rect x="3" y="7" width="12" height="10" rx="2" />
      <path d="M15 10.5l6-3v9l-6-3" />
    </Svg>
  ),
  actor: () => (
    <Svg>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0113 0" />
    </Svg>
  ),
  light: () => (
    <Svg>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 00-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0012 3z" />
    </Svg>
  ),
  reflector: () => (
    <Svg>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </Svg>
  ),
  text: () => (
    <Svg>
      <path d="M5 5h14M12 5v15" />
    </Svg>
  ),
  measure: () => (
    <Svg>
      <path d="M4 16L16 4l4 4L8 20z" />
      <path d="M8 12l1.5 1.5M11 9l1.5 1.5M14 6l1.5 1.5" />
    </Svg>
  ),
  scale: () => (
    <Svg>
      <path d="M3 12h18M3 8v8M21 8v8" />
    </Svg>
  ),
};
/** Espaces (barre du bas) : un tableau de plans, un champ caméra vu de dessus, un clap. */
export const SpaceIcons = {
  decoupage: () => (
    <Svg size={22}>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.3h17M3.5 14.6h17M8.6 4v16" />
    </Svg>
  ),
  sol: () => (
    <Svg size={22}>
      <path d="M12 16.5L5.2 6.8M12 16.5l6.8-9.7" />
      <path d="M5.2 6.8a10 10 0 0113.6 0" />
      <rect x="9.6" y="16.5" width="4.8" height="4" rx="1" />
    </Svg>
  ),
  tournage: () => (
    <Svg size={22}>
      <rect x="3.5" y="10" width="17" height="10" rx="1.6" />
      <path d="M3.5 10l1-4.4 15-2.6.9 4.4L3.5 10z" />
      <path d="M8.3 4.9l2.4 4.3M13.4 4l2.4 4.3" />
    </Svg>
  ),
};
/** Exporter (partager). */
export const IconExport = () => (
  <Svg>
    <path d="M12 3.5v11M7.8 7.7L12 3.5l4.2 4.2" />
    <path d="M5 12.5v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </Svg>
);

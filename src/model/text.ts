/** Normalise pour comparer : minuscules, sans accents, espaces simplifiés. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Première lettre en majuscule, le reste tel quel. */
export function capitalize(s: string): string {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Nombre décimal français ou anglais : « 40 », « 40,5 », « 40.5 ». null si invalide. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Affichage français d'un nombre : 40 → « 40 », 40.5 → « 40,5 ». */
export function formatNumber(v: number): string {
  return String(Math.round(v * 1000) / 1000).replace('.', ',');
}

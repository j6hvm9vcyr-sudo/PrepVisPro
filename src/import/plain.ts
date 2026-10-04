/**
 * Lecture d'un scénario en texte : Fountain, texte brut, et texte extrait d'un Word ou d'un PDF.
 *
 * Un en-tête de scène est reconnu seulement s'il est sûr : ligne courte, en capitales, qui
 * commence par INT / EXT (ou INT./EXT., I/E, INTÉRIEUR, EXTÉRIEUR), éventuellement précédée
 * d'un numéro (« 12. », « 12A », « SÉQ. 12 – ») — ou forcée à la manière de Fountain (« .CAVE »).
 * Une phrase qui commence par « Intérieurement… » n'est donc jamais prise pour un en-tête.
 * L'aperçu d'import montre ensuite chaque scène reconnue avant toute modification du projet.
 */
import { parseHeading } from './heading';
import type { ScriptParse, ScriptScene } from './fdx';

const KEYWORD = String.raw`(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT[ÉE]RIEUR|EXT[ÉE]RIEUR|INT|EXT|EST)`;
/** Numéro facultatif, puis le mot-clé suivi d'un point, d'un espace ou d'un tiret. */
const HEADING = new RegExp(String.raw`^(?:(?:S[ÉE]Q(?:UENCE)?|SC[ÈE]NE)\.?\s*)?(\d{1,4}[A-Z]{0,2})?\s*[.)\-–—:]?\s*(${KEYWORD}(?:[.\s\-–—].*|$))$`, 'i');
/** Numéro Fountain en fin de ligne : « INT. CAVE - NUIT #12A# ». */
const FOUNTAIN_NUMBER = /\s*#([^#\s]+)#\s*$/;

/** Part des lettres en capitales (les en-têtes de scène sont en capitales). */
function upperRatio(s: string): number {
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (!letters.length) return 0;
  return letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length / letters.length;
}

export interface HeadingMatch {
  number: string | null;
  heading: string;
}

/** La ligne est-elle un en-tête de scène ? (null sinon) */
export function matchHeading(raw: string): HeadingMatch | null {
  let line = raw.replace(/\s+/g, ' ').trim();
  if (!line || line.length > 140) return null;
  let number: string | null = null;
  const fn = FOUNTAIN_NUMBER.exec(line);
  if (fn) {
    number = fn[1]!;
    line = line.slice(0, fn.index).trim();
  }
  // En-tête forcé (Fountain) : « .CAVE DU CHÂTEAU ».
  if (/^\.[^.\s]/.test(line)) return { number, heading: line.slice(1).trim() };
  const m = HEADING.exec(line);
  if (!m || upperRatio(m[2]!) < 0.7) return null;
  let heading = m[2]!.trim();
  if (m[1]) number = number ?? m[1].toUpperCase();
  // Numéro répété en fin de ligne (PDF de scénario : numéro dans les deux marges).
  if (number) heading = heading.replace(new RegExp(String.raw`\s+${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\.?$`, 'i'), '').trim();
  return { number, heading };
}

/** Lignes parasites des scénarios mis en page (PDF) : suites de page, numéros de page seuls. */
const PAGE_NOISE = [/^\(?\s*(suite|cont(inued|['’]d)?|à suivre|more|plus)\s*\)?\s*:?$/i, /^\d{1,3}\.?$/, /^-\s*\d{1,3}\s*-$/];

export function parsePlainScript(text: string, opts: { pdf?: boolean } = {}): ScriptParse {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n').split('\n');
  let title = '';
  // Page de titre Fountain : « Title: … » avant la première ligne vide.
  for (const l of lines) {
    if (!l.trim()) break;
    const t = /^title:\s*(.+)$/i.exec(l.trim());
    if (t) title = t[1]!.replace(/[*_]/g, '').trim();
  }
  const scenes: ScriptScene[] = [];
  let current: { scene: ScriptScene; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    current.scene.text = current.lines
      .join('\n')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    scenes.push(current.scene);
  };
  for (const raw of lines) {
    const h = matchHeading(raw);
    if (h) {
      flush();
      const parsed = parseHeading(h.heading);
      current = { scene: { number: h.number ?? '', numbered: !!h.number, heading: h.heading, parsed, location: parsed.location, text: '' }, lines: [] };
      continue;
    }
    if (!current) continue;
    const t = raw.trim();
    if (opts.pdf && PAGE_NOISE.some((r) => r.test(t))) continue;
    current.lines.push(raw.replace(/\s+$/, ''));
  }
  flush();
  if (!scenes.length) return { ok: false, error: 'Aucune scène trouvée : les en-têtes doivent commencer par INT. ou EXT., en capitales (ex. « 12. INT. CUISINE - JOUR »).' };
  // Scène non numérotée : son numéro d'ordre (comme pour Final Draft ; un doublon éventuel est
  // signalé par l'aperçu et bloque l'import).
  scenes.forEach((s, i) => (s.number ||= String(i + 1)));
  return { ok: true, scenes, title };
}

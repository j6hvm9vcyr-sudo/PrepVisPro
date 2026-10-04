/**
 * Lecture d'un scénario Final Draft (.fdx, format XML).
 * On ne garde que la structure utile au découpage : scènes (numéro, en-tête) et leur texte.
 */
import { parseHeading, type ParsedHeading } from './heading';

export interface ScriptScene {
  /** Numéro de scène tel qu'au scénario, ou numéro d'ordre si la scène n'est pas numérotée. */
  number: string;
  numbered: boolean;
  heading: string;
  parsed: ParsedHeading;
  /** Décor tel qu'écrit au scénario (pas de recapitalisation devinée). */
  location: string;
  /** Texte de la scène, mis en forme comme un scénario (personnages en capitales, dialogues). */
  text: string;
}

export type ScriptParse = { ok: true; scenes: ScriptScene[]; title: string } | { ok: false; error: string };

function paragraphText(p: Element): string {
  const texts = Array.from(p.getElementsByTagName('Text'));
  const s = texts.length ? texts.map((t) => t.textContent ?? '').join('') : (p.textContent ?? '');
  return s.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
}

export function parseFdx(xml: string): ScriptParse {
  let dom: Document;
  try {
    dom = new DOMParser().parseFromString(xml, 'application/xml');
  } catch {
    return { ok: false, error: 'Fichier illisible.' };
  }
  if (dom.getElementsByTagName('parsererror').length) return { ok: false, error: 'Ce fichier n’est pas un document Final Draft valide (XML illisible).' };
  const root = dom.documentElement;
  if (!root || root.nodeName !== 'FinalDraft') return { ok: false, error: 'Ce fichier n’est pas un document Final Draft (.fdx).' };
  const content = root.getElementsByTagName('Content')[0];
  if (!content) return { ok: false, error: 'Document Final Draft sans contenu.' };

  const scenes: ScriptScene[] = [];
  let current: { scene: ScriptScene; lines: string[] } | null = null;
  let order = 0;
  const flush = () => {
    if (current) {
      current.scene.text = current.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      scenes.push(current.scene);
    }
  };
  for (const p of Array.from(content.children)) {
    if (p.nodeName !== 'Paragraph') continue;
    const type = p.getAttribute('Type') ?? '';
    const text = paragraphText(p);
    if (type === 'Scene Heading') {
      flush();
      order++;
      const num = (p.getAttribute('Number') ?? '').trim();
      const parsed = parseHeading(text);
      current = {
        scene: { number: num || String(order), numbered: !!num, heading: text.trim(), parsed, location: parsed.location, text: '' },
        lines: [],
      };
      continue;
    }
    if (!current || !text) continue;
    switch (type) {
      case 'Character':
        current.lines.push('', text.toUpperCase());
        break;
      case 'Parenthetical':
        current.lines.push(text.startsWith('(') ? text : `(${text})`);
        break;
      case 'Dialogue':
        current.lines.push(text);
        break;
      case 'Transition':
        current.lines.push('', text.toUpperCase());
        break;
      default:
        current.lines.push('', text);
    }
  }
  flush();
  if (!scenes.length) return { ok: false, error: 'Aucune scène trouvée (pas d’en-tête de scène « INT. / EXT. »).' };
  const title = (root.getElementsByTagName('TitlePage')[0]?.getElementsByTagName('Text')[0]?.textContent ?? '').trim();
  return { ok: true, scenes, title };
}

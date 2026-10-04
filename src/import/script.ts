/**
 * Import d'un scénario quel que soit son format : Final Draft (.fdx), Fountain, texte brut,
 * Word (.docx) ou PDF. Le format est reconnu à l'extension, puis vérifié au contenu.
 */
import { parseFdx, type ScriptParse } from './fdx';
import { parsePlainScript } from './plain';

export interface ScriptFile {
  name: string;
  bytes: Uint8Array;
}

export const SCRIPT_EXTENSIONS = ['fdx', 'fountain', 'txt', 'md', 'docx', 'pdf'];
export const SCRIPT_FORMATS = 'Final Draft, Fountain, texte, Word ou PDF';

/** Texte en UTF-8, ou en Windows-1252 (ancien texte Windows) s'il n'est pas de l'UTF-8 valide. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export async function parseScriptFile(file: ScriptFile): Promise<ScriptParse> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const b = file.bytes;
  try {
    if (startsWith(b, [0x25, 0x50, 0x44, 0x46])) {
      const { pdfText } = await import('./pdfText');
      return parsePlainScript(await pdfText(b), { pdf: true });
    }
    if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) {
      if (ext !== 'docx') return { ok: false, error: 'Archive non reconnue : attendu un document Word (.docx).' };
      const { docxText } = await import('./docx');
      return parsePlainScript(await docxText(b));
    }
    if (ext === 'pdf' || ext === 'docx') return { ok: false, error: `Ce fichier n’est pas un ${ext === 'pdf' ? 'PDF' : 'document Word'} valide.` };
    const text = decodeText(b);
    if (ext === 'fdx' || /^\s*<\?xml[\s\S]{0,200}<FinalDraft/.test(text)) return parseFdx(text);
    return parsePlainScript(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

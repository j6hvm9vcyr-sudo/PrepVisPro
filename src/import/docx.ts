/** Texte d'un document Word (.docx) : un paragraphe par ligne, tabulations et retours conservés. */
import JSZip from 'jszip';

export async function docxText(bytes: Uint8Array): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('Ce fichier n’est pas un document Word (.docx) lisible.');
  }
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Document Word sans contenu (word/document.xml absent).');
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.getElementsByTagName('parsererror').length) throw new Error('Document Word illisible.');
  const out: string[] = [];
  for (const p of Array.from(dom.getElementsByTagName('w:p'))) {
    let line = '';
    const walk = (n: Element) => {
      for (const c of Array.from(n.children)) {
        if (c.tagName === 'w:t') line += c.textContent ?? '';
        else if (c.tagName === 'w:tab') line += '\t';
        else if (c.tagName === 'w:br' || c.tagName === 'w:cr') line += '\n';
        // Texte supprimé en mode révision : ignoré.
        else if (c.tagName !== 'w:del' && c.tagName !== 'w:pPr') walk(c);
      }
    };
    walk(p);
    out.push(line);
  }
  return out.join('\n');
}

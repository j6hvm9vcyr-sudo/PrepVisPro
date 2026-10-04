/**
 * Texte d'un PDF de scénario, ligne par ligne : les morceaux de texte de chaque page sont
 * regroupés par hauteur (même ligne), puis lus de gauche à droite.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch {
    throw new Error('Ce fichier n’est pas un PDF lisible.');
  }
  const pages: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items = content.items
        .flatMap((i) => ('str' in i && typeof i.str === 'string' ? [{ s: i.str, x: i.transform[4] as number, y: i.transform[5] as number, w: i.width }] : []))
        .filter((i) => i.s.length > 0);
      // Lignes : même hauteur à 2 points près.
      const rows: { y: number; parts: typeof items }[] = [];
      for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
        const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
        if (row) row.parts.push(it);
        else rows.push({ y: it.y, parts: [it] });
      }
      rows.sort((a, b) => b.y - a.y);
      const lines: string[] = [];
      let lastY: number | null = null;
      for (const r of rows) {
        // Interligne nettement plus grand : ligne vide (sépare les blocs comme dans le scénario).
        if (lastY !== null && lastY - r.y > 20) lines.push('');
        lastY = r.y;
        let line = '';
        let end: number | null = null;
        for (const p of r.parts.sort((a, b) => a.x - b.x)) {
          if (end !== null && p.x - end > 1 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' ';
          line += p.s;
          end = p.x + p.w;
        }
        lines.push(line);
      }
      pages.push(lines.join('\n'));
    }
  } finally {
    await doc.destroy();
  }
  return pages.join('\n');
}

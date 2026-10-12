import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG_160x90_B64 } from '../src/test/fixtures';

type Memory = { exports: Map<string, Uint8Array> };
const DIR = '/Drive/Le Quai/Image/Exemple — Le Quai — animatique';

async function exported(page: Page): Promise<Record<string, number[]>> {
  return page.evaluate(() => Object.fromEntries([...(window as unknown as { __prepvisMemory: Memory }).__prepvisMemory.exports].map(([k, v]) => [k, [...v]])));
}

/** Largeur et hauteur lues dans l'en-tête PNG. */
function pngSize(b: number[]): [number, number] {
  const u = Buffer.from(b);
  expect(u.subarray(1, 4).toString()).toBe('PNG');
  return [u.readUInt32BE(16), u.readUInt32BE(20)];
}

test('0.22 : animatique pour le montage — une image par plan minuté, timeline OpenTimelineIO ou FCPXML, dossier neuf à chaque fois', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Une image de repérage sur 1/1 : elle sera l'image du plan.
  const imgs = page.getByRole('region', { name: 'Images', exact: true });
  await imgs.locator('input[type=file]').setInputFiles([{ name: 'quai.png', mimeType: 'image/png', buffer: Buffer.from(PNG_160x90_B64, 'base64') }]);
  await expect(page.locator('.line').first().locator('img')).toHaveCount(1);
  await page.getByRole('button', { name: /^Exemple — Le Quai/ }).click();
  await page.getByRole('menuitem', { name: 'Animatique pour le montage…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Animatique pour le montage' });
  const strip = dlg.getByLabel('Aperçu de l’animatique');
  const timed = await strip.locator('.anim-clip').count();
  expect(timed).toBeGreaterThan(0);
  // Plans sans durée : laissés de côté par défaut, ou durée provisoire.
  const missing = dlg.getByRole('region', { name: 'Plans sans durée' });
  await expect(missing.locator('.warn-text')).not.toBeEmpty();
  await missing.getByRole('textbox', { name: 'Durée provisoire' }).fill('abc');
  await expect(missing).toContainText('Durée non reconnue');
  await expect(dlg.getByRole('button', { name: 'Créer l’animatique…' })).toBeDisabled();
  await missing.getByRole('textbox', { name: 'Durée provisoire' }).fill('3');
  const all = await strip.locator('.anim-clip').count();
  expect(all).toBeGreaterThan(timed);
  await expect(strip.locator('.anim-clip.provisional')).toHaveCount(all - timed);
  await page.screenshot({ path: 'test-results/43-animatique.png' });

  await dlg.getByRole('button', { name: 'Créer l’animatique…' }).click();
  await expect(dlg.getByRole('status')).toContainText(`Animatique créée : ${DIR}`);
  let files = await exported(page);
  const pngs = Object.keys(files).filter((k) => k.startsWith(`${DIR}/images/`)).sort();
  expect(pngs).toHaveLength(all);
  expect(pngs[0]).toBe(`${DIR}/images/0001 1-1.png`);
  for (const p of pngs) expect(pngSize(files[p]!)).toEqual([1920, 1080]);
  writeFileSync('test-results/44-animatique-image.png', Buffer.from(files[pngs[0]!]!));
  writeFileSync('test-results/45-animatique-carton.png', Buffer.from(files[pngs[pngs.length - 1]!]!));
  const otio = JSON.parse(Buffer.from(files[`${DIR}/Exemple — Le Quai — animatique.otio`]!).toString('utf8'));
  const clips = otio.tracks.children[0].children;
  expect(clips).toHaveLength(all);
  expect(clips[0].name).toBe('1/1');
  expect(clips[0].media_references.DEFAULT_MEDIA.target_url).toBe('file:///Drive/Le%20Quai/Image/Exemple%20%E2%80%94%20Le%20Quai%20%E2%80%94%20animatique/images/0001%201-1.png');
  expect(clips.filter((c: { metadata: { topshot: { provisional: boolean } } }) => c.metadata.topshot.provisional)).toHaveLength(all - timed);

  // Final Cut Pro : un autre dossier, rien n'est remplacé.
  await dlg.getByRole('radio', { name: /Final Cut Pro/ }).check();
  await dlg.getByRole('button', { name: 'Créer l’animatique…' }).click();
  await expect(dlg.getByRole('status')).toContainText(`Animatique créée : ${DIR} (2)`);
  files = await exported(page);
  const fcpxml = Buffer.from(files[`${DIR} (2)/Exemple — Le Quai — animatique.fcpxml`]!).toString('utf8');
  expect(fcpxml).toContain('<fcpxml version="1.9">');
  expect([...fcpxml.matchAll(/<video ref=/g)]).toHaveLength(all);
  expect(files[`${DIR}/Exemple — Le Quai — animatique.otio`]).toBeDefined();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
});

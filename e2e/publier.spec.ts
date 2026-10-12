import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

/** Fichiers publiés (navigateur : gardés en mémoire), avec le nombre d'écritures de chacun. */
async function published(page: Page): Promise<Record<string, { writes: number; bytes: number[] }>> {
  return page.evaluate(() => {
    const m = (window as unknown as { __prepvisMemory: { published: Map<string, { bytes: Uint8Array; writes: number }> } }).__prepvisMemory;
    return Object.fromEntries([...m.published].map(([k, v]) => [k, { writes: v.writes, bytes: [...v.bytes] }]));
  });
}

/** Pieds de page de toutes les feuilles du classeur. */
async function excelFooter(bytes: number[]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  return wb.worksheets.map((w) => w.headerFooter?.oddFooter ?? '').join('\n');
}

test('0.20 : publier dans le dossier de diffusion — mêmes noms à chaque fois, « Publication N » dans les documents, ce qui a changé depuis', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  const bar = page.getByRole('banner', { name: 'Panneaux' });
  await bar.getByRole('button', { name: 'Publier', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Publier' });
  await expect(dlg).toContainText('Aucun dossier choisi sur ce Mac');
  await expect(dlg).toContainText('Pas encore publié');
  await expect(dlg.getByRole('button', { name: 'Publier (publication 1)' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Choisir…' }).click();
  await expect(dlg.locator('.pub-folder')).toHaveText('/Drive/Le Quai/Image');
  // Par défaut : découpage PDF et Excel ; pas de plan au sol dans l'exemple.
  await expect(dlg.getByRole('checkbox', { name: /découpage\.pdf/ })).toBeChecked();
  await expect(dlg.getByRole('checkbox', { name: /découpage\.xlsx/ })).toBeChecked();
  await expect(dlg.getByRole('checkbox', { name: /plans au sol\.pdf/ })).toBeChecked();
  await expect(dlg).toContainText('aucun plan au sol pour l’instant');
  await expect(dlg).toContainText('Les noms sont fixés à la première publication');
  await dlg.getByRole('button', { name: 'Publier (publication 1)' }).click();
  await expect(dlg.getByRole('status')).toContainText('Publication 1 : Exemple — Le Quai — découpage.pdf, Exemple — Le Quai — découpage.xlsx à jour.');
  await expect(dlg).toContainText('Depuis la publication 1');
  await expect(dlg).toContainText('Rien n’a changé.');
  let files = await published(page);
  expect(Object.keys(files).sort()).toEqual(['/Drive/Le Quai/Image/Exemple — Le Quai — découpage.pdf', '/Drive/Le Quai/Image/Exemple — Le Quai — découpage.xlsx']);
  expect(await excelFooter(files['/Drive/Le Quai/Image/Exemple — Le Quai — découpage.xlsx']!.bytes)).toContain('Publication 1 · ');
  await page.screenshot({ path: 'test-results/40-publier.png' });
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);

  // Une modification : le bouton le signale ; le dialogue dit quoi.
  await page.locator('.line [id$="-focal"]').first().click();
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');
  await expect(bar.getByRole('button', { name: 'Publier (modifié depuis la dernière publication)' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await expect(dlg).toContainText('1 plan modifié');
  await page.evaluate(() => (window as unknown as { __prepvisMemory: { missingFolders: Set<string> } }).__prepvisMemory.missingFolders.add('/Drive/Le Quai/Image'));
  await dlg.getByRole('button', { name: 'Publier (publication 2)' }).click();
  await expect(dlg.getByRole('alert')).toContainText('Publication impossible : Le dossier de diffusion est introuvable');
  // Rien n'est compté comme publié.
  await expect(dlg.getByRole('button', { name: 'Publier (publication 2)' })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { __prepvisMemory: { missingFolders: Set<string> } }).__prepvisMemory.missingFolders.clear());
  await dlg.getByRole('button', { name: 'Publier (publication 2)' }).click();
  await expect(dlg.getByRole('status')).toContainText('Publication 2 :');
  files = await published(page);
  expect(Object.values(files).map((f) => f.writes)).toEqual([2, 2]);
  expect(await excelFooter(files['/Drive/Le Quai/Image/Exemple — Le Quai — découpage.xlsx']!.bytes)).toContain('Publication 2 · ');
  await page.keyboard.press('Escape');
  await expect(bar.getByRole('button', { name: 'Publier', exact: true })).toBeVisible();

  // Chaque publication est gardée dans les versions.
  await page.keyboard.press('ControlOrMeta+Shift+S');
  const versions = page.getByRole('dialog', { name: 'Versions du projet' });
  await expect(versions.locator('.version-item')).toHaveCount(2);
  await expect(versions).toContainText('Publication 2');
  await expect(versions).toContainText('Publication 1');
});

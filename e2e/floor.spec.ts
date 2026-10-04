import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { copyFileSync, readFileSync } from 'node:fs';

test('plan au sol : fond, mise à l’échelle, caméra du découpage avec son champ, mesure', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Format capteur renseigné : le champ peut être dessiné.
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await page.getByLabel('Largeur capteur').first().fill('24,89');
  await page.getByRole('button', { name: 'Terminé' }).click();

  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.getByText('Aucun plan au sol pour l’instant.')).toBeVisible();
  await page.getByLabel('Créer un plan au sol pour la séquence').selectOption({ label: '1 — Quai de gare' });
  await expect(page.getByRole('application', { name: 'Plan au sol' })).toBeVisible();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer le plan du décor…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await expect(page.locator('.floor-canvas image')).toHaveCount(1);

  // L'outil Échelle est activé après l'import : deux clics sur le mur du haut (10 m).
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const box = (await page.locator('.floor-canvas svg').boundingBox())!;
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  const a = at(100, 100);
  const b = at(1100, 100);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
  await page.getByLabel('Distance en mètres').fill('10');
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(page.locator('.floor-scalebar')).toBeVisible();

  // Placer la caméra 1/1 depuis la liste.
  await page.locator('.place-item', { hasText: '1/1' }).click();
  const c = at(300, 600);
  await page.mouse.click(c.x, c.y);
  await expect(page.locator('.floor-canvas [data-el]')).toHaveCount(1);
  await expect(page.locator('.floor-canvas polygon')).toHaveCount(1);
  await expect(page.locator('.floor-canvas text', { hasText: '1/1' })).toBeVisible();

  // Mesure : 5 m entre deux points.
  await canvas.press('m');
  const m1 = at(100, 400);
  const m2 = at(600, 400);
  await page.mouse.click(m1.x, m1.y);
  await page.mouse.move(m2.x, m2.y);
  await page.mouse.click(m2.x, m2.y);
  await expect(page.locator('.floor-canvas text', { hasText: /^(4,9[89]|5|5,0[12]) m$/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/12-plan-au-sol.png' });
  expect(box.width).toBeGreaterThan(400);

  // Le plan au sol suit le découpage : renuméroter met l'étiquette à jour.
  await canvas.press('Escape');
  await page.keyboard.press('ControlOrMeta+1');
  await page.keyboard.press('ControlOrMeta+Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.locator('.floor-canvas text', { hasText: '1/2' })).toBeVisible();

  // Export du plan : image PNG haute définition, puis PDF avec légende.
  const dl = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PNG' }).click();
  const png = await (await dl).path();
  const bytes = readFileSync(png);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  const w = bytes.readUInt32BE(16);
  const h = bytes.readUInt32BE(20);
  expect(Math.max(w, h)).toBe(4000);
  copyFileSync(png, 'test-results/13-export-plan.png');
  await expect(page.getByText(/Plan exporté/)).toBeVisible();

  const dl2 = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PDF' }).click();
  const pdfBytes = readFileSync(await (await dl2).path());
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdfBytes.length).toBeGreaterThan(50_000);
  copyFileSync(await (await dl2).path(), 'test-results/14-export-plan.pdf');

  // Le PDF du découpage inclut les plans au sol.
  await page.keyboard.press('ControlOrMeta+e');
  await expect(page.getByLabel('Plans au sol des séquences exportées (1)')).toBeChecked();
  const dl3 = page.waitForEvent('download');
  await page.getByRole('dialog', { name: 'Exporter' }).getByRole('button', { name: 'PDF', exact: true }).click();
  const full = readFileSync(await (await dl3).path());
  expect(full.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByText('Exporté :', { exact: true })).toBeVisible();
  copyFileSync(await (await dl3).path(), 'test-results/15-decoupage-avec-plan.pdf');
});

test('plan au sol : fond PDF (plan d’architecte), texte saisi au clavier, champs décimaux à la française', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await page.getByLabel('Créer un plan au sol pour la séquence').selectOption({ label: '1 — Quai de gare' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer le plan du décor…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.pdf'));
  await expect(page.locator('.floor-canvas image')).toHaveCount(1, { timeout: 15000 });
  await expect(page.getByText(/Import du fond impossible/)).toHaveCount(0);
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  expect(img.width / img.height).toBeCloseTo(1.5, 1);

  // Échelle : le champ de distance prend le focus tout seul.
  await page.mouse.click(img.x + img.width * 0.1, img.y + img.height * 0.2);
  await page.mouse.click(img.x + img.width * 0.9, img.y + img.height * 0.2);
  await expect(page.getByLabel('Distance en mètres')).toBeFocused();
  await page.keyboard.type('8,5');
  await page.keyboard.press('Enter');
  await expect(page.locator('.floor-scalebar')).toBeVisible();

  // Texte : placé puis tapé directement.
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  await canvas.press('t');
  await page.mouse.click(img.x + img.width * 0.5, img.y + img.height * 0.5);
  await page.keyboard.type('Camion');
  await expect(page.locator('.floor-canvas text', { hasText: 'Camion' })).toBeVisible();

  // Longueur des champs (réglage du plan, sans élément sélectionné) : « 2,5 » accepté.
  await canvas.press('Escape');
  await page.getByLabel('Longueur des champs caméra en mètres').fill('2,5');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Longueur des champs caméra en mètres')).toHaveValue('2,5');
});

test('bibliothèque d’icônes : import d’un dossier, recherche, pose sur le plan, export', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+3');
  await page.getByLabel('Créer un plan au sol pour la séquence').selectOption({ label: '1 — Quai de gare' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un dossier d’icônes…' }).click();
  await (await chooser).setFiles(resolve('e2e/icones-test'));
  await expect(page.locator('.icon-palette .sec-h .count')).toHaveText('4');
  await expect(page.getByText(/4 icônes dans la bibliothèque/)).toBeVisible();
  // Catégories = sous-dossiers ; les images à la racine vont dans la catégorie du dossier.
  // (Noms sans accents : Chromium piloté par les tests ne relit pas les fichiers d'un dossier accentué ;
  // l'application Mac lit le dossier par son propre code, testé avec accents.)
  await expect(page.locator('.icon-group-h')).toHaveText([/icones-test\s*1/, /Lumieres\s*2/, /Machinerie\s*1/]);
  await page.getByLabel('Rechercher une icône').fill('fres');
  await page.getByRole('button', { name: 'Poser Fresnel 650' }).click();
  const canvas = page.locator('.floor-canvas svg');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.floor-canvas [data-el] image')).toHaveCount(1);
  await expect(page.getByText('Fresnel 650 posé')).toBeVisible();
  // Légende et taille.
  await page.getByPlaceholder('ex. 2K, Fresnel 650').fill('650 W');
  await page.getByRole('group', { name: 'Taille de l’icône' }).getByRole('button', { name: 'Grande', exact: true }).click();
  await expect(page.locator('.floor-canvas text', { hasText: '650 W' })).toBeVisible();
  // L'icône est dans le PNG exporté (le rendu ne casse pas).
  const dl = page.waitForEvent('download');
  await page.getByRole('group', { name: 'Exporter ce plan' }).getByRole('button', { name: 'PNG' }).click();
  expect(readFileSync(await (await dl).path()).subarray(1, 4).toString()).toBe('PNG');
  await page.screenshot({ path: 'test-results/17-icones.png' });
});

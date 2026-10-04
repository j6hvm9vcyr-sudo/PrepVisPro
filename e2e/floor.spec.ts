import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

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
  await expect(page.locator('.floor-canvas text', { hasText: /^5 m$/ })).toBeVisible();
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
});

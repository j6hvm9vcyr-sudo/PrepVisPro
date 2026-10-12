import { expect, test } from '@playwright/test';
import { pick } from './pick';
import { resolve } from 'node:path';

test('documents liés : un plan modifié se retrouve partout, « ce plan ailleurs » mène au bon endroit', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  const links = page.getByRole('region', { name: 'Lié à' });
  await expect(links.getByRole('button', { name: 'Aucun plan au sol pour la séquence 1' })).toBeVisible();
  await expect(links.getByRole('button', { name: 'Tournage : ordre à établir' })).toBeVisible();
  await expect(links.getByRole('button', { name: 'Pas encore dans un jour de tournage' })).toBeVisible();

  // Plan au sol de la séquence 1.
  await page.keyboard.press('ControlOrMeta+2');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+1');

  // Depuis les détails du plan 1/1 : « caméra à placer » ouvre le plan au sol, prêt à la poser.
  await expect(links.getByRole('button', { name: /caméra à placer/ })).toBeVisible();
  await links.getByRole('button', { name: /caméra à placer/ }).click();
  await expect(page.getByRole('application', { name: 'Plan au sol' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Placer la caméra 1/1', exact: true })).toHaveClass(/on/);
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  await page.mouse.click(img.x + img.width * 0.3, img.y + img.height * 0.6);
  await expect(page.locator('.floor-canvas text', { hasText: '32 mm' })).toBeVisible();

  // La focale changée dans le tableau se retrouve sur le plan au sol, sans rien recopier.
  await page.keyboard.press('ControlOrMeta+1');
  await page.locator('.line [id$="-focal"]').first().click();
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp'); // ↩ est descendu au plan suivant : retour au 1/1
  await expect(links.getByRole('button', { name: /caméra placée/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/32-ce-plan-ailleurs.png' });
  await links.getByRole('button', { name: /caméra placée/ }).click();
  await expect(page.locator('.floor-canvas text', { hasText: '40 mm' })).toBeVisible();
  // La caméra est sélectionnée sur le plan : ses détails sont ouverts.
  await expect(page.getByRole('complementary', { name: 'Détails du plan au sol' }).locator('.side-head')).toContainText('Caméra');

  // Lumière du même plan au sol.
  await page.keyboard.press('ControlOrMeta+1');
  await links.getByRole('button', { name: /Lumière : aucun projecteur/ }).click();
  // Rien n'est sélectionné : les détails montrent la lumière du plan.
  await expect(page.getByRole('region', { name: 'Soleil', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Projecteurs', exact: true })).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pick } from './pick';

test('0.23 : axe des 180° entre deux personnages, saut d’axe dans À vérifier, « C’est voulu » ; personnages dans le champ', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await page.getByLabel('Largeur capteur').first().fill('24,89');
  await page.getByRole('button', { name: 'Terminé' }).click();

  await page.keyboard.press('ControlOrMeta+2');
  await pick(page, 'Créer un plan au sol pour la séquence', '1 — Quai de gare');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fond…' }).click();
  await (await chooser).setFiles(resolve('e2e/plan-decor.png'));
  await expect(page.locator('.floor-canvas image')).toHaveCount(1);
  const canvas = page.getByRole('application', { name: 'Plan au sol' });
  const img = (await page.locator('.floor-canvas image').boundingBox())!;
  const at = (x: number, y: number) => ({ x: img.x + (x / 1200) * img.width, y: img.y + (y / 800) * img.height });
  const click = async (x: number, y: number) => {
    const p = at(x, y);
    await page.mouse.click(p.x, p.y);
  };
  // Échelle : le mur du haut fait 10 m.
  await click(100, 100);
  await click(1100, 100);
  await page.getByLabel('Distance en mètres').fill('10');
  await page.getByRole('button', { name: 'Valider' }).click();

  // Deux personnages sur une horizontale ; 1/1 dessous, 1/2 dessus : saut d'axe.
  await canvas.press('p');
  await click(300, 300);
  await canvas.press('p');
  await click(900, 300);
  await canvas.press('Escape');
  await page.getByRole('button', { name: 'Placer la caméra 1/1', exact: true }).click();
  await click(300, 600);
  await canvas.press('Escape');
  await page.getByRole('button', { name: 'Placer la caméra 1/2', exact: true }).click();
  await click(600, 120);
  await expect(page.locator('.floor-canvas [data-axis]')).toHaveCount(0);

  // 1/1 regarde vers le haut : Personnage 1 à 3 m, cadre de 3 × 24,89 ÷ 32 = 2,33 m.
  await click(300, 600);
  const field = page.getByRole('region', { name: 'Dans le champ' });
  await expect(field.locator('.in-field-row').first()).toContainText('Personnage 1');
  await expect(field.locator('.in-field-row').first()).toContainText('3 m · cadre 2,33 m');
  await expect(field.locator('.in-field-row.out')).toContainText('Personnage 2');

  // L'axe se trace depuis les détails d'un personnage.
  await click(300, 300);
  const axes = page.getByRole('region', { name: 'Axes des 180°' });
  await pick(page, 'Axe avec un autre personnage', 'Personnage 2');
  await expect(page.locator('.floor-canvas [data-axis]')).toHaveCount(1);
  await expect(axes).toContainText('Personnage 1 ↔ Personnage 2');
  // Côtés dans l'ordre du film : 1/3 n'est pas placé ; la reprise 1/2B prend la caméra de 1/2.
  await expect(axes.getByRole('listitem')).toHaveText(['1/1 côté 1', '1/2 côté 2', '1/3 —', '1/2B côté 2']);
  await page.screenshot({ path: 'test-results/46-axe-180.png' });

  // À vérifier : le saut mène à la caméra de 1/2, dont les détails proposent « C'est voulu ».
  await page.locator('.verify-btn').click();
  const verif = page.getByRole('complementary', { name: 'À vérifier' });
  const item = verif.getByRole('button', { name: /1\/1 → 1\/2 · saut d’axe Personnage 1 ↔ Personnage 2/ });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator('.floor-canvas text', { hasText: '1/2' })).toBeVisible();
  await verif.getByRole('button', { name: 'Fermer À vérifier' }).click();
  const rac = page.getByRole('region', { name: 'Raccords' });
  await expect(rac).toContainText('côté 2');
  await rac.getByRole('button', { name: 'C’est voulu' }).click();
  await expect(rac.getByRole('button', { name: 'Signaler à nouveau' })).toBeVisible();
  await page.locator('.verify-btn').click();
  await expect(verif).not.toContainText('saut d’axe');
  // Annulable.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(verif).toContainText('saut d’axe');
});

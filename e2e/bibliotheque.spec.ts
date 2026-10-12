import { expect, test } from '@playwright/test';
import { PNG_160x90_B64 } from '../src/test/fixtures';

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
});

const png = { name: 'quai.png', mimeType: 'image/png', buffer: Buffer.from(PNG_160x90_B64, 'base64') };

test('bibliothèque : importer une fois, réutiliser dans plusieurs plans, jamais de doublon', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Alt+3');
  const lib = page.getByRole('region', { name: 'Bibliothèque d’images' });
  await expect(lib).toContainText('Aucune image pour l’instant');
  await lib.locator('input[type=file]').setInputFiles([png]);
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await expect(lib.locator('.libcard .usage')).toHaveText('Pas encore utilisée');
  // Même image importée une deuxième fois (autre nom) : pas de doublon.
  await lib.locator('input[type=file]').setInputFiles([{ ...png, name: 'copie.png' }]);
  await expect(page.getByRole('status')).toContainText('déjà dans la bibliothèque');
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await lib.getByLabel('Légende').fill('Lumière du matin, quai');

  // Ajout au plan sélectionné (1/1) en repérage.
  await lib.getByRole('button', { name: '+ 1/1 repérage' }).click();
  await expect(lib.locator('.libcard .usage')).toHaveText('1/1 (rep.)');
  await expect(lib.getByRole('button', { name: 'Retirer' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/31-bibliotheque.png' });

  // Depuis les détails d'un autre plan : choisir dans la bibliothèque.
  await page.keyboard.press('ControlOrMeta+1');
  await page.locator('.line [id$="-action"]').nth(4).click();
  const imgs = page.getByRole('region', { name: 'Images', exact: true });
  await imgs.getByRole('radio', { name: 'Référence' }).click();
  await imgs.getByRole('button', { name: 'Bibliothèque…' }).click();
  const pick = page.getByRole('dialog', { name: 'Bibliothèque d’images' });
  await expect(pick).toContainText('Images pour le plan 2/1');
  await expect(pick.getByRole('radio', { name: 'Référence' })).toHaveAttribute('aria-checked', 'true');
  await pick.getByRole('option').first().getByRole('button').click();
  await pick.getByRole('button', { name: 'Ajouter' }).click();
  await expect(pick).toBeHidden();
  await expect(imgs.locator('.imgcard[data-kind="reference"] img')).toHaveCount(1);
  // La même image dans le même plan : proposée comme « déjà là ».
  await imgs.getByRole('button', { name: 'Bibliothèque…' }).click();
  await expect(pick.getByRole('option').first()).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(pick).toBeHidden();

  // Une image glissée directement sur un plan entre aussi dans la bibliothèque (et n'y est pas dupliquée).
  await imgs.getByRole('radio', { name: 'Repérage' }).click();
  await imgs.locator('input[type=file]').setInputFiles([{ ...png, name: 'encore.png' }]);
  await expect(page.getByRole('status')).toContainText('déjà dans la bibliothèque');
  // Le panneau Images est resté ouvert sous le tableau.
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await expect(lib.locator('.libcard .usage')).toHaveText('1/1 (rep.) · 2/1 (rep. + réf.)');

  // 0.18 : glisser l'image sur un plan du tableau, puis choisir Repérage ou Référence.
  await lib.locator('.libcard').first().dragTo(page.locator('.line [id$="-action"]').nth(2));
  const choice = page.getByRole('dialog', { name: 'Type d’image' });
  await expect(choice).toContainText('1 image pour le plan 1/3');
  await page.keyboard.press('f');
  await expect(choice).toBeHidden();
  await expect(lib.locator('.libcard .usage')).toHaveText('1/1 (rep.) · 1/3 (réf.) · 2/1 (rep. + réf.)');
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/3');

  // Hauteur du panneau : réglable au clavier, gardée sur ce Mac ; × le ferme.
  const drawer = page.getByRole('region', { name: 'Panneau Images' });
  const h0 = (await drawer.boundingBox())!.height;
  await drawer.getByRole('separator', { name: 'Hauteur du panneau Images' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await drawer.boundingBox())!.height).toBe(h0 + 20);
  await page.getByRole('banner', { name: 'Barre du haut' }).getByRole('button', { name: 'Images', exact: true }).click();
  await expect(drawer).toHaveCount(0);
});

test('0.14 : dossiers dans les images — créer, ranger (menu ou glisser), dossiers dans des dossiers, supprimer sans perdre d’image', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const decor = { name: 'decor.png', mimeType: 'image/png', buffer: readFileSync('e2e/plan-decor.png') };
  await page.keyboard.press('ControlOrMeta+Alt+3');
  const lib = page.getByRole('region', { name: 'Bibliothèque d’images' });
  const tree = lib.getByRole('navigation', { name: 'Dossiers' });
  await lib.locator('input[type=file]').setInputFiles([png, decor]);
  await expect(lib.locator('.libcard')).toHaveCount(2);

  // Nouveau dossier : nommé tout de suite.
  await tree.getByRole('button', { name: '+ Dossier' }).click();
  const name = tree.getByLabel('Nom du dossier');
  await expect(name).toBeFocused();
  await name.fill('Repérages');
  await name.press('Enter');
  await expect(lib.getByRole('heading', { level: 2 })).toHaveText('Repérages');
  await expect(lib.locator('.libcard')).toHaveCount(0);
  // Dossier dans le dossier ouvert ; une image importée ici y est rangée.
  await tree.getByRole('button', { name: '+ Dossier' }).click();
  await tree.getByLabel('Nom du dossier').fill('Gare');
  await tree.getByLabel('Nom du dossier').press('Enter');
  await expect(lib.getByRole('heading', { level: 2 })).toHaveText('Repérages › Gare');
  // Renommer : double-clic dans la liste.
  await tree.getByRole('button', { name: 'Dossier Gare' }).dblclick();
  await tree.getByLabel('Nom du dossier').fill('Quai de gare');
  await tree.getByLabel('Nom du dossier').press('Enter');
  await expect(lib.getByRole('heading', { level: 2 })).toHaveText('Repérages › Quai de gare');

  // Ranger par le menu de la carte.
  await tree.getByRole('button', { name: 'Toutes les images' }).click();
  await lib.getByRole('button', { name: 'Ranger quai.png dans' }).click();
  await page.getByRole('option', { name: /Quai de gare/ }).click();
  await expect(lib.getByRole('button', { name: 'Ranger quai.png dans' })).toHaveText('▸ Repérages › Quai de gare');
  await expect(tree.getByRole('button', { name: 'Dossier Repérages' })).toContainText('1');
  // Ranger en glissant la carte sur un dossier.
  await lib.locator('.libcard', { hasText: 'decor.png' }).dragTo(tree.getByRole('button', { name: 'Dossier Repérages' }));
  await expect(lib.getByRole('button', { name: 'Ranger decor.png dans' })).toHaveText('▸ Repérages');
  await expect(tree.getByRole('button', { name: 'Non rangées' })).toContainText('0');
  await tree.getByRole('button', { name: 'Dossier Repérages' }).click();
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/34-dossiers-images.png' });

  // Supprimer « Repérages » : aucune image perdue, « Gare » remonte à la racine.
  await lib.getByRole('button', { name: 'Supprimer le dossier' }).click();
  await expect(page.getByRole('status')).toContainText('supprimé');
  await expect(lib.getByRole('heading', { level: 2 })).toHaveText('Non rangées');
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await expect(tree.getByRole('button', { name: 'Dossier Quai de gare' })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Toutes les images' })).toContainText('2');
  // ⌘Z : le dossier revient, ses images aussi.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(tree.getByRole('button', { name: 'Dossier Repérages' })).toBeVisible();
  await tree.getByRole('button', { name: 'Dossier Repérages' }).click();
  await expect(lib.locator('.libcard')).toHaveCount(1);

  // Choix pour un plan : on peut n'afficher qu'un dossier.
  await page.keyboard.press('ControlOrMeta+1');
  await page.locator('.line [id$="-action"]').nth(1).click();
  await page.getByRole('region', { name: 'Images', exact: true }).getByRole('button', { name: 'Bibliothèque…' }).click();
  const pick = page.getByRole('dialog', { name: 'Bibliothèque d’images' });
  await expect(pick.getByRole('option')).toHaveCount(2);
  await pick.getByRole('button', { name: 'Dossier affiché' }).click();
  await page.getByRole('option', { name: /Quai de gare/ }).click();
  await expect(pick.getByRole('option')).toHaveCount(1);
});

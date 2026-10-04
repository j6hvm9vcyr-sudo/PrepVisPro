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
  await page.keyboard.press('ControlOrMeta+6');
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
  await page.getByRole('region', { name: 'Références' }).getByRole('button', { name: 'Bibliothèque…' }).click();
  const pick = page.getByRole('dialog', { name: 'Bibliothèque d’images' });
  await expect(pick).toContainText('Images pour le plan 2/1');
  await expect(pick.getByRole('radio', { name: 'Référence' })).toHaveAttribute('aria-checked', 'true');
  await pick.getByRole('option').first().getByRole('button').click();
  await pick.getByRole('button', { name: 'Ajouter' }).click();
  await expect(pick).toBeHidden();
  await expect(page.getByRole('region', { name: 'Références' }).locator('img')).toHaveCount(1);
  // La même image dans le même plan : proposée comme « déjà là ».
  await page.getByRole('region', { name: 'Références' }).getByRole('button', { name: 'Bibliothèque…' }).click();
  await expect(pick.getByRole('option').first()).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(pick).toBeHidden();

  // Une image glissée directement sur un plan entre aussi dans la bibliothèque (et n'y est pas dupliquée).
  await page.getByRole('region', { name: 'Repérage' }).locator('input[type=file]').setInputFiles([{ ...png, name: 'encore.png' }]);
  await expect(page.getByRole('status')).toContainText('déjà dans la bibliothèque');
  await page.keyboard.press('ControlOrMeta+6');
  await expect(lib.locator('.libcard')).toHaveCount(1);
  await expect(lib.locator('.libcard .usage')).toHaveText('1/1 (rep.) · 2/1 (rep. + réf.)');
});

import { expect, test } from '@playwright/test';

test('accueil : ouvrir l’exemple, puis le projet indique qu’il n’est pas enregistré', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PrepVisPro' })).toBeVisible();
  await page.screenshot({ path: 'test-results/00-accueil.png' });
  await page.getByRole('button', { name: 'Ouvrir l’exemple' }).click();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeVisible();
  await expect(page.locator('.save-state.unsaved')).toContainText('Non enregistré');
});

test('accueil : projet vierge prêt à saisir', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Projet vierge' }).click();
  await expect(page.locator('.line.first')).toHaveCount(1);
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.type('gp');
  await page.keyboard.press('Enter');
  await expect(page.locator('.line [id$="-size"]').first()).toHaveText('GP');
});

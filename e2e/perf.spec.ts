import { expect, test } from '@playwright/test';

test('grand projet (360 plans) : la navigation et la saisie restent instantanées', async ({ page }) => {
  await page.goto('/?exemple=grand');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await expect(page.locator('.line.first')).toHaveCount(360);
  const t0 = Date.now();
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.line.sel .c.code b')).toHaveText('4/5');
  const nav = (Date.now() - t0) / 40;
  const t1 = Date.now();
  await page.keyboard.type('gp');
  await page.keyboard.press('Enter');
  await expect(page.locator('.line [id$="-size"]').nth(40)).toHaveText('GP');
  const edit = Date.now() - t1;
  console.log(`déplacement : ${nav.toFixed(0)} ms/touche · saisie validée : ${edit} ms`);
  expect(nav).toBeLessThan(60);
  expect(edit).toBeLessThan(800);
});

test('sélection au clavier puis collage sur plusieurs plans', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight'); // Machinerie
  await page.evaluate(() => navigator.clipboard.writeText('Dolly'));
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('.cell.inrange')).toHaveCount(3);
  await expect(page.locator('.status .msg')).toContainText('3 cellules sélectionnées');
  await page.screenshot({ path: 'test-results/10-selection.png' });
  await page.keyboard.press('ControlOrMeta+v');
  await expect(page.locator('.line [id$="-grip"]').nth(2)).toHaveText('Dolly');
  await expect(page.locator('.status .msg')).toContainText('3 cellules collées');
});

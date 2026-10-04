import { expect, test, type Page } from '@playwright/test';
import { PNG_160x90_B64 } from '../src/test/fixtures';

const cell = (page: Page, row: number, col: string) => page.locator(`.line [id$="-${col}"]`).nth(row);

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

test('saisie clavier : suggestion, évolutif, Tab, Entrée', async ({ page }) => {
  await page.screenshot({ path: 'test-results/01-ouverture.png' });
  // Le curseur est sur la Valeur du plan 1/1.
  await page.keyboard.type('ens > po');
  await expect(page.locator('.pop .sug.on')).toHaveText('Poitrine');
  await page.screenshot({ path: 'test-results/02-suggestion.png' });
  await page.keyboard.press('Tab');
  await expect(cell(page, 0, 'size')).toHaveText('Ensemble → Poitrine');
  await expect(cell(page, 0, 'size')).toHaveClass(/evol/);
  // Le curseur est passé à Axe.
  await expect(cell(page, 0, 'axis')).toHaveClass(/active/);
  await page.keyboard.type('pr');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'axis')).toHaveText('Profil');
  // Entrée descend : on est sur l'axe du plan 1/2.
  await expect(cell(page, 1, 'axis')).toHaveClass(/active/);
});

test('terme inconnu : jamais deviné, création explicite', async ({ page }) => {
  await page.keyboard.type('pied');
  await expect(page.locator('.pop .sug.on')).toContainText('Créer « Pied »');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 'size')).toHaveText('Pied');
  await expect(cell(page, 0, 'size')).toHaveClass(/custom/);
  await expect(page.locator('.status .msg')).toContainText('Terme ajouté');
});

test('focale invalide : message, la saisie reste ouverte', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(cell(page, 0, 'focal')).toHaveClass(/active/);
  await page.keyboard.type('longue');
  await page.keyboard.press('Enter');
  await expect(page.locator('.pop .err')).toContainText('Focale');
  await page.keyboard.press('Escape');
  await expect(cell(page, 0, 'focal')).toHaveText('32 mm');
});

test('⌘↩ nouveau plan hérité, renumérotation, ⌘Z', async ({ page }) => {
  const before = await page.locator('.line.first').count();
  await page.keyboard.press('Meta+Enter');
  await expect(page.locator('.editor input')).toBeFocused();
  await page.keyboard.type('Nouveau plan de test');
  await page.keyboard.press('Tab');
  await expect(page.locator('.line.first')).toHaveCount(before + 1);
  await expect(page.locator('.line.first .code b').nth(1)).toHaveText('1/2');
  await expect(cell(page, 1, 'action')).toHaveText('Nouveau plan de test');
  await expect(cell(page, 1, 'size')).toHaveText('Ensemble');
  await page.screenshot({ path: 'test-results/03-nouveau-plan.png' });
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Meta+z');
  await expect(page.locator('.line.first')).toHaveCount(before);
  await page.keyboard.press('Meta+Shift+z');
  await expect(page.locator('.line.first')).toHaveCount(before + 1);
});

test('filtre des plans à compléter et repli de séquence', async ({ page }) => {
  await page.getByRole('button', { name: /à compléter/ }).click();
  await expect(page.locator('.line.first')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/04-filtre.png' });
  await page.getByRole('button', { name: /tout afficher/ }).click();
  await page.getByRole('button', { name: 'Replier la séquence 1' }).click();
  await expect(page.locator('.line.first')).toHaveCount(4);
});

test('images : dépôt sur la vignette, choix Repérage, aperçu à l’espace', async ({ page }) => {
  const png = Buffer.from(PNG_160x90_B64, 'base64');
  const dt = await page.evaluateHandle((b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const d = new DataTransfer();
    d.items.add(new File([arr], 'reperage.png', { type: 'image/png' }));
    return d;
  }, png.toString('base64'));
  const target = cell(page, 0, 'image');
  await target.dispatchEvent('dragover', { dataTransfer: dt });
  await target.dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByRole('dialog', { name: 'Type d’image' })).toBeVisible();
  await page.keyboard.press('r');
  await expect(page.locator('.line.first').first().locator('.thumb img')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Repérage' }).locator('img')).toHaveCount(1);
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’image' })).toBeVisible();
  await page.keyboard.press(' ');
  await expect(page.getByRole('dialog', { name: 'Aperçu de l’image' })).toHaveCount(0);
});

test('multicaméra et évolutif visibles, vue fiches, thème sombre', async ({ page }) => {
  await expect(page.locator('.camtag', { hasText: 'B' })).toHaveCount(1);
  await page.keyboard.press('Meta+2');
  await expect(page.locator('.card')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/05-fiches.png' });
  await page.keyboard.press('Meta+1');
  await page.getByRole('button', { name: /Thème/ }).click();
  await page.getByRole('button', { name: /Thème/ }).click();
  await page.screenshot({ path: 'test-results/06-sombre.png' });
});

test('modifier une séquence', async ({ page }) => {
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  const dlg = page.getByRole('dialog', { name: /Séquence/ });
  await dlg.getByLabel('Décor').fill('Gare du Nord');
  await dlg.getByLabel('Effet').selectOption('NUIT');
  await page.screenshot({ path: 'test-results/07-sequence.png' });
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  await expect(page.locator('.band .ttl').first()).toHaveText('EXT. GARE DU NORD — NUIT');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('réglages : largeur capteur donne un angle de champ', async ({ page }) => {
  await page.getByRole('button', { name: 'Réglages' }).click();
  await page.getByRole('tab', { name: 'Caméras' }).click();
  await page.getByLabel('Largeur capteur').first().fill('36');
  await page.getByRole('button', { name: 'Terminé' }).click();
  // 1/1 : 32 mm sur 36 mm de large → 2·atan(36/64) = 58,7°
  await expect(page.locator('.camrow .fov .mono').first()).toHaveText('58,7°');
});

test('enchaîner les plans sans quitter le clavier : action, ⌘↩, action…', async ({ page }) => {
  await page.keyboard.press('Meta+Enter');
  await page.keyboard.type('Premier nouveau plan');
  await page.keyboard.press('Meta+Enter');
  await page.keyboard.type('Second nouveau plan');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 'action')).toHaveText('Premier nouveau plan');
  await expect(cell(page, 2, 'action')).toHaveText('Second nouveau plan');
  await expect(page.locator('.line.first .code b').nth(2)).toHaveText('1/3');
});

test('copier-coller d’une cellule au clavier', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.keyboard.press('ControlOrMeta+c');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ControlOrMeta+v');
  await expect(cell(page, 1, 'size')).toHaveText('Ensemble');
  await expect(page.locator('.status .msg')).toContainText('1 cellule collée');
});

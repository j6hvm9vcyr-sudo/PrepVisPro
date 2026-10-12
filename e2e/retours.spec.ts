import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

type Memory = { published: Map<string, { bytes: Uint8Array }>; retours: Map<string, { name: string; text: string }[]>; nextRetours: { name: string; text: string } | null };
const FOLDER = '/Drive/Le Quai/Image';
const HTML = `${FOLDER}/Exemple — Le Quai — découpage interactif.html`;

async function publishedText(page: Page, path: string): Promise<string> {
  const bytes = await page.evaluate((p) => [...(window as unknown as { __prepvisMemory: Memory }).__prepvisMemory.published.get(p)!.bytes], path);
  return Buffer.from(bytes).toString('utf8');
}

test('0.21 : découpage interactif publié — révisions marquées « * », retours enregistrés puis repris dans le projet', async ({ page, context }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  const bar = page.getByRole('banner', { name: 'Panneaux' });
  await bar.getByRole('button', { name: 'Publier', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Publier' });
  await dlg.getByRole('button', { name: 'Choisir…' }).click();
  await dlg.getByRole('button', { name: 'Publier (publication 1 · blanche)' }).click();
  await expect(dlg.getByRole('status')).toContainText('Publication 1 :');
  await page.keyboard.press('Escape');

  // Un plan modifié, puis publication 2 : le plan est marqué « * » dans le découpage interactif.
  await page.locator('.line [id$="-focal"]').first().click();
  await page.keyboard.type('40');
  await page.keyboard.press('Enter');
  await expect(page.locator('.rev-mark')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+P');
  await dlg.getByRole('button', { name: 'Publier (publication 2 · bleue)' }).click();
  await expect(dlg.getByRole('status')).toContainText('Publication 2 :');
  await page.keyboard.press('Escape');
  await expect(page.locator('.rev-mark')).toHaveCount(0);
  const html = await publishedText(page, HTML);

  // Le fichier publié, ouvert dans un navigateur.
  const viewer = await context.newPage();
  await viewer.route('https://partage.test/decoupage.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await viewer.goto('https://partage.test/decoupage.html');
  await expect(viewer.locator('header')).toContainText('Publication 2 · révision bleue');
  await expect(viewer.locator('header')).toContainText('* 1 plan modifié depuis la publication 1');
  await viewer.getByRole('group', { name: 'Métier' }).getByRole('button', { name: 'Image' }).click();
  const revised = viewer.locator('main .card').filter({ has: viewer.locator('.star', { hasText: '*' }) });
  await expect(revised).toHaveCount(1);
  await expect(revised).toContainText('Focale');
  await viewer.getByRole('checkbox', { name: 'Seulement les changements *' }).check();
  await expect(viewer.locator('main .card')).toHaveCount(1);
  await viewer.getByRole('checkbox', { name: 'Seulement les changements *' }).uncheck();

  // Retour 1 : à revoir, un mot, une focale proposée.
  await revised.click();
  const side = viewer.getByRole('complementary', { name: 'Détails' });
  await side.getByRole('button', { name: 'À revoir' }).click();
  await side.getByRole('textbox', { name: /^Votre retour sur/ }).fill('Plutôt un 50');
  await side.getByRole('combobox', { name: 'Réglage proposé' }).selectOption('focal');
  await side.getByRole('textbox', { name: 'Valeur proposée' }).fill('50');
  await side.getByRole('textbox', { name: 'Valeur proposée' }).press('Tab');
  // Retour 2 : un autre plan validé.
  const other = viewer.locator('main .card').filter({ hasNot: viewer.locator('.star', { hasText: '*' }) }).first();
  await other.click();
  await side.getByRole('button', { name: '✓ Validé' }).click();
  // Retour 3 : un mot sur la séquence.
  await viewer.locator('main .seqh').first().click();
  await side.getByRole('textbox', { name: /^Votre retour sur Séq/ }).fill('Lumière trop dure');
  await side.getByRole('textbox', { name: /^Votre retour sur Séq/ }).press('Tab');
  await expect(viewer.locator('footer')).toContainText('3 retours à envoyer');
  await viewer.screenshot({ path: 'test-results/41-decoupage-interactif.png' });

  await viewer.getByRole('button', { name: 'Enregistrer mes retours…' }).click();
  const save = viewer.getByRole('dialog', { name: 'Enregistrer mes retours' });
  await save.getByRole('textbox', { name: 'Votre nom' }).fill('Margaux');
  const [download] = await Promise.all([viewer.waitForEvent('download'), save.getByRole('button', { name: 'Enregistrer le fichier' }).click()]);
  expect(download.suggestedFilename()).toBe('Retours Exemple — Le Quai — publication 2 — Margaux.topshot-retours');
  const text = readFileSync(await download.path(), 'utf8');
  const file = JSON.parse(text) as { role: string; publication: number; items: unknown[] };
  expect(file.role).toBe('Image');
  expect(file.publication).toBe(2);
  expect(file.items).toHaveLength(3);
  await save.getByRole('button', { name: 'OK' }).click();
  await expect(viewer.locator('footer')).toContainText('0 retour à envoyer');
  await viewer.close();

  // Déposé dans « Retours » du dossier de diffusion : trouvé, puis rangé avec le projet.
  await page.evaluate(([folder, t]) => (window as unknown as { __prepvisMemory: Memory }).__prepvisMemory.retours.get(folder!)!.push({ name: 'Retours Margaux.topshot-retours', text: t! }), [FOLDER, text]);
  await bar.getByRole('button', { name: 'Retours', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Retours' });
  await expect(panel.getByRole('status')).toContainText('1 fichier de retours dans « Retours »');
  await expect(panel.getByRole('status')).toContainText('Margaux · Image · publication 2 · 3 retours');
  await panel.getByRole('button', { name: 'Ranger avec le projet' }).click();
  await expect(bar.getByRole('button', { name: 'Retours : 3' })).toBeVisible();
  const card = panel.getByRole('region', { name: 'Retours de Margaux' });
  await expect(card.locator('.ret-item')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/42-retours.png' });

  // Le même fichier reçu par mail : déjà là.
  await page.evaluate((t) => void ((window as unknown as { __prepvisMemory: Memory }).__prepvisMemory.nextRetours = { name: 'Retours Margaux.topshot-retours', text: t }), text);
  await panel.getByRole('button', { name: 'Importer un fichier…' }).click();
  await expect(page.getByText('Ces retours de Margaux (image) sont déjà là')).toBeVisible();

  // Reprendre la focale proposée : la case s'ouvre avec 50, ↩ valide.
  const proposal = card.locator('.ret-item').filter({ hasText: 'Plutôt un 50' });
  await proposal.getByRole('button', { name: 'Reprendre' }).click();
  await expect(page.locator('.editor input, .editor textarea').first()).toHaveValue('50');
  await page.keyboard.press('Enter');
  await expect(card.locator('.ret-item')).toHaveCount(2);
  await expect(card).toContainText('1 traité');
  await expect(page.locator('.line [id$="-focal"]').first()).toContainText('50');
  await expect(page.locator('.rev-mark')).toHaveCount(1);

  // Le plan validé devient une note ; le mot sur la séquence est laissé de côté.
  await card.locator('.ret-item').filter({ hasText: '✓ validé' }).getByRole('button', { name: 'En note' }).click();
  await card.locator('.ret-item').filter({ hasText: 'Lumière trop dure' }).getByRole('button', { name: 'Ignorer' }).click();
  await expect(card).toContainText('3 traités · tout est traité');
  await expect(bar.getByRole('button', { name: 'Retours', exact: true })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+4');
  await expect(page.locator('.notes-panel')).toContainText('Margaux (image) · validé');
});

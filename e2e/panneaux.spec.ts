import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('0.18 : barre du haut — panneaux du Découpage, une seule chose à droite, disposition gardée', async ({ page }) => {
  const bar = page.getByRole('banner', { name: 'Panneaux' });
  const tog = (name: string) => bar.getByRole('button', { name, exact: true });
  const film = page.getByRole('navigation', { name: 'Le film' });
  const details = page.getByRole('complementary', { name: 'Détails du plan' });
  const notes = page.getByRole('complementary', { name: 'Notes' });
  // Par défaut : Le film et Détails.
  await expect(tog('Le film')).toHaveAttribute('aria-pressed', 'true');
  await expect(tog('Détails')).toHaveAttribute('aria-pressed', 'true');
  await expect(film).toBeVisible();
  await expect(details).toBeVisible();
  // Le projet au centre de la barre.
  await expect(bar.locator('.proj-menu .lbl')).toHaveText('Exemple — Le Quai');
  await expect(bar).toContainText('4 séquences · 8 plans');

  // Boutons et raccourcis (⌥⌘1 à ⌥⌘4) ; le clavier reste au tableau.
  await tog('Le film').click();
  await expect(film).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Alt+1');
  await expect(film).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Alt+3');
  await expect(page.getByRole('region', { name: 'Panneau Images' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+3');
  await expect(page.getByRole('region', { name: 'Panneau Images' })).toHaveCount(0);

  // À droite, une seule chose : Notes remplace Détails, qui revient quand on ferme les notes.
  await page.keyboard.press('ControlOrMeta+Alt+4');
  await expect(notes).toBeVisible();
  await expect(details).toHaveCount(0);
  await expect(tog('Détails')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ControlOrMeta+Alt+4');
  await expect(details).toBeVisible();
  // ⌘I ferme les détails ; Notes puis Détails : les notes se ferment.
  await page.keyboard.press('ControlOrMeta+i');
  await expect(details).toHaveCount(0);
  await tog('Notes').click();
  await tog('Détails').click();
  await expect(details).toBeVisible();
  await expect(notes).toHaveCount(0);
  // À vérifier prend la place, puis la rend.
  await page.getByRole('button', { name: /^À vérifier/ }).click();
  await expect(page.getByRole('complementary', { name: 'À vérifier' })).toBeVisible();
  await expect(details).toHaveCount(0);
  await page.getByRole('button', { name: 'Fermer À vérifier' }).click();
  await expect(details).toBeVisible();

  // Liste / Fiches (⌥⌘L), dans la barre de la surface.
  const view = page.getByRole('group', { name: 'Affichage du découpage' });
  await page.keyboard.press('ControlOrMeta+Alt+l');
  await expect(view.getByRole('button', { name: 'Fiches' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.card')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/38-panneaux-fiches.png' });
  await view.getByRole('button', { name: 'Liste' }).click();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeVisible();

  // Pages : ⌘1 ⌘2 ⌘3. Tournage et Plans au sol ont chacun leur liste à gauche et leurs détails (0.19).
  await page.keyboard.press('ControlOrMeta+3');
  await expect(page.locator('.days-board')).toBeVisible();
  await expect(tog('Scénario')).toHaveCount(0);
  await tog('Le film').click();
  await expect(film).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+2');
  await expect(tog('Le film')).toHaveAttribute('aria-pressed', 'true');
  await expect(tog('Images')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+1');
  await expect(film).toBeVisible();

  // Disposition gardée (préférences de ce Mac) : Scénario ouvert, Le film fermé, après relance.
  await page.keyboard.press('ControlOrMeta+Alt+2');
  await page.keyboard.press('ControlOrMeta+Alt+1');
  await page.screenshot({ path: 'test-results/39-panneaux-scenario.png' });
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await expect(tog('Scénario')).toHaveAttribute('aria-pressed', 'true');
  await expect(film).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Scénario' })).toBeVisible();
});

import { expect, test } from '@playwright/test';

const cell = (page: import('@playwright/test').Page, row: number, col: string) => page.locator(`.line [id$="-${col}"]`).nth(row);

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('0.13 : notes datées par plan et par séquence, cochées, rassemblées dans la vue Notes, colonne du tableau', async ({ page }) => {
  // Détails du plan 1/2 : deux notes prises au clavier, l'une cochée.
  await cell(page, 1, 'action').click();
  const card = page.getByRole('region', { name: 'Notes du plan' });
  const add = card.getByLabel('Nouvelle note du plan');
  await add.fill('Repérer la fenêtre du wagon');
  await add.press('Enter');
  await add.fill('Prévoir un réflecteur');
  await add.press('Enter');
  await expect(add).toBeFocused();
  await expect(add).toHaveValue('');
  await expect(card.getByRole('textbox', { name: 'Note : Repérer la fenêtre du wagon' })).toBeVisible();
  // Datée du jour.
  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  await expect(card.locator('.note-date').first()).toHaveText(today);
  await card.getByRole('checkbox', { name: 'Fait : Prévoir un réflecteur' }).check();
  // Modifiée sur place.
  // (son nom suit son texte : on la prend par sa place)
  const t = card.locator('.note-text').first();
  await t.fill('Repérer la fenêtre côté quai');
  await t.press('Enter');
  await expect(t).not.toBeFocused();
  await expect(card.getByRole('textbox', { name: 'Note : Repérer la fenêtre côté quai' })).toBeVisible();

  // Colonne Notes du tableau : les notes à faire ; masquée par défaut (menu Colonnes, réglage du projet).
  await expect(page.getByRole('columnheader', { name: 'Notes' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Colonnes/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Notes' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader', { name: 'Notes' })).toBeVisible();
  const notesCells = page.locator('.line.first .notes-c');
  await expect(notesCells.nth(1)).toHaveText('Repérer la fenêtre côté quai');
  await expect(notesCells.nth(0)).toHaveText('✓ 1 faite');
  await expect(notesCells.nth(2)).toHaveText('Essayer la vitesse du zoom au moteur');
  // Notes de la séquence sous son bandeau.
  await expect(page.locator('.seq-comments').first()).toContainText('Demander à la gare les horaires des trains');
  await page.screenshot({ path: 'test-results/32-colonne-notes.png' });
  // Un clic sur une case Notes : prêt à prendre une note pour ce plan.
  await notesCells.nth(3).click();
  await expect(page.getByLabel('Nouvelle note du plan')).toBeFocused();
  await page.keyboard.press('Escape');

  // Panneau Notes (⌥⌘4) : tout le film, séquence par séquence.
  await page.keyboard.press('ControlOrMeta+Alt+4');
  const view = page.locator('.notes-panel');
  await expect(view.getByRole('group', { name: 'Notes affichées' }).getByRole('button', { name: 'À faire' })).toHaveAttribute('aria-pressed', 'true');
  const seq1 = view.getByRole('region', { name: 'Notes de la séquence 1' });
  await expect(seq1).toContainText('Demander à la gare les horaires des trains');
  await expect(seq1).toContainText('Repérer la fenêtre côté quai');
  // « À faire » : les notes faites sont cachées.
  await expect(seq1.getByRole('textbox', { name: 'Note : Prévoir un réflecteur' })).toHaveCount(0);
  await expect(seq1.getByRole('button', { name: 'Ouvrir le plan 1/1' })).toHaveCount(0);
  await view.getByRole('button', { name: 'Toutes' }).click();
  await expect(seq1.getByRole('textbox', { name: 'Note : Prévoir un réflecteur' })).toBeVisible();
  await expect(seq1.getByRole('button', { name: 'Ouvrir le plan 1/1' })).toBeVisible();
  await expect(view.locator('.nv-count')).toHaveText('3 à faire · 5 en tout');
  // Note de séquence prise ici ; retrouvée dans la fiche de la séquence.
  const seq3 = view.getByRole('region', { name: 'Notes de la séquence 3' });
  await seq3.getByLabel('Nouvelle note de la séquence 3').fill('Lampe de jeu : 60 W, à vérifier');
  await seq3.getByLabel('Nouvelle note de la séquence 3').press('Enter');
  await expect(view.locator('.nv-count')).toHaveText('4 à faire · 6 en tout');
  await page.screenshot({ path: 'test-results/33-vue-notes.png' });
  // Retirée, puis rétablie (⌘Z).
  await seq3.getByRole('button', { name: 'Retirer la note : Lampe de jeu : 60 W, à vérifier' }).click();
  await expect(view.locator('.nv-count')).toHaveText('3 à faire · 5 en tout');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(view.locator('.nv-count')).toHaveText('4 à faire · 6 en tout');
  // Un plan s'ouvre dans le tableau.
  await seq1.getByRole('button', { name: 'Ouvrir le plan 1/3' }).click();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeVisible();
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/3');
  await page.getByRole('button', { name: 'Modifier la séquence 3' }).click();
  await expect(page.getByRole('dialog', { name: 'Séquence' }).getByRole('region', { name: 'Notes de la séquence' }).getByRole('textbox', { name: 'Note : Lampe de jeu : 60 W, à vérifier' })).toBeVisible();
});

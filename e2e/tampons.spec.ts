import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

test('tampons : TITRE entre deux séquences, GÉNÉRIQUE DE FIN, déplacement, suppression, ⌘Z', async ({ page }) => {
  // Depuis la fiche de la séquence 1 : tampon inséré après.
  await page.getByRole('button', { name: 'Modifier la séquence 1' }).click();
  await page.getByRole('dialog', { name: /Séquence/ }).getByRole('button', { name: 'Insérer après' }).click();
  const dlg = page.getByRole('dialog', { name: 'Tampon' });
  await expect(dlg.getByLabel('Texte')).toBeFocused();
  await dlg.getByRole('button', { name: 'TITRE', exact: true }).click();
  await dlg.getByLabel('Précision (facultatif)').fill('sur noir, 10 s');
  await expect(dlg).toContainText('Placé avant la séquence 2.');
  await dlg.getByRole('button', { name: 'Terminé' }).click();
  await expect(dlg).toBeHidden();

  const bands = page.locator('.grid > .band .num, .grid > .stamp-band .stamp-text');
  await expect(bands).toHaveText(['SÉQ. 1', 'TITRE', 'SÉQ. 2', 'SÉQ. 3', 'SÉQ. 4']);
  await expect(page.getByRole('row', { name: 'Tampon TITRE' })).toContainText('sur noir, 10 s');
  // La numérotation des plans ne bouge pas.
  await expect(page.locator('.line.first .c.code b').first()).toHaveText('1/1');

  // Barre latérale : générique de fin après la dernière séquence (le curseur est sur la 1 : on va à la 4).
  await page.getByRole('navigation', { name: 'Le film' }).getByRole('button', { name: /^4 · / }).click();
  await page.getByRole('navigation', { name: 'Le film' }).getByRole('button', { name: '+ Tampon' }).click();
  await dlg.getByLabel('Texte').fill('Générique de fin');
  await expect(dlg).toContainText('Placé en fin de film');
  await dlg.getByLabel('Texte').press('Enter');
  await expect(bands).toHaveText(['SÉQ. 1', 'TITRE', 'SÉQ. 2', 'SÉQ. 3', 'SÉQ. 4', 'Générique de fin']);
  await expect(page.getByRole('navigation', { name: 'Le film' }).locator('.tree-stamp')).toHaveText(['TITRE', 'Générique de fin']);
  await page.screenshot({ path: 'test-results/30-tampons.png' });

  // Déplacer le TITRE d'un cran vers la fin : il passe après la séquence 2.
  await page.getByRole('row', { name: 'Tampon TITRE' }).getByRole('button').click();
  await dlg.getByRole('button', { name: '↓ Descendre' }).click();
  await expect(dlg).toContainText('Placé avant la séquence 3.');
  await dlg.getByRole('button', { name: 'Supprimer le tampon' }).click();
  await expect(dlg).toBeHidden();
  await expect(bands).toHaveText(['SÉQ. 1', 'SÉQ. 2', 'SÉQ. 3', 'SÉQ. 4', 'Générique de fin']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(bands).toHaveText(['SÉQ. 1', 'SÉQ. 2', 'TITRE', 'SÉQ. 3', 'SÉQ. 4', 'Générique de fin']);

  // Une séquence ajoutée à la fin se place avant le générique.
  await page.getByRole('navigation', { name: 'Le film' }).getByRole('button', { name: /^4 · / }).click();
  await page.getByRole('navigation', { name: 'Le film' }).getByRole('button', { name: '+ Séquence' }).click();
  await page.getByRole('dialog', { name: /Séquence/ }).getByRole('button', { name: 'Terminé' }).click();
  await expect(bands).toHaveText(['SÉQ. 1', 'SÉQ. 2', 'TITRE', 'SÉQ. 3', 'SÉQ. 4', 'SÉQ. 5', 'Générique de fin']);
});

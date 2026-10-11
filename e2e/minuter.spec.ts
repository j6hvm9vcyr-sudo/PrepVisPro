import { expect, test } from '@playwright/test';

test('0.16–0.18 : minuter une séquence à la lecture, dans le panneau Scénario — espace, ⌫, pause, relecture, enregistrement annulable', async ({ page }) => {
  // Horloge maîtrisée : les durées mesurées sont exactes.
  await page.clock.install();
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  const band = page.locator('.band').first();
  await expect(band).toContainText('4 plans · 18"');
  await page.getByRole('button', { name: 'Minuter la séquence 1' }).click();
  // Le minuteur s'ouvre dans le panneau Scénario, au-dessus de la scène.
  const dlg = page.getByRole('region', { name: 'Minuter la séquence 1' });
  await expect(page.getByRole('complementary', { name: 'Scénario' }).getByRole('region', { name: 'Minuter la séquence 1' })).toBeVisible();
  await expect(dlg.getByRole('status')).toContainText('Espace au début du plan 1/1');
  // La reprise 1/2B n'est pas minutée : elle a la durée de 1/2.
  await expect(dlg.locator('.tm-row.reprise')).toContainText('= 1/2');

  await page.keyboard.press('Space'); // début de 1/1
  await page.clock.runFor(3200);
  await page.keyboard.press('Space'); // 1/1 → 1/2
  await expect(dlg.getByRole('status')).toContainText('Plan 1/2');
  // Le plan en cours est sélectionné dans le tableau et surligné dans la scène.
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/2');
  await expect(page.locator('.scene-doc .lk.on')).toHaveText('Elle scrute les fenêtres du train.');
  await page.clock.runFor(1000);
  await page.keyboard.press('Space'); // trop tôt…
  await page.keyboard.press('Backspace'); // … annulé : 1/2 continue
  await expect(dlg.getByRole('status')).toContainText('Plan 1/2');
  await page.clock.runFor(2000);
  await page.keyboard.press('Space'); // 1/2 → 1/3 (3,0 s)
  await page.keyboard.press('p');
  await expect(dlg.getByRole('status')).toContainText('En pause');
  await page.clock.runFor(5000); // la pause ne compte pas
  await page.keyboard.press('p');
  await page.clock.runFor(6400);
  await expect(dlg.locator('.tm-clock')).toHaveText('6,4 s');
  await page.keyboard.press('Space'); // fin du dernier plan
  await expect(dlg.getByRole('status')).toContainText('Séquence minutée');
  await expect(dlg.locator('.tm-row.done')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/36-minuter.png' });

  // Relecture : 1/2 gardera sa durée d'avant.
  await dlg.getByRole('checkbox', { name: 'Enregistrer 3" pour le plan 1/2' }).uncheck();
  await dlg.getByRole('button', { name: 'Enregistrer les durées (2)' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.status')).toContainText('Séquence 1 minutée : 2 plans');
  // 3" + 4" (inchangée) + 6"
  await expect(band).toContainText('4 plans · 13"');

  // Une mesure en cours survit au changement de page (elle est gardée hors du panneau).
  await page.getByRole('button', { name: 'Minuter la séquence 1' }).click();
  await page.keyboard.press('Space');
  await page.clock.runFor(2000);
  await page.keyboard.press('Space');
  await page.keyboard.press('ControlOrMeta+3');
  await page.keyboard.press('ControlOrMeta+1');
  await expect(dlg.locator('.tm-row.done')).toHaveCount(1);
  // Fermer sans enregistrer : on le demande, rien n'est écrit.
  await page.keyboard.press('Escape');
  await expect(dlg.getByText('Fermer sans enregistrer les 1 durée mesurée ?')).toBeVisible();
  await dlg.getByRole('button', { name: 'Fermer sans enregistrer' }).click();
  await expect(dlg).toBeHidden();
  await expect(band).toContainText('4 plans · 13"');

  // Une seule étape d'annulation pour tout le minutage.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(band).toContainText('4 plans · 18"');
});

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
});

for (const [label, magic] of [
  ['PDF', '%PDF-'],
  ['Excel', 'PK'],
  ['CSV', '﻿Séquence'],
] as const) {
  test(`export ${label} depuis la fenêtre d’export`, async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+e');
    const dlg = page.getByRole('dialog', { name: 'Exporter' });
    await expect(dlg).toBeVisible();
    if (label === 'PDF') await page.screenshot({ path: 'test-results/08-export.png' });
    const download = page.waitForEvent('download');
    await dlg.getByRole('button', { name: label, exact: true }).click();
    const d = await download;
    // (Le nom de fichier proposé par le navigateur n'est pas fiable hors application Mac : on vérifie le contenu.)
    const bytes = readFileSync((await d.path())!);
    expect(bytes.toString('utf8', 0, magic === 'PK' ? 2 : magic.length + 3).startsWith(magic)).toBe(true);
    await expect(dlg.getByRole('status')).toContainText(label === 'CSV' ? 'Liste des plans' : 'Découpage');
  });
}

test('modèle personnalisé : colonnes, ordre, enregistrement', async ({ page }) => {
  await page.getByRole('button', { name: 'Exporter…' }).click();
  const dlg = page.getByRole('dialog', { name: 'Exporter' });
  await dlg.getByRole('radio', { name: 'Version réalisation' }).click();
  await dlg.getByLabel('Divers').check();
  await expect(dlg.getByText('Personnalisé (non enregistré)')).toBeVisible();
  await dlg.getByRole('button', { name: 'Enregistrer comme modèle…' }).click();
  await dlg.getByLabel('Nom du modèle').fill('Réal + divers');
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(dlg.getByRole('radio', { name: 'Réal + divers' })).toHaveAttribute('aria-checked', 'true');
});

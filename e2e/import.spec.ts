import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="5"><Content>
<Paragraph Type="Scene Heading" Number="1"><Text>EXT. QUAI DE GARE - JOUR</Text></Paragraph>
<Paragraph Type="Action"><Text>LÉA (30) attend, seule sur le quai. Le train arrive.</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="1A"><Text>EXT. PARKING DE LA GARE - JOUR</Text></Paragraph>
<Paragraph Type="Action"><Text>Une voiture se gare.</Text></Paragraph>
<Paragraph Type="Scene Heading" Number="2"><Text>INT. WAGON - JOUR</Text></Paragraph>
<Paragraph Type="Character"><Text>MARC</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>Tu es en retard.</Text></Paragraph>
</Content></FinalDraft>`;

test('importer un scénario dans le projet : aperçu, ajout dans l’ordre, texte de scène, annulation', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  // Le sélecteur de fichiers du navigateur (version web seulement) peut être lent à s'ouvrir sur
  // une machine chargée : on redemande une fois. Dans l'app Mac, c'est le sélecteur natif.
  let chooser = page.waitForEvent('filechooser', { timeout: 8000 });
  await page.keyboard.press('ControlOrMeta+Shift+i');
  const fc = await chooser.catch(async () => {
    chooser = page.waitForEvent('filechooser', { timeout: 15000 });
    await page.keyboard.press('ControlOrMeta+Shift+i');
    return chooser;
  });
  await fc.setFiles({ name: 'Le Quai v2.fdx', mimeType: 'application/xml', buffer: Buffer.from(FDX) });
  const dlg = page.getByRole('dialog', { name: 'Importer un scénario' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.status-pill.new')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/09-import.png' });
  await dlg.getByRole('button', { name: /Importer 3 scènes/ }).click();
  await expect(page.locator('.band .num')).toHaveText(['SÉQ. 1', 'SÉQ. 1A', 'SÉQ. 2', 'SÉQ. 3', 'SÉQ. 4']);
  await expect(page.locator('.status .msg')).toContainText('1 séquence ajoutée');
  // Le texte de la scène est consultable dans Détails.
  await page.getByRole('region', { name: 'Scénario' }).getByRole('button', { name: 'Voir' }).click();
  await expect(page.getByLabel('Texte de la scène 1')).toHaveValue(/Le train arrive/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.band .num')).toHaveCount(4);
});

test('nouveau projet depuis un scénario en texte (Fountain) ou en PDF', async ({ page }) => {
  await page.goto('/');
  const open = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Nouveau projet depuis un scénario…' }).click();
    await (await chooser).setFiles(file);
  };
  const txt = `Title: Le Quai\n\n1. INT. CHAMBRE D'AXEL - NUIT\n\nAxel ne dort pas.\n\n2. EXT. QUAI DE GARE - JOUR\n\nLe train entre en gare.\n`;
  await open({ name: 'Le Quai.fountain', mimeType: 'text/plain', buffer: Buffer.from(txt) });
  await expect(page.locator('.band .num')).toHaveText(['SÉQ. 1', 'SÉQ. 2']);
  await expect(page.locator('.band .ttl')).toHaveText(["INT. CHAMBRE D'AXEL — NUIT", 'EXT. QUAI DE GARE — JOUR']);
  await expect(page.locator('.proj-menu .lbl')).toHaveText('Le Quai');

  // PDF de scénario (numéros dans les deux marges, deux pages).
  await page.goto('/');
  await open({ name: 'scenario.pdf', mimeType: 'application/pdf', buffer: readFileSync(resolve('e2e/scenario.pdf')) });
  await expect(page.locator('.band .num')).toHaveText(['SÉQ. 1', 'SÉQ. 2', 'SÉQ. 3A']);
  await expect(page.locator('.band .ttl').nth(2)).toHaveText('INT. CUISINE — JOUR');
  await expect(page.locator('.proj-menu .lbl')).toHaveText('scenario');
});

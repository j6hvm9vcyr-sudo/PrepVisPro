import { expect, test } from '@playwright/test';

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
  await expect(page.getByLabel('Texte de la scène 1')).toHaveValue(/Le train arrive/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.band .num')).toHaveCount(4);
});

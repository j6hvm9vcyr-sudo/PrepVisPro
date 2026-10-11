import { expect, test, type Page } from '@playwright/test';

/** Sélectionne un passage du texte de la scène, comme à la souris. */
async function selectPassage(page: Page, text: string) {
  await page.evaluate((t) => {
    const root = document.querySelector('.scene-doc')!;
    const full = root.textContent ?? '';
    const start = full.indexOf(t);
    if (start < 0) throw new Error(`passage introuvable : ${t}`);
    const end = start + t.length;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    let pos = 0;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const len = n.textContent!.length;
      if (pos <= start && start <= pos + len) r.setStart(n, start - pos);
      if (pos <= end && end <= pos + len) {
        r.setEnd(n, end - pos);
        break;
      }
      pos += len;
    }
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
}

test('0.17–0.18 : panneau Scénario à côté du tableau — passages reliés aux plans, non couverts signalés, nouveau plan depuis un passage', async ({ page }) => {
  await page.goto('/?exemple');
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Alt+2');
  await expect(page.getByRole('button', { name: 'Scénario', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const pane = page.getByRole('region', { name: 'Texte de la scène' });
  await expect(pane).toContainText('SÉQ. 1');
  await expect(pane.locator('.scene-state')).toContainText('3 passages non couverts');
  // Le tableau entier reste à côté.
  await expect(page.locator('.line.first')).toHaveCount(8);
  // Le passage du plan sélectionné (1/1) est mis en avant.
  await expect(pane.locator('.lk.on')).toHaveText('LÉA (30) attend, seule sur le quai.');
  await expect(pane.locator('.unc').first()).toContainText('Un quai de gare');

  // Un clic sur un passage sélectionne son plan ; 1/2 et sa reprise 1/2B partagent le même : on passe de l'un à l'autre.
  await pane.locator('.lk', { hasText: 'Elle scrute' }).click();
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/2');
  await pane.locator('.lk', { hasText: 'Elle scrute' }).click();
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/2B');

  // Nouveau plan depuis un passage non couvert : placé dans l'ordre du texte (après 1/1), action à taper.
  await selectPassage(page, 'Au loin, un sifflet.');
  const pick = pane.getByRole('group', { name: 'Passage sélectionné' });
  await expect(pick).toContainText('« Au loin, un sifflet. »');
  await pick.getByRole('button', { name: 'Nouveau plan' }).click();
  await expect(page.getByRole('status')).toContainText('Plan 1/2 créé pour ce passage · 3 plans renumérotés');
  await expect(page.locator('.editor input')).toBeFocused();
  await page.keyboard.type('Un sifflet, au loin');
  await page.keyboard.press('Enter');
  await expect(page.locator('.line.sel .c.code b')).toHaveText('1/2');
  await expect(page.locator('.line.sel [id$="-action"]')).toHaveText('Un sifflet, au loin');
  await expect(pane.locator('.scene-state')).toContainText('2 passages non couverts');
  await expect(pane.locator('.lk.on')).toHaveText('Au loin, un sifflet.');
  await page.screenshot({ path: 'test-results/37-scenario.png' });

  // Relier un autre passage au plan sélectionné : son extrait change.
  await selectPassage(page, 'Il n’est pas là.');
  await pick.getByRole('button', { name: 'Relier au plan 1/2' }).click();
  await expect(pane.locator('.lk.on')).toHaveText('Il n’est pas là.');
  await expect(pane.locator('.unc', { hasText: 'Au loin' })).toHaveCount(1);
  // ⌘Z, deux fois : le passage, puis le plan.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pane.locator('.lk.on')).toHaveText('Au loin, un sifflet.');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pane.locator('.scene-state')).toContainText('3 passages non couverts');

  // Séquence sans texte : une ligne et un bouton.
  await page.getByRole('button', { name: /^2 · Wagon/ }).click();
  await expect(pane).toContainText('SÉQ. 2');
  await expect(pane).toContainText('Pas de texte pour cette scène.');
  await expect(pane.getByRole('button', { name: 'Importer un scénario…' })).toBeVisible();
  // Refermé (×), il le reste : la disposition des panneaux est gardée sur ce Mac.
  await page.getByRole('button', { name: 'Fermer Scénario' }).click();
  await expect(pane).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('grid', { name: 'Découpage' })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Texte de la scène' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Alt+2');
  await expect(page.getByRole('region', { name: 'Texte de la scène' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Texte de la scène' })).toBeVisible();
});

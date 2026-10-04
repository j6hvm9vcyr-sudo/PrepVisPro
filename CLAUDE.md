# PrepVisPro — mémo pour Claude

App Mac (Tauri 2 + React 19 + TypeScript strict) de préparation pour chef opérateur : découpage, plans au sol, plans feux, soleil, jours de tournage. Utilisateur : Adrien Rousseau. Interface et messages en français.

## Règles
- **Fiabilité d'abord** : une fonction pas parfaitement fiable n'est pas intégrée. Aucune valeur inventée ; une valeur préréglée cite sa source et sa plage.
- Une seule source de vérité (`ProjectDoc`) ; rien n'est recopié d'une vue à l'autre.
- Icônes PF_ICONES : jamais dans le dépôt (les tests utilisent `e2e/icones-test`).
- Chaque build livré a un numéro : `node scripts/bump-version.mjs X.Y.Z`.
- Messages à Adrien : courts. Pas de nouvelle fonction sans demande.
- Décisions du projet : doc `claude/decisions-projet.md` du Project claude.ai (à tenir à jour).

## Commandes (les mêmes que la CI, à lancer avant chaque push)
```
npm run typecheck && npm run lint && npm test
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run e2e
VITE_TEST_HOOKS=1 npx tauri build --debug --no-bundle && xvfb-run -a node tauri-e2e/run.mjs   # app réelle, avant une livraison
PW_CHROMIUM_PATH=… npx playwright test -c audit/audit.config.ts                                # captures de toutes les vues (test-results/audit)
```
Pendant le travail, ne lancer que les tests du sujet (`npx vitest run src/model/x.test.ts`, `npx playwright test e2e/x.spec.ts`).

## Carte du code
- `src/model/` : logique pure, testée. `types.ts` (format), `schema.ts` (zod + `checkIntegrity`), `migrate.ts` (une étape par version de format), `ops.ts`, `stamps.ts`, `library.ts`, `kit.ts` (Mon matériel), `template.ts` (projet suivant), `shotPresets.ts` (plans types), `floor*.ts`, `light.ts`, `sun*.ts`, `days.ts`, `links.ts`.
- `src/state/store.ts` : actions ; `commit()` passe par les nettoyages (`cleanupFloorRefs`, `cleanupShooting`, `cleanupDays`, `cleanupStamps`, `syncLibrary`).
- `src/ui/` (tableau, fiches, dialogues ; `Picker.tsx` = liste de choix à recherche, à utiliser au lieu d'un `<select>` qui sert de bouton), `src/floor/` (plan au sol, lumière), `src/export/` (`model.ts` commun, `pdf.tsx`, `excel.ts`), `src/import/` (scénarios), `src/platform/` (Tauri / navigateur ; `kit.ts` = fichier materiel.json), `src-tauri/` (Rust).

## Ajouter une donnée au format
1. `types.ts` + `SCHEMA_VERSION` + 1 ; 2. `schema.ts` (même ordre de clés que `defaults.ts`) et `checkIntegrity` ;
3. `migrate.ts` (étape + test) ; 4. `defaults.ts`, `sample.ts`, `testkit.ts` ; 5. vues, exports (`export/model.ts`), `diff.ts` (versions) ;
6. test de relecture à l'identique (`migrate.test.ts`).

## Pièges connus
- WebKit (app Mac) : composition de texte (accents), presse-papiers, focus ; les tests en app réelle les couvrent.
- `eslint .` porte aussi sur `scripts/` et `e2e/`.
- Pas de Prettier : le style est celui du dépôt (lignes longues).

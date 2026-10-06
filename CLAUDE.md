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
- `src/model/` : logique pure, testée. `types.ts` (format), `schema.ts` (zod + `checkIntegrity`), `migrate.ts` (une étape par version de format), `ops.ts`, `stamps.ts`, `library.ts`, `equipment.ts` (matériel du projet, reprise d'un autre projet), `template.ts` (projet suivant), `floorIcons.ts` (icônes des figures), `shotPresets.ts` (plans types), `prefs.ts` (préférences de l'app : plan suivant, abréviations — sur le Mac, pas dans le projet), `floor*.ts`, `light.ts`, `sun*.ts`, `days.ts`, `links.ts`, `verify.ts` (« À vérifier » et le code d'état unique vert / orange / gris).
- `src/state/prefs.ts` : préférences en mémoire + `preferences.json` (Rust `prefs.rs`, écriture atomique ; fichier illisible jamais écrasé sans le demander).
- `src/state/store.ts` : actions ; `commit()` passe par les nettoyages (`cleanupFloorRefs`, `cleanupShooting`, `cleanupDays`, `cleanupStamps`, `syncLibrary`).
- `src/ui/` (cadre 0.9 : `spaces.ts` = trois espaces Découpage / Plans au sol / Tournage, `Chrome.tsx` = barre du haut, arbre « Le film », À vérifier, barre d'état, `Info.tsx` = ⓘ ; tableau, fiches, dialogues ; `Settings.tsx` = Réglages du projet ⇧⌘,, `Preferences.tsx` = Préférences de l'app ⌘, ; `Picker.tsx` = liste de choix à recherche, à utiliser au lieu d'un `<select>` qui sert de bouton), `src/floor/` (plan au sol : `FloorView.tsx` = arbre + onglets Plan au sol · Lumière · Soleil, palette d'outils, plans de la séquence en bas ; lumière), `src/export/` (`model.ts` commun, `pdf.tsx`, `excel.ts`), `src/import/` (scénarios), `src/platform/` (Tauri / navigateur ; `kit.ts` = lecture seule de l'ancien materiel.json), `src-tauri/` (Rust).

## Ajouter une donnée au format
1. `types.ts` + `SCHEMA_VERSION` + 1 ; 2. `schema.ts` (même ordre de clés que `defaults.ts`) et `checkIntegrity` ;
3. `migrate.ts` (étape + test) ; 4. `defaults.ts`, `sample.ts`, `testkit.ts` ; 5. vues, exports (`export/model.ts`), `diff.ts` (versions) ;
6. test de relecture à l'identique (`migrate.test.ts`).

## Règles d'interface (0.9)
- Une explication = un ⓘ (`Info`) à droite d'un titre ; jamais de phrase posée dans la page.
- Un seul code d'état (`StateDot`, `verify.ts`) ; un seul « À vérifier ».
- Raccourcis seulement dans les menus, les infobulles et la fiche « ? » (⌘/).
- Gauche : structure du film ; centre : le travail ; droite : la sélection, refermable. État vide = une ligne + un bouton.

## Pièges connus
- WebKit (app Mac) : composition de texte (accents), presse-papiers, focus ; les tests en app réelle les couvrent.
- `eslint .` porte aussi sur `scripts/` et `e2e/`.
- Pas de Prettier : le style est celui du dépôt (lignes longues).

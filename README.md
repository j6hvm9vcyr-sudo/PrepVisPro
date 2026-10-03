# PrepVisPro

Logiciel macOS de préparation image pour chef opérateur : découpage technique, plans au sol, plans feux.
Une seule source de vérité ; tous les documents (PDF, Excel) en découlent.

## État

- **V1 en cours** : découpage (tableau au clavier, plans évolutifs, multicaméra, reprises, images de référence et de repérage), exports PDF/Excel, import Final Draft.
- Plus tard : plans au sol, plans feux, matériel, jours de tournage, pont 3D (Blender).

## Installer une version de test (Mac Apple Silicon)

1. Sur GitHub, onglet **Actions**, dernier passage vert de **CI**, section *Artifacts* : télécharger **PrepVisPro-mac**.
2. Ouvrir le `.dmg` et glisser PrepVisPro dans Applications.
3. La version de test n'est pas encore signée par Apple. Au premier lancement : clic droit sur l'application › **Ouvrir** › **Ouvrir**.
   Si macOS indique que l'application « est endommagée », ouvrir le Terminal et taper :
   `xattr -cr /Applications/PrepVisPro.app`

## Développement

Prérequis : Node 22, Rust (stable).

```sh
npm install
npm run dev          # interface seule dans le navigateur (http://localhost:1420)
npm run tauri dev    # application Mac complète
npm run check        # types + lint + tests unitaires
npm run e2e          # tests dans un vrai navigateur
```

## Organisation du code

- `src/model/` — le modèle de données et toute la logique métier, pure et testée (numérotation, lecture des saisies, complétude, optique, validation du fichier projet).
- `src/state/` — l'état de l'application et l'historique d'annulation.
- `src/ui/` — l'interface (React).
- `src/platform/` — ce qui dépend de l'environnement (fichiers, images, menus natifs).
- `src-tauri/` — l'enveloppe macOS (Rust, Tauri 2).
- `e2e/` — tests de bout en bout (Playwright).

## Principes

1. La fiabilité prime : une fonction non parfaitement fiable n'est pas intégrée.
2. Rien n'est deviné en silence : une saisie ambiguë est signalée, un terme nouveau est créé explicitement.
3. Tout ce qui se calcule (numéros, complétude, angle de champ) n'est jamais stocké.
4. Toute action est annulable (⌘Z).

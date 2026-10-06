# PrepVisPro

Application Mac de préparation image pour chef opérateur. Le découpage technique, les plans au sol, les plans feux, le soleil et les jours de tournage tiennent dans un seul projet : chaque information est saisie une fois, et tous les documents (PDF, Excel, CSV) en découlent.

## Ce qu'elle fait

Trois espaces qui partagent la même sélection : **Découpage** (tableau, fiches, images), **Plans au sol** (plans au sol, lumière, soleil), **Tournage** (jours, installations). Un seul « À vérifier » relève ce qui manque dans tout le projet.

- **Découpage** au clavier : valeur, axe, angle, focale, mouvement, machinerie ; plans évolutifs, multicaméra, reprises, numérotation automatique ; tampons entre séquences (TITRE, GÉNÉRIQUE DE FIN…).
- **Import de scénario** : Final Draft, Fountain, Word, PDF, texte.
- **Plans au sol** : fond (plan d'architecte PDF ou vue satellite), mise à l'échelle, caméras du découpage avec leur champ réel, personnages, positions de début et de fin.
- **Lumière** : projecteurs d'après les fiches des fabricants, gélatines LEE, réflecteurs à taux de réflexion publiés, éclairement et diaph sur les personnages, puissance par circuit ; soleil du décor (position GPS, date, heure).
- **Tournage** : installations, ordre de tournage, jours de tournage et matériel déduit.
- **Images** : bibliothèque du projet, chaque image importée une seule fois et réutilisable partout.
- **Travailler vite** : matériel du projet repris d’un autre projet, nouveau projet avec les réglages d’un autre, plans types ; dans les préférences de l’app (⌘,, pour tous les projets) : réglages repris par le plan suivant, abréviations ; figures du plan au sol dessinées avec les icônes PF_ICONES livrées avec l’app, ou vos propres icônes ; colonnes et rangées du tableau ajustables ; carte Caméra modifiable sur place.
- **Exports** : découpage technique PDF et Excel, plans au sol, ordre de tournage, jours et matériel.

Aucune valeur n'est inventée : sans donnée fiable (fiche fabricant, capteur, échelle), l'application n'affiche pas de chiffre.

## Installer (Mac Apple Silicon, macOS 13 ou plus récent)

1. Onglet **Actions** du dépôt, dernier passage vert de **CI**, section *Artifacts* : télécharger **PrepVisPro-mac-v…**.
2. Ouvrir le `.dmg` et glisser PrepVisPro dans Applications.
3. L'application n'est pas signée par Apple. Au premier lancement : clic droit › **Ouvrir** › **Ouvrir**. Si macOS la dit « endommagée » : `xattr -cr /Applications/PrepVisPro.app` dans le Terminal.

Les projets sont des dossiers `Nom.prepvis` enregistrés automatiquement, avec copies de sauvegarde et versions.

## Développement

Node 22 et Rust stable.

```sh
npm install
npm run dev          # interface dans le navigateur (http://localhost:1420)
npm run tauri dev    # application Mac
npm run typecheck && npm run lint && npm test
npm run e2e          # tests dans un vrai navigateur (Playwright)
```

Organisation : `src/model/` (format et logique métier, testés), `src/state/` (état, annulation), `src/ui/` et `src/floor/` (interface), `src/export/`, `src/import/`, `src/platform/` (Tauri ou navigateur), `src-tauri/` (Rust).

## Licence

Code sous licence [MIT](LICENSE). Les icônes PF_ICONES (`public/pf-icones`, 194 images réduites) sont libres de droits, d’après leur auteur ; elles sont livrées avec l’app.

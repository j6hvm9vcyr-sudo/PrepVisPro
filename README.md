# Topshot

Application Mac de préparation image pour chef opérateur. Le découpage technique, les plans au sol, les plans feux, le soleil et les jours de tournage tiennent dans un seul projet : chaque information est saisie une fois, et tous les documents (PDF, Excel, CSV) en découlent.

## Ce qu'elle fait

Trois pages qui partagent la même sélection : **Découpage** (le tableau, en liste ou en fiches), **Plans au sol** (plans au sol, lumière, soleil), **Tournage** (jours, installations). Autour de chaque page, des panneaux qu'on ouvre ou ferme depuis la barre du haut, comme dans Resolve : Le film, Scénario (avec le minuteur), Images rangées en dossiers, Notes, Détails ; leur disposition est gardée. Un seul « À vérifier » relève ce qui manque dans tout le projet.

- **Découpage** au clavier : valeur, axe, angle, focale, mouvement, machinerie ; plans évolutifs, multicaméra, reprises, numérotation automatique ; tampons entre séquences (TITRE, GÉNÉRIQUE DE FIN…) ; notes datées par séquence et par plan, à cocher, toutes relues dans le panneau Notes ; durée des plans (saisie, ou minutée à la lecture de la séquence) et totaux par séquence ; colonnes du tableau au choix, reprises par l’export.
- **Import de scénario** : Final Draft, Fountain, Word, PDF, texte.
- **Plans au sol** : fond (plan d'architecte PDF ou vue satellite), mise à l'échelle, caméras du découpage avec leur champ réel, personnages, positions de début et de fin.
- **Lumière** : projecteurs d'après les fiches des fabricants, gélatines LEE, réflecteurs à taux de réflexion publiés, éclairement et diaph sur les personnages, puissance par circuit ; soleil du décor (position GPS, date, heure réglée sur une réglette de la journée : nuit, crépuscule, heure dorée, jour).
- **Tournage** : les jours côte à côte avec leurs séquences, installations et plans ; ordre de tournage, matériel déduit.
- **Images** : bibliothèque du projet, chaque image importée une seule fois et réutilisable partout ; glissée du panneau Images sur un plan du tableau.
- **Travailler vite** : matériel du projet repris d’un autre projet, nouveau projet avec les réglages d’un autre, plans types ; dans les préférences de l’app (⌘,, pour tous les projets) : réglages repris par le plan suivant, abréviations ; figures du plan au sol dessinées avec les icônes PF_ICONES livrées avec l’app, ou vos propres icônes ; colonnes et rangées du tableau ajustables ; carte Caméra modifiable sur place.
- **Exports** : découpage technique PDF et Excel, plans au sol, ordre de tournage, jours et matériel.
- **Publier** (⇧⌘P) : un dossier de diffusion sur le drive de l’équipe (Google Drive, Dropbox, iCloud), choisi une fois ; chaque publication y réécrit les mêmes fichiers, sous les mêmes noms, avec « Publication N » et la date dedans : le lien partagé mène toujours à la dernière version.
- **Révisions et retours** : chaque publication a sa couleur de révision (ordre de la WGA : blanche, bleue, rose…) et les plans changés depuis la précédente sont marqués « * ». Le découpage interactif publié (un seul .html, à télécharger depuis le drive) laisse chacun choisir son métier, annoter les plans et enregistrer ses retours dans un fichier ; déposé dans « Retours » du dossier de diffusion ou reçu par mail, il revient dans le panneau Retours : chaque retour devient une note datée ou une saisie dans le tableau, toujours validée à la main.
- **Animatique pour le montage** (menu du projet) : les plans minutés, dans l’ordre du film, avec leur image au format du film (sinon un carton : numéro et action), écrits dans un dossier neuf avec la timeline à ouvrir dans DaVinci Resolve (OpenTimelineIO) ou Final Cut Pro (FCPXML 1.9) ; chaque clip porte le numéro du plan.

Aucune valeur n'est inventée : sans donnée fiable (fiche fabricant, capteur, échelle), l'application n'affiche pas de chiffre.

## Installer (Mac Apple Silicon, macOS 13 ou plus récent)

1. Onglet **Actions** du dépôt, dernier passage vert de **CI**, section *Artifacts* : télécharger **Topshot-mac-v…**.
2. Ouvrir le `.dmg` et glisser Topshot dans Applications.
3. L'application n'est pas signée par Apple. Au premier lancement : clic droit › **Ouvrir** › **Ouvrir**. Si macOS la dit « endommagée » : `xattr -cr /Applications/Topshot.app` dans le Terminal.

Les projets sont des dossiers `Nom.topshot` enregistrés automatiquement, avec copies de sauvegarde et versions. Topshot s'appelait PrepVisPro jusqu'à la 0.11 : un ancien projet `Nom.prepvis` s'ouvre et devient `Nom.topshot` (rien n'est écrasé).

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

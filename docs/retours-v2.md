# Fichier de retours, version 2 (Topshot 0.25)

Un fichier `.topshot-retours` propose des changements à un projet Topshot. Topshot ne l’applique jamais tout seul. Chaque retour apparaît dans le panneau Retours du Découpage, où l’on choisit pour chacun :

- Reprendre : la case s’ouvre avec la valeur proposée, à valider ;
- Créer le plan ;
- En note ;
- Ignorer.

La version 1 vient du découpage interactif publié. La version 2 peut venir d’ailleurs : un assistant qui range des notes de réunion, un collègue, un script. Ce document sert à écrire ce fichier sans Topshot.

## Ce qu’il faut lire dans le projet

Le projet est un dossier `Nom.topshot` ; ses données sont dans `project.json`. On y prend :

| Donnée | Où dans `project.json` |
|---|---|
| Identifiant du projet | `id` |
| Séquences | `sequences[].id`, `sequences[].number` |
| Plans | `sequences[].plans[].id`. Le numéro du plan est son rang dans la séquence (1, 2…) ; une reprise reprend le numéro du plan précédent suivi d’une lettre (2B). |
| Caméras d’un plan | `plans[].cameras[].id` |
| Notes | `sequences[].notes[]` et `plans[].notes[]` (`id`, `text`, `done`) |
| Listes du projet | `settings.terms` : `size` = Valeur, `axis` = Axe, `angle` = Angle, `movement` = Mouvement, `grip` = Machinerie |

## Le fichier

```json
{
  "topshotRetours": 2,
  "id": "notes-2026-10-13",
  "projectId": "<id du projet>",
  "publication": null,
  "author": "Claude",
  "role": "Notes de réunion",
  "sentAt": 1791820000000,
  "items": [ … ]
}
```

- `id` : unique par fichier. Un fichier déjà rangé dans le projet n’est pas repris une seconde fois.
- `projectId` : le fichier est refusé s’il ne correspond pas au projet ouvert.
- `publication` : `null` quand les retours ne portent pas sur une publication.
- `sentAt` : date en millisecondes depuis 1970. C’est la date des notes créées depuis ces retours.

## Un retour (`items[]`)

| Clé | Contenu |
|---|---|
| `id` | Unique dans le fichier. |
| `planId` | Plan visé, ou `null` pour un retour sur la séquence. |
| `seqId` | Séquence du plan. |
| `code` | Numéro affiché (« 2/3 », « Séq. 2 »). |
| `verdict` | `"ok"`, `"revoir"` ou `null`. |
| `text` | Remarque libre (une question, un doute), affichée telle quelle. Peut devenir une note. |
| `proposal` | Valeur proposée pour une case, ou `null`. |
| `create` | Créer le plan `planId`, ou `null`. |
| `noteIds` | Notes du projet d’où vient le retour. Une note est cochée quand tous ses retours sont traités. |
| `quote` | Le passage de la note qui justifie le retour, cité mot pour mot. |

### `proposal`

```json
{ "setupId": null, "field": "size", "text": "GP", "before": "" }
```

- `field` peut valoir :
  - `action`, `size`, `axis`, `angle`, `focal`, `movement`, `grip` : les cases du tableau ;
  - `duration` : la durée, à écrire `12` pour 12 secondes ou `1'05` pour 1 min 5 s.
- `setupId` : caméra visée. Avec `null`, c’est la première caméra du plan.
- `text` : la valeur, tapée comme dans la case. Pour Valeur, Axe, Angle, Mouvement et Machinerie, seulement un terme des listes du projet. Pour Focale, `50` ou `35 > 50`.
- `before` : la valeur actuelle de la case (`""` si vide). Si elle a changé depuis, Topshot le signale.

### `create` : un nouveau plan

```json
{ "id": "c1", "planId": "pl_nouveau_5_2", "seqId": "<séquence>", "code": "5/2", "verdict": null,
  "text": "Plus serré, proche d’Anaïs", "proposal": null,
  "create": { "afterPlanId": "<plan d’avant>" }, "noteIds": ["<note>"], "quote": "puis un plan plus serré" }
```

- `planId` : un identifiant neuf, fait de lettres, de chiffres, de `_` et de `-`.
- `afterPlanId` : le plan après lequel créer le nouveau. Avec `null`, ou si ce plan n’existe plus, il est créé en fin de séquence.
- Le plan est créé vide. Ses cases se proposent dans d’autres retours qui reprennent le même `planId`. Topshot ne les rend utilisables qu’une fois le plan créé.

## Règles de fiabilité pour qui écrit le fichier

1. **Ne rien inventer.** Chaque proposition s’appuie sur un passage cité dans `quote`.
2. **S’en tenir aux listes.** Un terme absent des listes (« large », « capot ») ne devient pas une proposition. Il devient une question dans `text`, sans `proposal`.
3. **Poser les doutes en question.** Deux versions qui se contredisent, ou une caméra ambiguë, vont dans `text`, sans `proposal`.
4. **Laisser en note ce qui n’a pas sa place dans le tableau** : intentions, références de films, décor.
5. **Ne citer dans `noteIds` qu’une note entièrement rangée par ses retours.** Une note cochée est masquée par défaut dans le panneau Notes. Une note qui garde des intentions ou des références n’est donc pas citée.
6. **Ne jamais modifier `project.json`.** Topshot l’écrit seul, une fois les retours validés.

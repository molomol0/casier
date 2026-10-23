# 🍳 Casseroles — le jeu

Jeu type « Higher or Lower » sur les condamnations judiciaires documentées des
personnalités politiques françaises. Deux cartes côte à côte : la personne de
gauche est révélée, on devine si celle de droite a « plus » ou « moins », le
clic dévoile les chiffres, la carte passe à gauche et une nouvelle apparaît.

## Lancer le jeu

Aucun build front : ouvrir `app/index.html` dans un navigateur, c'est tout.
(Le dataset est embarqué dans `app/dataset.js`, donc pas besoin de serveur.)

## Notre base (celle du jeu)

La base du jeu est **construite par nous, indépendamment** des bases externes :

1. **Le roster** — `node scripts/build-roster.mjs [topN]` : les personnalités
   politiques françaises depuis Wikidata (nées après 1900, article Wikipédia FR),
   classées par **longueur de leur article Wikipédia** (meilleur proxy de
   casseroles que les sitelinks : Cahuzac n'a que 13 sitelinks, Balkany 6).
   Top 600 par défaut → `data/roster.json`.
2. **L'enrichissement** — le skill **`/enrich-base`** (voir plus bas) produit
   un fichier `data/enriched/<clé>.json` par personne, avec ses affaires
   sourcées.
3. **Le build** — `node scripts/build-dataset.mjs` : assemble roster + enriched
   → `data/dataset.json` + `app/dataset.js`. Les personnes pas encore enrichies
   sont dans la base avec 0 affaire (hors jeu tant qu'elles ne sont pas
   traitées).

Les bases externes (crapulopedia, PoliGraph) ne sont PAS fusionnées : le script
`scripts/build-dataset-externes.mjs` les regroupe dans
`data/dataset-externes.json`, utilisé uniquement comme **contrôle croisé** par
l'agent d'enrichissement.

## Modes de jeu

- **Toutes casseroles** (mode principal) : nombre d'affaires, toutes
  comptées pareil quelle que soit la peine ou le statut
- **Prison** : mois de prison au total (ferme + sursis)
- **Amendes** : montant cumulé des amendes
- **Inéligibilité** : mois d'inéligibilité prononcés

Trois toggles à l'accueil choisissent ce qui compte : condamnations
définitives / condamnations en appel ou pourvoi / affaires en cours (mise en
examen, enquête, procès…). Chaque affaire porte un badge de statut sur la
carte, et l'accueil contient un glossaire expliquant chaque statut.

Le tirage garantit que les deux cartes d'un duel ont toujours des valeurs
différentes : pas d'égalité possible.

## Sources et licences

**Notre base (le jeu)** :

| Source | Usage | Licence |
|---|---|---|
| [Wikidata](https://www.wikidata.org) | roster, partis, descriptions | CC0 |
| Wikipédia FR | affaires (texte des articles) | CC BY-SA (attribution requise) |
| Presse citée en référence | vérification + sourcing | simples liens (pas de reprise de contenu) |
| Wikimedia Commons | photos | licences libres (attribution sur Commons) |

→ **Plus de contrainte non-commerciale** : la base du jeu étant construite
depuis Wikipédia/Wikidata, la clause NC de crapulopedia ne s'applique plus
(crapulopedia et PoliGraph ne servent que de contrôle croisé interne, leurs
données ne sont pas redistribuées).

⚠️ Juridique : chaque affaire affiche son **statut en badge** (condamnation
définitive / en appel / mise en examen / enquête…). La présomption d'innocence
s'applique à toute affaire non définitivement jugée — le glossaire de l'accueil
l'explique au joueur. Relaxes, non-lieux et classements sans suite ne figurent
jamais dans la base.

## Agents Claude Code (enrichissement et mise à jour)

Les deux agents tournent dans une session Claude Code (couvert par
l'abonnement, pas de clé API) :

- **`/enrich-base`** (le one-shot, relançable) : prend les 10 prochaines
  personnalités du roster pas encore traitées, lit l'article Wikipédia **et les
  articles de presse cités en référence**, recense toutes les affaires pénales
  — condamnations (peines détaillées) ET affaires en cours sourcées (mise en
  examen, procès…) — avec catégorie d'infraction et URLs sources, puis écrit
  `data/enriched/<clé>.json`. Contrôle croisé automatique contre
  `data/dataset-externes.json`. Relancer jusqu'à épuisement du roster
  (~60 lancements pour 600 personnes, à étaler sur quelques jours).
- **`/update-base`** (de temps en temps) : détecte via
  `scripts/check-wiki-updates.mjs` les articles Wikipédia modifiés depuis
  l'enrichissement, ré-enrichit ces personnes et rapporte ce qui a changé
  (nouvelles affaires, appels devenus définitifs, personnes blanchies…).

Un exemple validé de bout en bout est déjà dans la base :
`data/enriched/jerome-cahuzac.json`. Bonus : l'enrichissement remplit le champ
`categorie`, ce qui débloque les futurs modes thématiques.

## Pistes suivantes (voir discussion du plan d'action)

- **Modes thématiques** (probité, violences…) : le champ `categorie` est déjà
  rempli pour les affaires PoliGraph ; reste à catégoriser les condamnations
  crapulopedia (LLM sur les titres) pour ouvrir ces modes.
- **Élargir le roster** aux 577 députés / 348 sénateurs / 81 eurodéputés
  (open data AN, Sénat, Parlement européen) pour des duels incluant des
  élus à zéro condamnation.
- **Modes sans risque juridique** : patrimoine HATVP, assiduité parlementaire
  (NosDéputés/Datan).
- Compléter les ~60 personnalités sans photo (recherche Commons manuelle).

## Structure

```
casseroles-game/
├── app/                  SPA vanilla JS (index.html + game.js + styles.css + dataset.js généré)
├── data/
│   ├── roster.json       périmètre : top 600 politiques FR (Wikidata, tri par longueur d'article)
│   ├── enriched/         1 fichier par personne traitée par /enrich-base (NOTRE base)
│   ├── dataset.json      base du jeu assemblée (roster + enriched)
│   └── dataset-externes.json  crapulopedia + PoliGraph — contrôle croisé uniquement
├── scripts/
│   ├── build-roster.mjs          génère le roster
│   ├── build-dataset.mjs         assemble NOTRE base → app/dataset.js
│   ├── build-dataset-externes.mjs  base de référence externe
│   ├── fetch-wiki.mjs            article Wikipédia + URLs des références presse
│   └── check-wiki-updates.mjs    détecte les articles modifiés depuis l'enrichissement
└── .claude/skills/       /enrich-base et /update-base
```

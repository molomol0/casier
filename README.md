# Casier

**Le casier judiciaire des personnalités françaises. Deux cartes, une question : qui en a le plus ?**

Un jeu type _Higher or Lower_ : deux personnalités côte à côte, la carte de gauche
est révélée, tu devines si celle de droite a **plus** ou **moins** d'affaires
judiciaires. Clic → les chiffres se dévoilent, la carte passe à gauche, une
nouvelle apparaît. On ne perd jamais sur une égalité : les deux cartes ont
toujours des valeurs différentes.

➡️ **[Jouer en ligne](https://casier.pages.dev)**

---

## Le jeu en bref

- **Deux univers** : **Politiques** et **Célébrités** (ou tout mélangé).
- **Plusieurs modes de comparaison** : nombre d'affaires, mois de prison,
  montant des amendes, mois d'inéligibilité.
- **Filtres** à l'accueil : qui peut apparaître (≥ 1 / 3 / 4 affaires) et quels
  statuts comptent (condamnations définitives / en appel / procédures en cours).
- **Mode « sans perdre »** : une erreur n'arrête pas la partie (exploration).
- **Annuaire complet** avec recherche et filtres (univers, nombre d'affaires,
  statut, tri) pour parcourir toute la base et lire le détail sourcé de chaque
  affaire.

La base compte aujourd'hui **518 personnalités** (201 politiques, 300 célébrités,
17 affairistes/intermédiaires), dont **151 avec au moins une affaire**, pour un
total de **355 affaires** recensées et sourcées.

## Lancer en local

Aucun build front, aucun serveur : ouvre **`app/index.html`** dans un navigateur.
Les données sont embarquées dans `app/dataset.js`.

## Comment la base est construite

La base est construite **à partir de sources publiques**, pas achetée ni copiée :

1. **Roster** — `node scripts/build-roster.mjs` (politiques) et
   `node scripts/build-roster-celebrites.mjs` (célébrités) interrogent **Wikidata**
   et classent les personnalités par **longueur d'article Wikipédia** (meilleur
   proxy de notoriété que les sitelinks).
2. **Enrichissement** — pour chaque personne, lecture de l'article **Wikipédia**
   et de la **presse citée en référence**, puis recensement des affaires selon un
   **périmètre pénal strict** (voir [CONTRIBUTING.md](CONTRIBUTING.md)) :
   `data/enriched/<nom>.json`.
3. **Build** — `node scripts/build-dataset.mjs` assemble roster + enrichissements
   → `data/dataset.json` + `app/dataset.js`.

Une base externe de contrôle croisé (`data/dataset-externes.json`) sert uniquement
à vérifier, elle n'est jamais fusionnée dans le jeu.

## Périmètre : seulement le pénal réel

On ne compte **que** les condamnations pénales (définitives ou en appel) et les
procédures en cours réelles et sourcées (mise en examen, renvoi, procès, enquête).
Sont **exclus** : relaxes, non-lieux, classements sans suite, contentieux civils,
accusations sans procédure, et les cas où la personne est plaignante/victime.

⚠️ **Présomption d'innocence** : chaque affaire porte un badge de statut. Une
affaire non définitivement jugée est signalée comme telle, jamais présentée comme
une culpabilité. Un glossaire sur l'accueil l'explique au joueur.

## Déploiement

Site 100 % statique → n'importe quel hébergeur gratuit convient (Cloudflare Pages,
GitHub Pages, Netlify…). Il suffit de publier le dossier **`app/`** comme racine.
Sur Cloudflare/GitHub Pages connectés au dépôt, **chaque `git push` sur `main`
redéploie automatiquement**.

> Après un ajout dans la base, relancer `node scripts/build-dataset.mjs` **avant**
> de commiter (ça régénère `app/dataset.js`).

## Contribuer

Les contributions pour compléter ou corriger la base sont les bienvenues !
Règles (source obligatoire, périmètre strict, schéma) dans
**[CONTRIBUTING.md](CONTRIBUTING.md)**. Toute PR est relue avant fusion.

## Sources & licences

| Source | Usage | Licence |
|---|---|---|
| [Wikidata](https://www.wikidata.org) | roster, partis, descriptions, photos | CC0 / Commons |
| Wikipédia FR | texte des affaires | CC BY-SA (attribution requise) |
| Presse citée en référence | vérification + sourcing | simples liens |

- **Code** : [MIT](LICENSE).
- **Données** : construites depuis Wikipédia/Wikidata → réutilisation sous CC BY-SA
  avec attribution.

Projet citoyen à but informatif, sans affiliation politique.

## Structure

```
casier/
├── app/                       site statique (index.html, game.js, styles.css, dataset.js, favicon.svg)
├── data/
│   ├── roster.json            politiques (Wikidata)
│   ├── roster-celebrites.json célébrités (Wikidata)
│   ├── roster-extra.json      ajouts manuels (affairistes, intermédiaires…)
│   ├── enriched/              1 fichier par personne traitée (la base)
│   ├── dataset.json           base du jeu assemblée
│   └── dataset-externes.json  base externe de contrôle croisé
├── scripts/
│   ├── build-roster*.mjs      génèrent les rosters
│   ├── build-dataset.mjs      assemble la base → app/dataset.js
│   ├── fetch-wiki.mjs         article Wikipédia + URLs des références presse
│   └── check-wiki-updates.mjs détecte les articles modifiés depuis l'enrichissement
├── CONTRIBUTING.md
└── LICENSE
```

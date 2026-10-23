# Contribuer à Casier

Merci de vouloir améliorer la base ! Ce projet recense les **affaires judiciaires
pénales** de personnalités françaises, à but informatif. Vu le sujet, la rigueur
sur les sources et le périmètre n'est pas négociable : une fiche fausse, c'est un
risque de diffamation. Toute contribution est **relue avant d'être fusionnée**.

## Règle d'or : tout doit être sourcé

Chaque affaire ajoutée doit citer **au moins une source vérifiable** (presse
nationale, décision de justice, article Wikipédia avec ses références). Pas de
source → pas d'ajout. En cas de doute, on **exclut**.

## Périmètre pénal strict

On ne compte **que** le pénal réel :

**On garde**
- les condamnations pénales (définitives ou en appel/pourvoi) ;
- les procédures pénales en cours réelles et sourcées (mise en examen, renvoi,
  procès en cours, enquête).

**On exclut systématiquement**
- les **relaxes, non-lieux, classements sans suite, acquittements** ;
- les contentieux **civils, commerciaux, prud'homaux, fiscaux-administratifs** ;
- les **accusations sans procédure** judiciaire ouverte ;
- les cas où la personne est **plaignante ou victime** (pas mise en cause) ;
- les condamnations **politiques à l'étranger** (régimes autoritaires).

La **présomption d'innocence** s'applique : une affaire non jugée est signalée
comme telle, jamais présentée comme une culpabilité.

## Schéma d'une affaire

Les fiches vivent dans `data/enriched/<nom-kebab>.json` :

```json
{
  "nom": "Nom Prénom",
  "wikiTitle": "Nom Prénom",
  "enrichedAt": "2026-10-21",
  "affaires": [
    {
      "titre": "Intitulé court de l'affaire",
      "annee": 2020,
      "statut": "CONDAMNATION_DEFINITIVE",
      "categorie": "CORRUPTION_PASSIVE",
      "prisonTotal": 24,
      "prisonFerme": 12,
      "amende": 50000,
      "ineligibilite": 0,
      "sources": ["https://..."]
    }
  ]
}
```

- `statut` ∈ `CONDAMNATION_DEFINITIVE`, `CONDAMNATION_EN_APPEL`, `MISE_EN_EXAMEN`,
  `RENVOI_TRIBUNAL`, `PROCES_EN_COURS`, `ENQUETE_PRELIMINAIRE`.
- `prisonTotal` / `prisonFerme` en **mois**, `amende` en **euros**,
  `ineligibilite` en **mois**. Mettre `0` si non applicable.
- `categorie` : utiliser une catégorie de la taxonomie existante, ou `AUTRE`.

## Après modification

Régénère le dataset du jeu avant de commit :

```bash
node scripts/build-dataset.mjs   # régénère app/dataset.js
```

Puis ouvre une **pull request** en expliquant tes sources. Merci ！

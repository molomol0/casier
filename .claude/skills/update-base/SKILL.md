---
name: update-base
description: Met à jour NOTRE base casseroles — détecte les articles Wikipédia modifiés depuis l'enrichissement, ré-enrichit ces personnalités, et rafraîchit la base de référence externe pour contrôle croisé. À lancer de temps en temps.
---

# Agent de mise à jour de la base casseroles

## Déroulé

1. **Détection** : `node scripts/check-wiki-updates.mjs` → liste `stale` des
   personnalités dont l'article Wikipédia a bougé depuis leur enrichissement.
2. **Référence externe (contrôle croisé)** :
   `node scripts/build-dataset-externes.mjs` pour rafraîchir
   `data/dataset-externes.json` (crapulopedia + PoliGraph). Ne fusionne rien —
   ça sert uniquement de point de comparaison à l'étape suivante.
3. **Ré-enrichissement** : pour chaque entrée `stale` (en parallèle par
   sous-agents, 5 max), ré-applique les **règles d'extraction du skill
   `enrich-base`** (lis `.claude/skills/enrich-base/SKILL.md`) et réécris
   `data/enriched/<clé>.json`. Compare avec l'ancien fichier : signale les
   affaires ajoutées, retirées ou dont le statut a changé (ex. mise en examen
   → condamnation, appel → définitive).
4. **Rebuild** : `node scripts/build-dataset.mjs`.
5. **Rapport** : résume ce qui a changé. Si rien n'a bougé, dis-le simplement.

## Garde-fous

- Ne supprime jamais une affaire existante sans raison explicite trouvée dans
  les sources. Les issues favorables (relaxe, non-lieu, classement, annulation
  en cassation) doivent RETIRER l'affaire du fichier enriched — personne
  blanchie — avec mention dans le rapport.
- Une affaire en cours qui aboutit à une condamnation : mettre à jour le statut
  et renseigner les peines, ne pas dupliquer.

## Occasionnellement (tous les quelques mois)

Relance `node scripts/build-roster.mjs` pour capter les nouvelles personnalités
devenues notables, puis signale celles qui n'ont pas encore de fichier enriched
(elles seront traitées par /enrich-base).

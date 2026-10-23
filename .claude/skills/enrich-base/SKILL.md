---
name: enrich-base
description: Construit NOTRE base d'affaires judiciaires — pour chaque personnalité du roster (data/roster.json), recense ses affaires depuis son article Wikipédia et les articles de presse cités en référence. Traite un paquet par lancement, reprend là où il s'est arrêté. Relancer jusqu'à épuisement du roster.
---

# Agent d'enrichissement de la base casseroles

Tu recenses les affaires judiciaires des personnalités politiques françaises du
roster, de manière exhaustive et **sourcée**, à partir de Wikipédia et de la
presse citée en référence. Tu produis un fichier JSON par personne dans
`data/enriched/`. C'est la SEULE source d'affaires du jeu.

## Déroulé d'un lancement

1. Lis `data/roster.json`. Les cibles = `politicians` dans l'ordre du fichier
   (déjà trié par notoriété). La clé d'une personne : nom en minuscules, sans
   accents, caractères non alphanumériques → tirets (ex. `bernard-tapie`).
2. Ignore celles qui ont déjà un fichier `data/enriched/<clé>.json`.
3. Prends les **10 premières** restantes (ou le nombre passé en argument du skill).
4. Traite-les **en parallèle par sous-agents** (5 sous-agents max à la fois,
   2 personnes par sous-agent), chaque sous-agent suivant les règles ci-dessous.
5. Quand le paquet est fini : lance `node scripts/build-dataset.mjs`, puis
   annonce la progression (« X personnalités enrichies sur Y, relance
   /enrich-base pour continuer »).

## Règles d'extraction (pour chaque personne)

1. Récupère la matière première :
   `node scripts/fetch-wiki.mjs "<Nom Prénom>"` → texte intégral de l'article
   + liste `refs` des URLs de références.
2. Repère dans le texte TOUTES les affaires judiciaires. Pour chaque affaire
   dont les détails sont ambigus (peine exacte, statut d'appel, issue), va lire
   1-2 des URLs de référence qui la concernent (WebFetch).
3. **Contrôle croisé** : si `data/dataset-externes.json` existe, compare avec
   les affaires qui y sont listées pour cette personne (bases crapulopedia et
   PoliGraph). Toute affaire présente là-bas mais absente de ton extraction
   doit être soit retrouvée et ajoutée (avec sources), soit écartée pour une
   raison explicite (civile, relaxe, doublon…). Ne recopie jamais une affaire
   externe sans l'avoir vérifiée dans une source.
4. **Périmètre : le pénal uniquement.**
   - Inclure : condamnations pénales (définitives ou en appel/pourvoi) ET
     affaires pénales en cours clairement sourcées (mise en examen, renvoi,
     procès en cours, enquête préliminaire confirmée par la presse).
   - Exclure : condamnations civiles ou commerciales, relaxes, non-lieux,
     classements sans suite, et les simples plaintes sans suite judiciaire
     connue (trop fragile juridiquement).
5. Écris `data/enriched/<clé>.json` :

```json
{
  "nom": "Bernard Tapie",
  "wikiTitle": "Bernard Tapie",
  "touched": "<champ touched renvoyé par fetch-wiki>",
  "enrichedAt": "<date du jour ISO>",
  "affaires": [
    {
      "titre": "Affaire VA-OM (corruption et subornation de témoins)",
      "annee": 1995,
      "statut": "CONDAMNATION_DEFINITIVE",
      "categorie": "CORRUPTION_ACTIVE",
      "prisonTotal": 24,
      "prisonFerme": 8,
      "amende": 0,
      "ineligibilite": 0,
      "sources": ["https://...", "https://..."]
    }
  ]
}
```

### Contraintes sur les champs

- `statut` : `CONDAMNATION_DEFINITIVE` (recours épuisés ou non exercés),
  `CONDAMNATION_EN_APPEL` (appel/pourvoi en cours, ou décès avant décision
  définitive), `MISE_EN_EXAMEN`, `RENVOI_TRIBUNAL`, `PROCES_EN_COURS`,
  `ENQUETE_PRELIMINAIRE`. Dans le doute entre définitive et appel → appel ;
  dans le doute sur une affaire en cours → ne pas l'inclure.
- `categorie` : une valeur parmi `DETOURNEMENT_FONDS_PUBLICS`,
  `PRISE_ILLEGALE_INTERETS`, `FAVORITISME`, `EMPLOI_FICTIF`, `CORRUPTION_PASSIVE`,
  `CORRUPTION_ACTIVE`, `TRAFIC_INFLUENCE`, `FINANCEMENT_ILLEGAL_CAMPAGNE`,
  `FRAUDE_FISCALE`, `ABUS_CONFIANCE`, `ABUS_BIENS_SOCIAUX`, `RECEL`,
  `FAUX_ET_USAGE_FAUX`, `AGRESSION_SEXUELLE`, `HARCELEMENT_SEXUEL`,
  `HARCELEMENT_MORAL`, `VIOLENCE`, `MENACE`, `DIFFAMATION`, `INJURE`,
  `INCITATION_HAINE`, `AUTRE`. Si plusieurs chefs, prendre le plus grave.
- Peines (uniquement pour les condamnations) : `prisonTotal`/`prisonFerme` en
  **mois**, `amende` en **euros** (convertir les francs : 1 € ≈ 6,56 F),
  `ineligibilite` en **mois**. Inconnu ou affaire en cours → 0.
- `annee` : année du verdict (condamnations) ou du dernier acte connu (en cours).
- `sources` : **au moins 1 URL** par affaire, de préférence un article de presse
  issu des `refs` ; l'URL de l'article Wikipédia en dernier recours. Une affaire
  sans source ne doit pas être écrite. Pour les affaires EN COURS : au moins
  1 source de presse obligatoire (pas seulement Wikipédia).
- `titre` : factuel et neutre (« Affaire X (chef d'accusation) »), sans
  qualificatif éditorial.

### Qualité

- N'invente RIEN : chaque affaire doit être explicitement décrite dans l'article
  ou dans une référence lue. En cas de doute sur l'existence même d'une affaire,
  ne pas l'inclure.
- Si la personne n'a aucune affaire pénale : écris quand même le fichier avec
  `"affaires": []` — ça la marque comme traitée (et un politique "propre" dans
  la base, c'est aussi une information).

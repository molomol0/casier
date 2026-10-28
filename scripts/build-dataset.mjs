// Construit NOTRE base (celle du jeu) à partir de :
//  1. data/roster.json  — le périmètre : personnalités politiques françaises (Wikidata, CC0)
//  2. data/enriched/    — les affaires recensées par l'agent /enrich-base
//     (Wikipédia + presse citée en référence, chaque affaire sourcée)
// Les sources externes (crapulopedia, PoliGraph) ne sont PAS fusionnées ici :
// elles servent uniquement de contrôle croisé via scripts/build-dataset-externes.mjs.
// Usage : node scripts/build-dataset.mjs

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const normalize = (name) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const keyOf = (name) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- 1. Rosters (politiques + célébrités) ------------------------------------
const rosterPol = JSON.parse(readFileSync(join(ROOT, "data", "roster.json"), "utf8"));
let rosterCel = { politicians: [] };
try {
  rosterCel = JSON.parse(readFileSync(join(ROOT, "data", "roster-celebrites.json"), "utf8"));
} catch { /* pas encore de roster célébrités */ }

// Ajouts manuels (affairistes, intermédiaires, étrangers condamnés en France) :
// chaque entrée porte déjà son propre champ `univers`.
let rosterExtra = { politicians: [] };
try {
  rosterExtra = JSON.parse(readFileSync(join(ROOT, "data", "roster-extra.json"), "utf8"));
} catch { /* pas d'ajouts manuels */ }

// Fusion avec univers ; en cas de doublon de QID, l'univers politique l'emporte.
const seenQid = new Set();
const rosterAll = [
  ...rosterPol.politicians.map((r) => ({ ...r, univers: "politique" })),
  ...rosterCel.politicians.map((r) => ({ ...r, univers: "celebrite" })),
  ...rosterExtra.politicians.map((r) => ({ ...r, univers: r.univers || "celebrite" })),
].filter((r) => {
  if (seenQid.has(r.qid)) return false;
  seenQid.add(r.qid);
  return true;
});
console.log(
  `Rosters : ${rosterPol.politicians.length} politiques + ${rosterCel.politicians.length} célébrités` +
    ` + ${rosterExtra.politicians.length} ajouts`
);

// ---- 2. Fichiers enrichis ------------------------------------------------------
const enrichedByKey = new Map();
try {
  for (const f of readdirSync(join(ROOT, "data", "enriched")).filter((x) => x.endsWith(".json"))) {
    const e = JSON.parse(readFileSync(join(ROOT, "data", "enriched", f), "utf8"));
    if (!e.nom || !Array.isArray(e.affaires)) continue;
    // Double clé : le nom déclaré dans le fichier ET le nom du fichier lui-même
    // (ex. le fichier dit "Dieudonné M'bala M'bala", le roster dit "Dieudonné").
    enrichedByKey.set(normalize(e.nom), e);
    enrichedByKey.set(normalize(f.replace(/\.json$/, "")), e);
  }
} catch { /* pas encore de dossier enriched */ }
console.log(
  `Enrichis : ${new Set(enrichedByKey.values()).size} personnalités traitées par /enrich-base`
);

// ---- 3. Assemblage -------------------------------------------------------------
// On ne garde QUE les personnes réellement traitées par l'agent (enrichedAt non
// null) ; chaque personne porte son univers (politique / celebrite) hérité du
// roster dont elle provient.
const politicians = rosterAll
  .map((r) => {
    const e = enrichedByKey.get(normalize(r.nom));
    if (!e?.enrichedAt) return null;
    return {
      qid: r.qid,
      cle: keyOf(r.nom),
      nom: r.nom,
      univers: r.univers,
      wikiTitle: r.wikiTitle ?? null,
      parti: r.parti,
      poste: r.poste,
      photo: r.photo,
      wikiLength: r.wikiLength ?? 0,
      enrichedAt: e.enrichedAt,
      affaires: e.affaires.map((a) => ({
        categorie: null, prisonTotal: 0, prisonFerme: 0, amende: 0,
        ineligibilite: 0, sources: [], ...a,
      })),
      // Accusations hors périmètre pénal (plaintes classées/non-lieu/en cours),
      // comptées uniquement dans le mode « Casier + accusations », jamais fusionnées.
      accusations: (e.accusations ?? []).map((a) => ({ sources: [], ...a })),
    };
  })
  .filter(Boolean);

politicians.sort(
  (a, b) => b.affaires.length - a.affaires.length || b.wikiLength - a.wikiLength
);

const dataset = {
  generatedAt: new Date().toISOString(),
  sources: [
    "Wikidata (CC0) — roster, photos, biographies",
    "Wikipédia FR (CC BY-SA) + presse citée en référence — affaires (via /enrich-base)",
  ],
  politicians,
};

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(join(ROOT, "data", "dataset.json"), JSON.stringify(dataset, null, 2));
writeFileSync(
  join(ROOT, "app", "dataset.js"),
  "// Généré par scripts/build-dataset.mjs — ne pas éditer à la main\n" +
    "window.CASIER_DATA = " + JSON.stringify(dataset) + ";\n"
);

const totalAffaires = politicians.reduce((s, p) => s + p.affaires.length, 0);
const avecAff = politicians.filter((p) => p.affaires.length).length;
console.log(
  `Base : ${politicians.length} personnalités jouables (${avecAff} avec affaires, ` +
    `${politicians.length - avecAff} vérifiées sans affaire), ${totalAffaires} affaires ` +
    `→ data/dataset.json + app/dataset.js`
);

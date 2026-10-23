// Construit data/dataset.js à partir de :
//  1. crapulopedia (casier-politique.fr) : condamnations détaillées — CC BY-NC-SA 4.0
//  2. Wikidata : photos, partis, descriptions — CC0
//  3. PoliGraph : affaires EN COURS (mises en examen, enquêtes, procès…) — AGPL
// Usage : node scripts/build-dataset.mjs

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casseroles-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";

const CSV_URL =
  "https://codeberg.org/raphael-jolivet/crapulopedia/raw/branch/main/data/out/affaires-out.csv";
const TREE_URL =
  "https://codeberg.org/api/v1/repos/raphael-jolivet/crapulopedia/git/trees/HEAD?recursive=true";
const POLIGRAPH = "https://poligraph.fr/api";

// Statuts PoliGraph retenus : uniquement les affaires EN COURS, antérieures à tout
// jugement. Les CONDAMNATION_* et APPEL/POURVOI viennent de crapulopedia (évite les
// doublons) ; RELAXE / NON_LIEU / CLASSEMENT_SANS_SUITE sont exclus (personnes
// blanchies : ne doivent jamais compter).
const STATUTS_EN_COURS = new Set([
  "PLAINTE_DEPOSEE",
  "SIGNALEMENT_PARQUET",
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
]);

const sparqlForQids = (qids) => `
SELECT ?p ?img ?partyLabel ?desc WHERE {
  VALUES ?p { ${qids.map((q) => `wd:${q}`).join(" ")} }
  OPTIONAL { ?p wdt:P18 ?img }
  OPTIONAL { ?p wdt:P102 ?party }
  OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
}`;

// Parseur CSV minimal gérant les champs entre guillemets (virgules dans les titres)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const normalize = (name) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (res.status === 429 && attempt <= 3) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 15000 * attempt;
    console.log(`   429, pause ${wait / 1000}s…`);
    await sleep(wait);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  return res.json();
}

async function fetchAllPages(endpoint) {
  const all = [];
  let page = 1, totalPages = 1;
  do {
    const r = await fetchJson(`${POLIGRAPH}${endpoint}?limit=100&page=${page}`);
    all.push(...r.data);
    totalPages = r.pagination.totalPages;
    page++;
    await sleep(400); // courtoisie rate-limit
  } while (page <= totalPages);
  return all;
}

async function main() {
  const byPolitician = new Map(); // clé = nom normalisé

  function getOrCreate(name) {
    const key = normalize(name);
    if (!byPolitician.has(key)) {
      byPolitician.set(key, {
        nom: name, qid: null, parti: null, photo: null, poste: null,
        affaires: [],
      });
    }
    return byPolitician.get(key);
  }

  // ---- 1. Condamnations (crapulopedia) --------------------------------------
  console.log("1/4 Condamnations crapulopedia…");
  const csvText = await (await fetch(CSV_URL, { headers: { "User-Agent": UA } })).text();
  const [header, ...rows] = parseCsv(csvText);
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const num = (row, name) => Number(row[col[name]]) || 0;

  for (const row of rows) {
    const name = row[col.politician];
    if (!name) continue;
    const p = getOrCreate(name);
    const recours = row[col.recours] || "";
    p.affaires.push({
      titre: row[col.affaire],
      annee: Number(row[col.annee]) || null,
      statut: recours === "definitif" ? "CONDAMNATION_DEFINITIVE" : "CONDAMNATION_EN_APPEL",
      categorie: null, // non fourni par crapulopedia (viendra d'un futur appariement)
      prisonTotal: num(row, "prison_total"),
      prisonFerme: num(row, "prison_ferme"),
      amende: num(row, "amende_total"),
      ineligibilite: num(row, "ineligibilite_total"),
    });
    if (!p.parti && row[col.party] && row[col.party_sure] === "True") p.parti = row[col.party];
  }
  console.log(`   ${rows.length} condamnations, ${byPolitician.size} personnalités`);

  // NB : cette base est une référence EXTERNE pure (contrôle croisé de
  // /enrich-base). Elle ne doit JAMAIS intégrer data/enriched/, sinon le
  // contrôle croisé se comparerait à lui-même.

  // ---- 2. QID + enrichissement Wikidata -------------------------------------
  console.log("2/4 Correspondance QID + Wikidata…");
  const tree = await fetchJson(TREE_URL);
  const qidByName = new Map();
  for (const entry of tree.tree ?? []) {
    const m = entry.path.match(/^data\/out\/markdown\/(Q\d+)-(.+)\.md$/);
    if (m) qidByName.set(normalize(m[2]), m[1]);
  }
  const qidToPolitician = new Map();
  for (const [key, p] of byPolitician) {
    const qid = qidByName.get(key);
    if (qid) { p.qid = qid; qidToPolitician.set(qid, p); }
  }
  const sparqlRes = await fetch(
    "https://query.wikidata.org/sparql?format=json&query=" +
      encodeURIComponent(sparqlForQids([...qidToPolitician.keys()])),
    { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } }
  );
  const bindings = (await sparqlRes.json()).results.bindings;
  for (const b of bindings) {
    const p = qidToPolitician.get(b.p.value.split("/").pop());
    if (!p) continue;
    if (!p.photo && b.img)
      p.photo = b.img.value.replace(/^http:/, "https:") + "?width=500";
    if (!p.parti && b.partyLabel) p.parti = b.partyLabel.value;
    if (!p.poste && b.desc) p.poste = b.desc.value;
  }
  console.log(`   ${qidToPolitician.size} QID, photos Wikidata associées`);

  // ---- 3. Affaires en cours (PoliGraph) --------------------------------------
  console.log("3/4 Affaires en cours PoliGraph…");
  const pgAffaires = await fetchAllPages("/affaires");
  const retenues = pgAffaires.filter(
    (a) => STATUTS_EN_COURS.has(a.status) && a.politician?.fullName
  );
  // Fiches PoliGraph uniquement pour les personnes absentes de crapulopedia
  // (photo, parti, mandat) — appel unitaire par slug pour ménager le rate-limit.
  const newSlugs = [...new Set(
    retenues
      .filter((a) => !byPolitician.has(normalize(a.politician.fullName)))
      .map((a) => a.politician.slug)
  )];
  const ficheBySlug = new Map();
  for (const slug of newSlugs) {
    try {
      ficheBySlug.set(slug, await fetchJson(`${POLIGRAPH}/politiques/${slug}`));
    } catch { /* pas bloquant : la personne sera juste sans photo */ }
    await sleep(400);
  }
  let added = 0, newPeople = 0;
  for (const a of retenues) {
    const existed = byPolitician.has(normalize(a.politician.fullName));
    const p = getOrCreate(a.politician.fullName);
    if (!existed) {
      newPeople++;
      const fiche = ficheBySlug.get(a.politician.slug);
      if (fiche?.photoUrl) p.photo = fiche.photoUrl;
      if (fiche?.currentParty?.name) p.parti = fiche.currentParty.name;
      if (fiche?.mandates?.[0]?.title) p.poste = fiche.mandates[0].title;
    }
    p.affaires.push({
      titre: a.title,
      annee: a.startDate ? new Date(a.startDate).getFullYear() : null,
      statut: a.status,
      categorie: a.category ?? null,
      prisonTotal: 0, prisonFerme: 0, amende: 0, ineligibilite: 0,
    });
    added++;
  }
  console.log(
    `   ${pgAffaires.length} affaires PoliGraph → ${added} en cours retenues, ${newPeople} nouvelles personnalités`
  );

  // ---- 3bis. Overrides manuels (affaires manquantes des sources auto) --------
  try {
    const overrides = JSON.parse(readFileSync(join(ROOT, "data", "overrides.json"), "utf8"));
    let nbOverrides = 0;
    for (const [name, extra] of Object.entries(overrides)) {
      if (name.startsWith("_")) continue;
      const p = getOrCreate(name);
      for (const a of extra) {
        // Ignore si une affaire au titre proche existe déjà (évite les doublons
        // si la source automatique rattrape l'info plus tard)
        if (p.affaires.some((e) => normalize(e.titre) === normalize(a.titre))) continue;
        p.affaires.push({ categorie: null, prisonTotal: 0, prisonFerme: 0, amende: 0, ineligibilite: 0, ...a });
        nbOverrides++;
      }
    }
    console.log(`   + ${nbOverrides} affaires ajoutées via data/overrides.json`);
  } catch { /* pas d'overrides : ok */ }

  // ---- 4. Écriture -----------------------------------------------------------
  console.log("4/4 Écriture du dataset…");
  const politicians = [...byPolitician.values()].sort(
    (a, b) => b.affaires.length - a.affaires.length
  );
  const dataset = {
    generatedAt: new Date().toISOString(),
    sources: [
      "casier-politique.fr (crapulopedia, CC BY-NC-SA 4.0) — condamnations",
      "PoliGraph (poligraph.fr, AGPL) — affaires en cours",
      "Wikidata (CC0) / Wikimedia Commons — photos et biographies",
    ],
    politicians,
  };
  mkdirSync(join(ROOT, "data"), { recursive: true });
  // Base de RÉFÉRENCE uniquement (contrôle croisé pour /enrich-base) —
  // le jeu consomme la base propre produite par scripts/build-dataset.mjs.
  writeFileSync(
    join(ROOT, "data", "dataset-externes.json"),
    JSON.stringify(dataset, null, 2)
  );
  const withPhoto = politicians.filter((p) => p.photo).length;
  const totalAffaires = politicians.reduce((s, p) => s + p.affaires.length, 0);
  console.log(
    `   ${politicians.length} personnalités (${withPhoto} avec photo), ${totalAffaires} affaires → data/dataset-externes.json (référence)`
  );
}

main().catch((e) => { console.error(e); process.exit(1); });

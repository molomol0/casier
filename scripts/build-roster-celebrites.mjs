// Construit data/roster-celebrites.json : les célébrités françaises TRÈS connues
// (hors politique, hors footballeurs), par occupation show-business / médias.
// Même logique que build-roster.mjs : tri par longueur d'article Wikipédia FR.
// Usage : node scripts/build-roster-celebrites.mjs [topN=300] [minSitelinks=30]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casier-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const TOP_N = Number(process.argv[2]) || 300;
const MIN_LINKS = Number(process.argv[3]) || 30;

// Occupations grand public riches en affaires (PAS de footballeur, PAS de politique)
const OCC = [
  "Q33999",   // acteur / actrice
  "Q2526255", // réalisateur
  "Q3282637", // producteur de cinéma
  "Q177220",  // chanteur / chanteuse
  "Q639669",  // musicien
  "Q245068",  // humoriste
  "Q947873",  // animateur de télévision
  "Q1930187", // journaliste
  "Q43845",   // homme / femme d'affaires
];

const SPARQL = `
SELECT ?p ?pLabel ?img ?desc ?links ?title WHERE {
  VALUES ?occ { ${OCC.map((q) => "wd:" + q).join(" ")} }
  ?p wdt:P27 wd:Q142 ;
     wdt:P106 ?occ ;
     wdt:P569 ?birth ;
     wikibase:sitelinks ?links .
  FILTER(?links >= ${MIN_LINKS} && ?birth >= "1940-01-01T00:00:00Z"^^xsd:dateTime)
  MINUS { ?p wdt:P106 wd:Q937857 }   # exclure footballeurs
  MINUS { ?p wdt:P106 wd:Q82955 }    # exclure personnalités politiques (déjà couvertes)
  ?article schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?p wdt:P18 ?img }
  OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
}`;

console.log(`1/3 Requête Wikidata (célébrités FR, sitelinks >= ${MIN_LINKS}, hors foot/politique)…`);
let bindings;
for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch(
      "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(SPARQL),
      { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } }
    );
    if (!res.ok) throw new Error(`Wikidata ${res.status}`);
    bindings = (await res.json()).results.bindings;
    break;
  } catch (e) {
    if (attempt >= 3) throw e;
    console.log(`   réponse invalide (${e.message.slice(0, 50)}…), nouvel essai dans 20 s`);
    await new Promise((r) => setTimeout(r, 20000));
  }
}

const byQid = new Map();
for (const b of bindings) {
  const qid = b.p.value.split("/").pop();
  if (!byQid.has(qid)) {
    const title = b.title?.value ?? null;
    byQid.set(qid, {
      qid,
      nom: (title ?? b.pLabel?.value ?? qid).replace(/\s*\([^)]*\)\s*$/, ""),
      wikiTitle: title,
      photo: b.img ? b.img.value.replace(/^http:/, "https:") + "?width=500" : null,
      parti: null, // pas de parti pour une célébrité
      poste: b.desc?.value ?? null, // description Wikidata : « actrice française », etc.
      sitelinks: Number(b.links?.value) || 0,
      wikiLength: 0,
    });
  }
}
const candidates = [...byQid.values()].filter((p) => p.wikiTitle && !/^Q\d+$/.test(p.nom));
console.log(`   ${candidates.length} candidats`);

console.log("2/3 Longueur des articles frwiki (par lots de 50)…");
const byTitle = new Map(candidates.map((p) => [p.wikiTitle, p]));
for (let i = 0; i < candidates.length; i += 50) {
  const batch = candidates.slice(i, i + 50);
  const url =
    "https://fr.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query", prop: "info", format: "json", redirects: 1,
      titles: batch.map((p) => p.wikiTitle).join("|"),
    });
  const data = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
  const redirectMap = new Map((data.query?.redirects ?? []).map((x) => [x.to, x.from]));
  for (const page of Object.values(data.query?.pages ?? {})) {
    const origin = redirectMap.get(page.title) ?? page.title;
    const p = byTitle.get(origin);
    if (p && page.length) p.wikiLength = page.length;
  }
  if (i % 1000 === 0 && i > 0) console.log(`   ${i}/${candidates.length}…`);
  await new Promise((r) => setTimeout(r, 150));
}

console.log("3/3 Classement et écriture…");
const roster = candidates.sort((a, b) => b.wikiLength - a.wikiLength).slice(0, TOP_N);

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(
  join(ROOT, "data", "roster-celebrites.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      topN: TOP_N,
      tri: "longueur de l'article Wikipédia FR",
      source: "Wikidata (CC0) + Wikipédia FR",
      politicians: roster, // même clé que le roster politique, pour réutiliser build-dataset
    },
    null,
    1
  )
);
const withPhoto = roster.filter((p) => p.photo).length;
console.log(`${roster.length} célébrités (${withPhoto} avec photo) → data/roster-celebrites.json`);
console.log(`Top 10 : ${roster.slice(0, 10).map((p) => p.nom).join(", ")}`);

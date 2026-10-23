// Construit data/roster.json : la liste des personnalités politiques françaises
// (Wikidata, CC0) qui sert de périmètre à NOTRE base.
//
// Notoriété : les sitelinks Wikidata sont un mauvais proxy pour les figures à
// scandale franco-françaises (Cahuzac : 13, Balkany : 6). On classe donc par
// LONGUEUR de l'article Wikipédia FR — les carrières à casseroles font les
// longs articles — et on garde le top N.
// Usage : node scripts/build-roster.mjs [topN=600]

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casseroles-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const TOP_N = Number(process.argv[2]) || 600;

const SPARQL = `
SELECT ?p ?pLabel ?img ?partyLabel ?desc ?links ?title WHERE {
  ?p wdt:P27 wd:Q142 ;        # nationalité française
     wdt:P106 wd:Q82955 ;     # occupation : personnalité politique
     wdt:P569 ?birth ;        # né·e après 1900 : politique contemporaine
     wikibase:sitelinks ?links .
  FILTER(?links >= 4 && ?birth >= "1900-01-01T00:00:00Z"^^xsd:dateTime)
  ?article schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> ;
           schema:name ?title .
  OPTIONAL { ?p wdt:P18 ?img }
  OPTIONAL { ?p wdt:P102 ?party }
  OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". }
}`;

console.log("1/3 Requête Wikidata (politiciens FR nés 1900+, article frwiki)…");
// WDQS tronque parfois sa réponse sous charge → retry avec pause
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
    console.log(`   réponse invalide (${e.message.slice(0, 60)}…), nouvel essai dans 20 s`);
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
      // Le titre frwiki est le nom canonique (le label Wikidata a des ratés
      // aléatoires qui renvoient le QID — ça avait éjecté Mélenchon du roster).
      // On retire l'éventuel désambiguïsateur : "Jean Dupont (homme politique)".
      nom: (title ?? b.pLabel?.value ?? qid).replace(/\s*\([^)]*\)\s*$/, ""),
      wikiTitle: title,
      photo: b.img ? b.img.value.replace(/^http:/, "https:") + "?width=500" : null,
      parti: b.partyLabel?.value ?? null,
      poste: b.desc?.value ?? null,
      sitelinks: Number(b.links?.value) || 0,
      wikiLength: 0,
    });
  }
}
const candidates = [...byQid.values()].filter(
  (p) => p.wikiTitle && !/^Q\d+$/.test(p.nom)
);
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
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  const data = await r.json();
  // suivre les redirections éventuelles pour retrouver le titre d'origine
  const redirectMap = new Map((data.query?.redirects ?? []).map((x) => [x.to, x.from]));
  for (const page of Object.values(data.query?.pages ?? {})) {
    const origin = redirectMap.get(page.title) ?? page.title;
    const p = byTitle.get(origin);
    if (p && page.length) p.wikiLength = page.length;
  }
  if (i % 1000 === 0 && i > 0) console.log(`   ${i}/${candidates.length}…`);
  await new Promise((r2) => setTimeout(r2, 150)); // courtoisie API
}

// --- 2bis. Membres de la catégorie « Personnalité politique française condamnée »
// Garantis intéressants pour le jeu : inclus D'OFFICE, même avec un petit article
// ou peu de sitelinks (barons locaux absents du filtre principal).
console.log("2bis/3 Catégorie Wikipédia des condamnés…");
let members = [], cont = "";
do {
  const u =
    "https://fr.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query", list: "categorymembers", format: "json",
      cmtitle: "Catégorie:Personnalité politique française condamnée",
      cmlimit: "500", ...(cont ? { cmcontinue: cont } : {}),
    });
  const r = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
  members.push(...r.query.categorymembers.filter((m) => m.ns === 0).map((m) => m.title));
  cont = r.continue?.cmcontinue;
} while (cont);
const knownTitles = new Set(candidates.map((p) => p.wikiTitle));
const extraTitles = members.filter((t) => !knownTitles.has(t));
const extras = [];
for (let i = 0; i < extraTitles.length; i += 50) {
  const u =
    "https://fr.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query", prop: "pageprops|info", ppprop: "wikibase_item",
      titles: extraTitles.slice(i, i + 50).join("|"), redirects: 1, format: "json",
    });
  const data = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
  for (const page of Object.values(data.query?.pages ?? {})) {
    const qid = page.pageprops?.wikibase_item;
    if (qid && !byQid.has(qid))
      extras.push({
        qid, nom: page.title.replace(/\s*\([^)]*\)\s*$/, ""), wikiTitle: page.title,
        photo: null, parti: null, poste: null, sitelinks: 0,
        wikiLength: page.length || 0, condamneConnu: true,
      });
  }
  await new Promise((r2) => setTimeout(r2, 150));
}
if (extras.length) {
  const q = `SELECT ?p ?img ?partyLabel ?desc ?birth WHERE {
    VALUES ?p { ${extras.map((e) => "wd:" + e.qid).join(" ")} }
    OPTIONAL { ?p wdt:P18 ?img } OPTIONAL { ?p wdt:P102 ?party }
    OPTIONAL { ?p schema:description ?desc FILTER(LANG(?desc) = "fr") }
    OPTIONAL { ?p wdt:P569 ?birth }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr". } }`;
  const r2 = await fetch(
    "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
    { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } }
  );
  const byQ = new Map(extras.map((e) => [e.qid, e]));
  for (const b of (await r2.json()).results.bindings) {
    const e = byQ.get(b.p.value.split("/").pop());
    if (!e) continue;
    if (!e.photo && b.img) e.photo = b.img.value.replace(/^http:/, "https:") + "?width=500";
    if (!e.parti && b.partyLabel && !/^Q\d+$/.test(b.partyLabel.value)) e.parti = b.partyLabel.value;
    if (!e.poste && b.desc) e.poste = b.desc.value;
    if (!e.birth && b.birth) e.birth = b.birth.value;
  }
}
// Même filtre de naissance que le roster principal (politique contemporaine)
const extrasRetenus = extras.filter((e) => !e.birth || e.birth >= "1900");
console.log(
  `   ${members.length} condamnés dans la catégorie, ${extrasRetenus.length} ajoutés au roster (hors top-N)`
);

console.log("3/3 Classement et écriture…");
const roster = candidates
  .sort((a, b) => b.wikiLength - a.wikiLength)
  .slice(0, TOP_N)
  .concat(extrasRetenus.sort((a, b) => b.wikiLength - a.wikiLength));

mkdirSync(join(ROOT, "data"), { recursive: true });
writeFileSync(
  join(ROOT, "data", "roster.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      topN: TOP_N,
      tri: "longueur de l'article Wikipédia FR",
      source: "Wikidata (CC0) + Wikipédia FR",
      politicians: roster,
    },
    null,
    1
  )
);
const withPhoto = roster.filter((p) => p.photo).length;
console.log(`${roster.length} personnalités (${withPhoto} avec photo) → data/roster.json`);
console.log(`Top 5 : ${roster.slice(0, 5).map((p) => p.nom).join(", ")}`);
console.log(
  `Contrôle : Cahuzac=${roster.some((p) => p.nom.includes("Cahuzac"))}, Balkany=${roster.some((p) => p.nom.includes("Balkany"))}`
);

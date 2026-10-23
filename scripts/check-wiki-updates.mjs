// Liste les fichiers data/enriched/*.json dont l'article Wikipédia a été modifié
// depuis l'enrichissement — utilisé par le skill /update-base.
// Usage : node scripts/check-wiki-updates.mjs

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casseroles-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const DIR = join(ROOT, "data", "enriched");

let entries;
try {
  entries = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(DIR, f), "utf8")) }))
    .filter((e) => e.wikiTitle && e.touched);
} catch {
  console.log(JSON.stringify({ stale: [], note: "aucun fichier enriched" }));
  process.exit(0);
}

const stale = [];
// L'API accepte 50 titres par requête
for (let i = 0; i < entries.length; i += 50) {
  const batch = entries.slice(i, i + 50);
  const url =
    "https://fr.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query", prop: "info", format: "json", redirects: 1,
      titles: batch.map((e) => e.wikiTitle).join("|"),
    });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const pages = Object.values((await res.json()).query?.pages ?? {});
  const touchedByTitle = new Map(pages.map((p) => [p.title, p.touched]));
  for (const e of batch) {
    const current = touchedByTitle.get(e.wikiTitle);
    if (current && current > e.touched) {
      stale.push({ nom: e.nom, file: e.file, enriched: e.touched, wiki: current });
    }
  }
}

console.log(JSON.stringify({ total: entries.length, staleCount: stale.length, stale }, null, 1));

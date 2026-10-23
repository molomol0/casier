// Scanne les politiques NON traités et les classe par densité de mots-clés
// judiciaires dans leur article frwiki -> repère les candidats à "beaucoup d'affaires".
// Usage : node scripts/scan-politiques.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casier-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const key = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const roster = JSON.parse(readFileSync(join(ROOT, "data", "roster.json"), "utf8")).politicians;
const done = new Set();
for (const f of readdirSync(join(ROOT, "data", "enriched")).filter((x) => x.endsWith(".json"))) done.add(f.replace(/\.json$/, ""));
const reste = roster.filter((p) => !done.has(key(p.nom)));

// mots-clés "condamnation/poursuite" forts (on compte les occurrences)
const KW = /(condamn|mise? en examen|mis en examen|relax|écrou|incarcér|inculp|prison ferme|correctionnel|poursuiv|chef d.accusation|détournement|prise illégale|favoritisme|abus de bien|trafic d.influence|recel|blanchiment|fraude fiscale|emploi fictif|détention provisoire|réclusion|sursis)/gi;

const rows = [];
for (const p of reste) {
  const title = p.wikiTitle || p.nom;
  const url = "https://fr.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", prop: "extracts", explaintext: "1", format: "json", redirects: "1", titles: title });
  let text = "";
  try { const d = await (await fetch(url, { headers: { "User-Agent": UA } })).json();
    text = Object.values(d.query?.pages ?? {})[0]?.extract ?? ""; } catch {}
  const hits = (text.match(KW) || []).length;
  rows.push({ nom: p.nom, cle: key(p.nom), hits, wikiK: Math.round((p.wikiLength || 0) / 1000) });
  await new Promise((r) => setTimeout(r, 90));
}
rows.sort((a, b) => b.hits - a.hits);
writeFileSync(join(ROOT, "data", "scan-politiques.json"), JSON.stringify(rows, null, 1));
const forts = rows.filter((r) => r.hits >= 8);
const moyens = rows.filter((r) => r.hits >= 4 && r.hits < 8);
console.log(`Politiques restants scannés : ${rows.length}`);
console.log(`Densité FORTE (>=8 mots-clés, candidats 3+ affaires) : ${forts.length}`);
console.log(`Densité moyenne (4-7) : ${moyens.length}`);
console.log(`Faible (<4, surtout 0-1 affaire) : ${rows.filter((r) => r.hits < 4).length}`);
console.log("\n=== TOP 50 candidats (par densité judiciaire) ===");
rows.slice(0, 50).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. ${String(r.hits).padStart(2)} hits | ${r.nom} (${r.wikiK}k)`));

// Scan ponctuel : pour chaque célébrité NON encore enrichie, récupère l'article
// frwiki et signale la présence de mots-clés judiciaires. Ne remonte que les
// personnes à vérifier manuellement ; les autres sont "propres" (affaires: []).
// Usage : node scripts/scan-remaining.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casier-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const keyOf = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const roster = JSON.parse(readFileSync(join(ROOT, "data", "roster-celebrites.json"), "utf8")).politicians;
const done = new Set(readdirSync(join(ROOT, "data", "enriched")).map((f) => f.replace(/\.json$/, "")));
const remaining = roster.filter((p) => !done.has(keyOf(p.nom)));

const KW = /\b(condamn\w*|prison|réclusion|amende|sursis|mise? en examen|mis en examen|procès|correctionnel\w*|coupable|détention|écrou\w*|incarcér\w*|inculp\w*|garde à vue|peine|délit|stupéfiant\w*|cocaïne|héroïne|trafic|viol\b|agress\w* sexuel\w*|harcèlement|violenc\w*|escroquerie|fraude|blanchiment|outrage|espionnage)\b/i;

const hits = [];
const clean = [];
for (const p of remaining) {
  const title = p.wikiTitle || p.nom;
  const url = "https://fr.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", prop: "extracts|info", explaintext: "1", format: "json",
    redirects: "1", titles: title,
  });
  let data;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    data = await res.json();
  } catch (e) { hits.push({ nom: p.nom, title, err: e.message }); continue; }
  const page = Object.values(data.query?.pages ?? {})[0] ?? {};
  const text = page.extract ?? "";
  const touched = page.touched ?? null;
  const matches = [];
  const re = new RegExp(KW.source, "gi");
  let m;
  while ((m = re.exec(text)) && matches.length < 40) {
    const s = Math.max(0, m.index - 70), e = Math.min(text.length, m.index + 70);
    matches.push(text.slice(s, e).replace(/\s+/g, " "));
  }
  if (matches.length) hits.push({ nom: p.nom, cle: keyOf(p.nom), title, touched, matches });
  else clean.push({ nom: p.nom, cle: keyOf(p.nom), title, touched });
  await new Promise((r) => setTimeout(r, 120));
}

writeFileSync(join(ROOT, "data", "scan-remaining.json"), JSON.stringify({ hits, clean }, null, 1));
console.log(`Restants scannés : ${remaining.length}`);
console.log(`À VÉRIFIER (mots-clés judiciaires) : ${hits.length}`);
console.log(`Propres (aucun mot-clé) : ${clean.length}`);
console.log("\n=== À VÉRIFIER ===");
for (const h of hits) console.log(`\n### ${h.nom}${h.err ? " [ERR " + h.err + "]" : ""}\n- ` + (h.matches || []).slice(0, 12).map((x) => "…" + x + "…").join("\n- "));
console.log("\n=== PROPRES ===\n" + clean.map((c) => c.nom).join(", "));

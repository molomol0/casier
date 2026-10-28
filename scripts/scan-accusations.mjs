// Scanne l'article frwiki de CHAQUE personne enrichie et fait remonter celles
// dont la page évoque des ACCUSATIONS (viol, agression, harcèlement, plainte…),
// avec le contexte et un repérage de la suite (non-lieu, classé, condamné…).
// Ne décide rien : surface des candidats à remplir/vérifier à la main.
// Usage : node scripts/scan-accusations.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "casier-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const DIR = join(ROOT, "data", "enriched");

// Mots déclencheurs d'accusation (bornés pour éviter violence/violoncelle…)
const KW = /(\baccus\w+|\bviols?\b|agressions? sexuelles?|harc[eè]lement|\bplainte\b|\bplaintes\b|mis[e]? en cause|abus de faiblesse|attouchement\w*|proxénétisme|\binceste\b|p[ée]docriminel\w*|p[ée]dophil\w*|outrage sexiste|#?metoo|balance ton)/i;
// Mots de "suite" pour pré-trier
const OUT = /(non-lieu|class[ée]e? sans suite|classement sans suite|relax\w+|acquitt\w+|condamn\w+|mis[e]? en examen|information judiciaire|enqu[êe]te|proc[èe]s)/i;

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const hits = [];
let done = 0;
for (const f of files) {
  const e = JSON.parse(readFileSync(join(DIR, f), "utf8"));
  const title = e.wikiTitle || e.nom;
  let text = "";
  try {
    const d = await (await fetch("https://fr.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", prop: "extracts", explaintext: "1", format: "json", redirects: "1", titles: title,
    }), { headers: { "User-Agent": UA } })).json();
    text = Object.values(d.query?.pages ?? {})[0]?.extract ?? "";
  } catch {}
  const re = new RegExp(KW.source, "gi");
  const snippets = [];
  let m;
  while ((m = re.exec(text)) && snippets.length < 8) {
    const s = Math.max(0, m.index - 90), end = Math.min(text.length, m.index + 110);
    snippets.push(text.slice(s, end).replace(/\s+/g, " "));
  }
  if (snippets.length) {
    const nOut = (text.match(new RegExp(OUT.source, "gi")) || []).length;
    hits.push({
      cle: f.replace(/\.json$/, ""), nom: e.nom, title,
      dejaAffaires: (e.affaires ?? []).length,
      dejaAccusations: (e.accusations ?? []).length,
      hits: snippets.length, aSuite: nOut > 0, snippets,
    });
  }
  if (++done % 50 === 0) console.log(`… ${done}/${files.length}`);
  await new Promise((r) => setTimeout(r, 90));
}
hits.sort((a, b) => b.hits - a.hits);
writeFileSync(join(ROOT, "data", "scan-accusations.json"), JSON.stringify(hits, null, 1));
console.log(`\nScannés : ${files.length}`);
console.log(`Candidats avec contenu « accusation » : ${hits.length}`);
console.log(`\n=== Candidats (nom · hits · a-une-suite · aff/acc déjà) ===`);
for (const h of hits) console.log(`${String(h.hits).padStart(2)} ${h.aSuite ? "✓" : " "} | ${h.nom}  [aff:${h.dejaAffaires}]`);

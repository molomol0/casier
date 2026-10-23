// Récupère l'article Wikipédia FR d'une personnalité + les URLs de ses références
// (articles de presse cités) — matière première de l'agent d'enrichissement.
// Usage : node scripts/fetch-wiki.mjs "Bernard Tapie"

const UA = "casseroles-game/0.1 (projet perso, contact: jimmy.denis@viseo.com)";
const API = "https://fr.wikipedia.org/w/api.php";

async function api(params) {
  const url = API + "?" + new URLSearchParams({ format: "json", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} sur ${url}`);
  return res.json();
}

const query = process.argv[2];
if (!query) {
  console.error('Usage : node scripts/fetch-wiki.mjs "Nom Prénom"');
  process.exit(1);
}

// 1. Trouver le titre exact de l'article
const search = await api({ action: "query", list: "search", srsearch: query, srlimit: 1 });
const hit = search.query.search[0];
if (!hit) {
  console.log(JSON.stringify({ error: "article introuvable", query }));
  process.exit(0);
}
const title = hit.title;

// 2. Texte intégral en clair + date de dernière modification (pour /update-base)
const extractRes = await api({
  action: "query", prop: "extracts|info", explaintext: 1,
  titles: title, redirects: 1,
});
const page = Object.values(extractRes.query.pages)[0];

// 3. Wikitext pour en extraire les URLs des références (<ref>…</ref>)
const parseRes = await api({ action: "parse", page: title, prop: "wikitext", redirects: 1 });
const wikitext = parseRes.parse?.wikitext?.["*"] ?? "";
const refs = [...new Set(wikitext.match(/https?:\/\/[^\s|\]}<>"']+/g) ?? [])]
  .filter((u) => !/wikipedia\.org|wikimedia\.org|wikidata\.org|archive\.org\/web\/$/.test(u));

console.log(JSON.stringify(
  {
    query,
    title,
    url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
    touched: page.touched, // dernière modif de l'article — comparer à enrichedAt pour les updates
    text: page.extract ?? "",
    refs,
  },
  null,
  1
));

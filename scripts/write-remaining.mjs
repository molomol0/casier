// Écrit les fichiers enrichis des 70 dernières célébrités à partir du scan.
// Les 66 "propres" → affaires: []. Les 4 avec affaires pénales réelles → détaillées.
// Usage : node scripts/write-remaining.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "enriched");
const scan = JSON.parse(readFileSync(join(ROOT, "data", "scan-remaining.json"), "utf8"));
const all = [...scan.hits, ...scan.clean];

// Les 4 personnes à affaires réelles
const AFF = {
  "guillaume-depardieu": [
    { titre: "Trafic d'héroïne (usage, importation et trafic)", annee: 1988, statut: "CONDAMNATION_DEFINITIVE", categorie: "AUTRE", prisonTotal: 36, prisonFerme: 18, amende: 0, ineligibilite: 0, sources: ["https://www.lemonde.fr/disparitions/article/2008/10/14/guillaume-depardieu-une-vie-a-jouer-avec-le-feu_1106474_3382.html", "https://www.ina.fr/ina-eclaire-actu/guillaume-depardieu-acteur-gerard-depardieu-acteur-carriere-cinema-drogue-musique-staphylocoque-dore"] },
    { titre: "Possession et trafic d'héroïne", annee: 1993, statut: "CONDAMNATION_DEFINITIVE", categorie: "AUTRE", prisonTotal: 36, prisonFerme: 12, amende: 0, ineligibilite: 0, sources: ["https://www.lemonde.fr/disparitions/article/2008/10/14/guillaume-depardieu-une-vie-a-jouer-avec-le-feu_1106474_3382.html"] },
    { titre: "Usage d'arme à feu (tir au pistolet à grenaille lors d'une altercation à Trouville-sur-Mer)", annee: 2003, statut: "CONDAMNATION_DEFINITIVE", categorie: "VIOLENCE", prisonTotal: 9, prisonFerme: 0, amende: 5000, ineligibilite: 0, sources: ["https://www.ladepeche.fr/article/2003/09/09/126416-Guillaume-Depardieu-au-tribunal.html"] },
  ],
  "jean-jacques-annaud": [
    { titre: "Blanchiment de fraude fiscale (avoirs non déclarés au fisc français)", annee: 2021, statut: "CONDAMNATION_DEFINITIVE", categorie: "FRAUDE_FISCALE", prisonTotal: 9, prisonFerme: 0, amende: 120000, ineligibilite: 0, sources: ["https://fr.wikipedia.org/wiki/Jean-Jacques_Annaud"] },
  ],
  "tina-aumont": [
    { titre: "Usage et introduction de stupéfiants (opium) en Italie — condamnation par contumace", annee: 1978, statut: "CONDAMNATION_DEFINITIVE", categorie: "AUTRE", prisonTotal: 9, prisonFerme: 9, amende: 0, ineligibilite: 0, sources: ["https://fr.wikipedia.org/wiki/Tina_Aumont", "https://en.wikipedia.org/wiki/Tina_Aumont"] },
  ],
  "jan-guillou": [
    { titre: "Affaire IB — espionnage (activités de renseignement illégales)", annee: 1974, statut: "CONDAMNATION_DEFINITIVE", categorie: "AUTRE", prisonTotal: 10, prisonFerme: 10, amende: 0, ineligibilite: 0, sources: ["https://en.wikipedia.org/wiki/IB_affair", "https://fr.wikipedia.org/wiki/Jan_Guillou"] },
  ],
};

let nAff = 0, nClean = 0;
for (const p of all) {
  const affaires = AFF[p.cle] ?? [];
  const obj = {
    nom: p.nom,
    wikiTitle: p.title ?? p.nom,
    touched: p.touched ?? null,
    enrichedAt: "2026-10-21",
    affaires,
  };
  writeFileSync(join(DIR, p.cle + ".json"), JSON.stringify(obj, null, 1));
  if (affaires.length) nAff++; else nClean++;
}
console.log(`Écrits : ${all.length} fichiers (${nAff} avec affaires, ${nClean} propres)`);

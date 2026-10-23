"use strict";

const DATA = window.CASIER_DATA;

// Libellés et regroupement des statuts judiciaires
const STATUTS = {
  CONDAMNATION_DEFINITIVE: { label: "condamnation définitive", groupe: "definitive" },
  CONDAMNATION_EN_APPEL: { label: "condamnation — appel/pourvoi en cours", groupe: "appel" },
  MISE_EN_EXAMEN: { label: "mise en examen", groupe: "encours" },
  RENVOI_TRIBUNAL: { label: "renvoi devant le tribunal", groupe: "encours" },
  PROCES_EN_COURS: { label: "procès en cours", groupe: "encours" },
  INSTRUCTION: { label: "instruction en cours", groupe: "encours" },
  ENQUETE_PRELIMINAIRE: { label: "enquête préliminaire", groupe: "encours" },
  SIGNALEMENT_PARQUET: { label: "signalement au parquet", groupe: "encours" },
  PLAINTE_DEPOSEE: { label: "plainte déposée", groupe: "encours" },
};
const statutInfo = (s) => STATUTS[s] ?? { label: s.toLowerCase().replaceAll("_", " "), groupe: "encours" };

const MODES = {
  // Mode principal : chaque affaire vaut 1, quels que soient la peine ou le statut
  // (les options de l'accueil filtrent ce qui compte).
  affaires: {
    label: "Affaires",
    question: "a combien d'affaires au casier ?",
    unit: (v) => `${v} affaire${v > 1 ? "s" : ""}`,
    value: (p, affaires) => affaires.length,
  },
  prison: {
    label: "Prison",
    question: "a écopé de combien de mois de prison au total ?",
    unit: (v) => `${v} mois de prison`,
    value: (p, affaires) => affaires.reduce((s, a) => s + a.prisonTotal, 0),
  },
  amende: {
    label: "Amendes",
    question: "a écopé de combien d'amendes au total ?",
    unit: (v) => `${v.toLocaleString("fr-FR")} €`,
    value: (p, affaires) => affaires.reduce((s, a) => s + a.amende, 0),
  },
  ineligibilite: {
    label: "Inéligibilité",
    question: "a pris combien de mois d'inéligibilité ?",
    unit: (v) => `${v} mois d'inéligibilité`,
    value: (p, affaires) => affaires.reduce((s, a) => s + a.ineligibilite, 0),
  },
};

// Univers présents dans les données (politique, et plus tard celebrite).
const UNIVERS_LABELS = { politique: "Politiques", celebrite: "Célébrités" };
const UNIVERS = [...new Set(DATA.politicians.map((p) => p.univers || "politique"))];

const state = {
  mode: null,
  univers: "tout", // "tout" | "politique" | "celebrite"
  groupes: new Set(), // groupes de statuts inclus : definitive / appel / encours
  minAffaires: 1, // filtre "gros poissons" : nb minimum d'affaires comptées
  pool: [],
  left: null,
  right: null,
  next: null, // adversaire du tour suivant, tiré en avance pour précharger sa photo
  history: [], // dernières personnes vues, exclues du tirage (anti-répétition)
  score: 0,
};

// Précharge la photo pour que la carte s'affiche instantanément à son tour
function preload(p) {
  if (p?.photo) new Image().src = p.photo;
}

const $ = (id) => document.getElementById(id);
const screens = {
  home: $("screen-home"),
  game: $("screen-game"),
  over: $("screen-over"),
  browse: $("screen-browse"),
};

const normalize = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function show(name) {
  Object.entries(screens).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
}

function bestKey() {
  return `casier-best-${state.univers}-${state.mode}-${[...state.groupes].sort().join("+")}-min${state.minAffaires}`;
}

// Affaires retenues selon les toggles de statut cochés à l'accueil
function keptAffaires(p) {
  return p.affaires.filter((a) => state.groupes.has(statutInfo(a.statut).groupe));
}

function valueOf(p) {
  return MODES[state.mode].value(p, keptAffaires(p));
}

function buildPool() {
  // Personnes de l'univers choisi, avec photo (le jeu est visuel), une valeur > 0
  // pour le mode choisi, et au moins minAffaires affaires comptées.
  state.pool = DATA.politicians.filter(
    (p) =>
      (state.univers === "tout" || (p.univers || "politique") === state.univers) &&
      p.photo &&
      valueOf(p) > 0 &&
      keptAffaires(p).length >= state.minAffaires
  );
}

// Tire un adversaire : jamais d'égalité de valeur avec la carte en place, et
// JAMAIS quelqu'un déjà vu dans la partie. Renvoie null si le pool est épuisé.
function draw(excluded) {
  const seen = new Set(state.history);
  let candidates = state.pool.filter((p) => p !== excluded && !seen.has(p));
  if (!candidates.length) return null; // pool épuisé → victoire
  if (excluded) {
    const v = valueOf(excluded);
    const different = candidates.filter((p) => valueOf(p) !== v);
    if (different.length) candidates = different;
  }
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  state.history.push(pick);
  return pick;
}

function cardHtml(p, { revealed }) {
  const mode = MODES[state.mode];
  const affaires = keptAffaires(p);
  const detailRows = affaires
    .slice(0, 4)
    .map((a) => {
      const s = statutInfo(a.statut);
      return (
        `<li><span class="annee">${a.annee ?? "?"}</span> ${a.titre} ` +
        `<em class="badge ${s.groupe}">${s.label}</em></li>`
      );
    })
    .join("");
  const more = affaires.length > 4 ? `<li class="more">… et ${affaires.length - 4} autre(s)</li>` : "";

  return `
    <div class="photo" style="background-image:url('${p.photo}')"></div>
    <div class="overlay">
      <h3>${p.nom}</h3>
      <p class="sub">${p.poste ?? ""}${p.poste && p.parti ? " · " : ""}${p.parti ?? ""}</p>
      ${
        revealed
          ? `<p class="value">${mode.unit(valueOf(p))}</p>
             <ul class="details">${detailRows}${more}</ul>`
          : `<p class="question">${mode.question}</p>
             <div class="choices">
               <button class="btn-guess" data-guess="plus">Plus <span class="arrow">↑</span></button>
               <button class="btn-guess" data-guess="moins">Moins <span class="arrow">↓</span></button>
             </div>`
      }
    </div>`;
}

function renderDuel() {
  $("card-left").innerHTML = cardHtml(state.left, { revealed: true });
  const right = $("card-right");
  right.classList.remove("revealed");
  right.innerHTML = cardHtml(state.right, { revealed: false });
  right.querySelectorAll(".btn-guess").forEach((b) =>
    b.addEventListener("click", () => onGuess(b.dataset.guess))
  );
  $("hud-score").textContent = state.score;
  if (state.zen) {
    $("hud-best-label").textContent = "Erreurs";
    $("hud-best").textContent = state.mistakes;
  } else {
    $("hud-best-label").textContent = "Record";
    $("hud-best").textContent = localStorage.getItem(bestKey()) ?? 0;
  }
}

function onGuess(guess) {
  const vLeft = valueOf(state.left);
  const vRight = valueOf(state.right);
  const correct = guess === "plus" ? vRight > vLeft : vRight < vLeft;

  // Révéler la carte de droite
  const right = $("card-right");
  right.classList.add("revealed");
  right.innerHTML = cardHtml(state.right, { revealed: true });

  setTimeout(() => {
    if (correct) {
      state.score++;
      if (!state.zen) {
        const best = Number(localStorage.getItem(bestKey()) ?? 0);
        if (state.score > best) localStorage.setItem(bestKey(), state.score);
      }
    } else {
      if (!state.zen) return gameOver(false); // mode normal : une erreur = perdu
      state.mistakes++; // mode zen : on continue
    }
    // La carte de droite passe à gauche, celle préchargée arrive à droite
    state.left = state.right;
    state.right = state.next ?? draw(state.left);
    if (!state.right) return gameOver(true); // plus personne à affronter : pool épuisé
    state.next = draw(state.right);
    preload(state.next);
    renderDuel();
  }, 1400);
}

function gameOver(victory) {
  if (state.zen) {
    // Mode zen : on ne perd jamais, la partie se termine quand le pool est épuisé
    const bonnes = `${state.score} bonne${state.score > 1 ? "s" : ""} réponse${state.score > 1 ? "s" : ""}`;
    const erreurs = `${state.mistakes} erreur${state.mistakes > 1 ? "s" : ""}`;
    $("over-title").textContent = "Partie terminée";
    document.querySelector(".over-box").classList.toggle("win", true);
    $("over-summary").textContent = `${bonnes} · ${erreurs}` +
      (victory ? " · tout le monde affronté !" : "");
    setTimeout(() => show("over"), 400);
    return;
  }
  $("over-title").textContent = victory ? "Sans-faute" : "Perdu";
  document.querySelector(".over-box").classList.toggle("win", victory);
  $("over-summary").textContent =
    (victory ? "Tu as affronté tout le monde sans te tromper. " : "") +
    `Score : ${state.score} · Record (${MODES[state.mode].label}) : ` +
    (localStorage.getItem(bestKey()) ?? 0);
  setTimeout(() => show("over"), victory ? 400 : 800);
}

function startGame() {
  state.mode = document.querySelector('input[name="mode"]:checked')?.value ?? "affaires";
  state.groupes = new Set(
    [...document.querySelectorAll(".chk-statut:checked")].map((c) => c.value)
  );
  if (!state.groupes.size) {
    alert("Coche au moins un type d'affaire.");
    return;
  }
  state.minAffaires = Number(
    document.querySelector('input[name="min-affaires"]:checked')?.value ?? 1
  );
  state.zen = $("chk-zen")?.checked ?? false;
  state.mistakes = 0;
  buildPool();
  if (state.pool.length < 2) {
    alert("Pas assez de données pour ce mode avec ces filtres.");
    return;
  }
  state.score = 0;
  state.history = [];
  state.left = draw(null);
  state.right = draw(state.left);
  state.next = draw(state.right);
  [state.left, state.right, state.next].forEach(preload);
  $("hud-mode").textContent = MODES[state.mode].label;
  renderDuel();
  show("game");
}

function renderUnivers() {
  // Sélecteur Politiques / Célébrités / Tout — affiché seulement si plusieurs
  // univers existent dans la base (sinon inutile de montrer un choix vide).
  const row = $("univers-row");
  if (UNIVERS.length < 2) {
    state.univers = "tout";
    return;
  }
  const options = ["tout", ...UNIVERS];
  row.innerHTML =
    `<h2 class="block-title">Univers</h2>` +
    `<div class="segmented" role="radiogroup">` +
    options
      .map(
        (u) =>
          `<label><input type="radio" name="univers" value="${u}" ${u === state.univers ? "checked" : ""} />` +
          `<span>${u === "tout" ? "Tout" : UNIVERS_LABELS[u] ?? u}</span></label>`
      )
      .join("") +
    `</div>`;
  row.classList.remove("hidden");
  row.querySelectorAll('input[name="univers"]').forEach((r) =>
    r.addEventListener("change", () => {
      state.univers = r.value;
      updatePoolCount();
    })
  );
}

function updateModeHint() {
  const mode = document.querySelector('input[name="mode"]:checked')?.value ?? "affaires";
  $("mode-hint").textContent = "Devine qui " + MODES[mode].question;
}

// Compte en direct le nombre de personnalités jouables avec les réglages choisis.
function updatePoolCount() {
  const el = $("pool-count");
  if (!el) return;
  state.mode = document.querySelector('input[name="mode"]:checked')?.value ?? "affaires";
  state.groupes = new Set(
    [...document.querySelectorAll(".chk-statut:checked")].map((c) => c.value)
  );
  state.minAffaires = Number(
    document.querySelector('input[name="min-affaires"]:checked')?.value ?? 1
  );
  if (!state.groupes.size) {
    el.textContent = "Coche au moins un type d'affaire dans les options.";
    return;
  }
  buildPool();
  const n = state.pool.length;
  el.textContent =
    n >= 2
      ? `${n} personnalités peuvent apparaître avec ces réglages.`
      : "Pas assez de personnalités avec ces réglages.";
}

function initHome() {
  renderUnivers();
  // Critère de comparaison : un segmented (un seul choix visible), puis bouton Jouer.
  const seg = $("mode-seg");
  seg.innerHTML = Object.entries(MODES)
    .map(
      ([key, mode], i) =>
        `<label><input type="radio" name="mode" value="${key}" ${i === 0 ? "checked" : ""} />` +
        `<span>${mode.label}</span></label>`
    )
    .join("");
  seg.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener("change", () => {
      updateModeHint();
      updatePoolCount();
    })
  );
  // Recalcul du compteur quand on change un filtre (qui peut apparaître / statuts)
  document
    .querySelectorAll('input[name="min-affaires"], .chk-statut')
    .forEach((inp) => inp.addEventListener("change", updatePoolCount));
  updateModeHint();
  updatePoolCount();
  $("btn-play").addEventListener("click", () => startGame());
}

// ---------- Annuaire ----------

function peinesText(a) {
  const parts = [];
  if (a.prisonTotal > 0)
    parts.push(
      `${a.prisonTotal} mois de prison` +
        (a.prisonFerme > 0 ? ` (dont ${a.prisonFerme} ferme)` : " (sursis)")
    );
  if (a.amende > 0) parts.push(`${a.amende.toLocaleString("fr-FR")} € d'amende`);
  if (a.ineligibilite > 0) parts.push(`${a.ineligibilite} mois d'inéligibilité`);
  return parts.join(" · ");
}

function browseSummary(p) {
  if (!p.affaires.length) return `<span class="clean">Aucune affaire recensée</span>`;
  const counts = { definitive: 0, appel: 0, encours: 0 };
  for (const a of p.affaires) counts[statutInfo(a.statut).groupe]++;
  const parts = [];
  if (counts.definitive) parts.push(`${counts.definitive} définitive${counts.definitive > 1 ? "s" : ""}`);
  if (counts.appel) parts.push(`${counts.appel} en appel`);
  if (counts.encours) parts.push(`${counts.encours} en cours`);
  return `<strong>${p.affaires.length} affaire${p.affaires.length > 1 ? "s" : ""}</strong> — ${parts.join(" · ")}`;
}

function browseDetail(p) {
  if (!p.affaires.length)
    return `<p class="det-note">Article Wikipédia analysé : aucune affaire pénale recensée.</p>`;
  const rows = [...p.affaires]
    .sort((a, b) => (b.annee ?? 0) - (a.annee ?? 0))
    .map((a) => {
      const s = statutInfo(a.statut);
      const peines = peinesText(a);
      const sources = (a.sources ?? [])
        .map((u, i) => {
          let host = "source";
          try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
          return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host)}</a>`;
        })
        .join(" · ");
      return `<div class="det-aff">
        <div><span class="annee">${a.annee ?? "?"}</span> ${esc(a.titre)} <em class="badge ${s.groupe}">${s.label}</em></div>
        ${peines ? `<div class="det-peines">${esc(peines)}</div>` : ""}
        ${sources ? `<div class="det-sources">Sources : ${sources}</div>` : ""}
      </div>`;
    })
    .join("");
  return rows;
}

function renderBrowse() {
  const q = normalize($("browse-search").value ?? "");
  const univ = $("f-univers").value;
  const min = Number($("f-min").value);
  const statut = $("f-statut").value;
  const sort = $("f-sort").value;
  const matches = DATA.politicians
    .filter(
      (p) =>
        (!q || normalize(p.nom + " " + (p.parti ?? "")).includes(q)) &&
        (univ === "tout" || (p.univers ?? "politique") === univ) &&
        p.affaires.length >= min &&
        (statut === "tout" ||
          p.affaires.some((a) => statutInfo(a.statut).groupe === statut))
    )
    .sort((a, b) =>
      sort === "nom"
        ? a.nom.localeCompare(b.nom, "fr")
        : b.affaires.length - a.affaires.length || a.nom.localeCompare(b.nom, "fr")
    );
  $("browse-count").textContent = `${matches.length} / ${DATA.politicians.length}`;
  $("browse-list").innerHTML = matches
    .map((p, i) => {
      const initiales = p.nom.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
      return `<div class="brow" data-cle="${esc(p.cle)}">
        <div class="brow-head">
          ${p.photo
            ? `<img class="brow-photo" src="${esc(p.photo)}" loading="lazy" alt="" />`
            : `<div class="brow-photo brow-initiales">${esc(initiales)}</div>`}
          <div class="brow-id">
            <strong>${esc(p.nom)}</strong>
            <span class="brow-sub">${esc(p.poste ?? "")}${p.poste && p.parti ? " · " : ""}${esc(p.parti ?? "")}</span>
          </div>
          <div class="brow-resume">${browseSummary(p)}</div>
        </div>
        <div class="brow-detail hidden"></div>
      </div>`;
    })
    .join("");
}

$("browse-list").addEventListener("click", (ev) => {
  if (ev.target.closest("a")) return; // laisser les liens sources s'ouvrir
  const row = ev.target.closest(".brow");
  if (!row) return;
  const det = row.querySelector(".brow-detail");
  if (det.classList.contains("hidden")) {
    const p = DATA.politicians.find((x) => x.cle === row.dataset.cle);
    det.innerHTML = browseDetail(p);
    det.classList.remove("hidden");
  } else {
    det.classList.add("hidden");
  }
});

$("browse-search").addEventListener("input", () => renderBrowse());
for (const id of ["f-univers", "f-min", "f-statut", "f-sort"])
  $(id).addEventListener("change", () => renderBrowse());
$("btn-browse").addEventListener("click", () => {
  renderBrowse();
  show("browse");
});
$("btn-browse-back").addEventListener("click", () => show("home"));

$("btn-retry").addEventListener("click", () => startGame());
$("btn-home").addEventListener("click", () => show("home"));
$("btn-quit").addEventListener("click", () => show("home"));

initHome();
show("home");

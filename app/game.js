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

// Statuts d'ACCUSATION — hors périmètre pénal. Toujours affichés avec leur suite
// réelle (non-lieu, classement…), jamais confondus avec une condamnation.
const ACCUSATIONS_STATUTS = {
  NON_LIEU: "non-lieu",
  CLASSEMENT_SANS_SUITE: "classé sans suite",
  INFORMATION_EN_COURS: "information judiciaire en cours",
  ACCUSATION_PUBLIQUE: "accusation publique",
};
const accStatutLabel = (s) => ACCUSATIONS_STATUTS[s] ?? s.toLowerCase().replaceAll("_", " ");
const accusationsOf = (p) => p.accusations ?? [];

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
  // Mode « pour le fun » : additionne casier pénal ET accusations. Chaque élément
  // reste tagué par nature (condamnation vs accusation) et par statut — jamais fondu
  // en un seul type. Un bandeau d'avertissement s'affiche dans ce mode.
  casier_accusations: {
    label: "Casier + accusations",
    question: "a combien d'affaires et d'accusations au total ?",
    unit: (v) => `${v} au total`,
    value: (p, affaires) => affaires.length + accusationsOf(p).length,
    withAccusations: true,
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

// Nombre d'éléments comptés pour le filtre « qui peut apparaître » :
// casier pénal seul, ou casier + accusations dans le mode combiné.
function countForMin(p) {
  const base = keptAffaires(p).length;
  return MODES[state.mode]?.withAccusations ? base + accusationsOf(p).length : base;
}

function buildPool() {
  // Personnes de l'univers choisi, avec photo (le jeu est visuel), une valeur > 0
  // pour le mode choisi, et au moins minAffaires éléments comptés.
  state.pool = DATA.politicians.filter(
    (p) =>
      (state.univers === "tout" || (p.univers || "politique") === state.univers) &&
      p.photo &&
      valueOf(p) > 0 &&
      countForMin(p) >= state.minAffaires
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

// Question de la couverture : « plus ou moins … que X ? » selon le mode
const VS_QUESTIONS = {
  affaires: (nom) => `<b>plus</b> ou <b>moins</b> d'affaires au casier que ${nom} ?`,
  prison: (nom) => `<b>plus</b> ou <b>moins</b> de mois de prison que ${nom} ?`,
  amende: (nom) => `<b>plus</b> ou <b>moins</b> d'amendes que ${nom} ?`,
  ineligibilite: (nom) => `<b>plus</b> ou <b>moins</b> de mois d'inéligibilité que ${nom} ?`,
  casier_accusations: (nom) => `<b>plus</b> ou <b>moins</b> d'affaires et d'accusations que ${nom} ?`,
};

// « Sarkozy, N. » pour l'onglet de la chemise
function nomOnglet(p) {
  const mots = p.nom.split(/\s+/);
  if (mots.length < 2) return p.nom;
  return `${mots.slice(1).join(" ")}, ${mots[0][0]}.`;
}

function affairesLis(p) {
  const mode = MODES[state.mode];
  const rows = keptAffaires(p).map((a) => {
    const s = statutInfo(a.statut);
    return (
      `<li><span class="annee">${a.annee ?? "?"}</span> ${esc(a.titre)} ` +
      `<em class="badge ${s.groupe}">${s.label}</em></li>`
    );
  });
  // Dans le mode combiné, les accusations gardent leur badge distinct
  if (mode.withAccusations)
    rows.push(
      ...accusationsOf(p).map(
        (a) =>
          `<li><span class="annee">${a.annee ?? "?"}</span> ${esc(a.titre)} ` +
          `<em class="badge accusation">accusation · ${esc(accStatutLabel(a.statut))}</em></li>`
      )
    );
  return rows.join("");
}

function sousTitre(p) {
  return `${esc(p.poste ?? "")}${p.poste && p.parti ? " · " : ""}${esc(p.parti ?? "")}`;
}

// La chemise complète : feuilles (fiche + feuilleteur) et, si fermée, couverture
function fardeHtml(p, piece, { ouvert }) {
  const mode = MODES[state.mode];
  const fiche = `
    <div class="feuilles">
      <div class="feuille decor"></div>
      <div class="feuille page p1">
        <div class="fiche-contenu">
          <div class="fiche-photo" style="background-image:url('${p.photo}')"></div>
          <h3>${esc(p.nom)}</h3>
          <p class="sub">${sousTitre(p)}</p>
          <div class="verdict"><div class="num">${mode.unit(valueOf(p))}</div></div>
          <ul class="affaires">${affairesLis(p)}</ul>
          <span class="tampon-verdict"></span>
        </div>
      </div>
      <div class="pager">
        <button class="pg-prev">‹</button>
        <span class="pg-lbl"></span>
        <button class="pg-next">›</button>
      </div>
    </div>`;
  const couverture = ouvert
    ? ""
    : `
    <div class="couverture">
      <div class="face avant">
        <span class="onglet">${esc(nomOnglet(p))}</span>
        <span class="couv-cote">Pièce ${piece}</span>
        <div class="photo-id" style="background-image:url('${p.photo}')" data-piece="PIÈCE ${piece}"></div>
        <div class="couv-nom">${esc(p.nom)}</div>
        <p class="couv-sub">${sousTitre(p)}</p>
        <p class="couv-question">${VS_QUESTIONS[state.mode](esc(state.left.nom))}</p>
        <p class="couv-hint">réponds avec les tampons</p>
        <span class="marque-choix"></span>
        <span class="tampon-conf">Confidentiel</span>
      </div>
      <div class="face arriere"></div>
    </div>`;
  return `<div class="farde">${fiche}${couverture}</div>`;
}

// Répartit les affaires sur plusieurs feuilles : la feuille 1 se remplit à
// ras bord, le surplus passe sur des feuilles « suite » créées à la demande.
// (Mesure réelle du débordement — l'écran doit être visible.)
function paginate(dossier) {
  const pile = dossier.querySelector(".feuilles");
  let cur = pile.querySelector(".feuille.page.p1");
  let num = 1;
  let garde = 0;
  while (cur && garde++ < 30) {
    const contenu = cur.querySelector(".fiche-contenu");
    const ul = contenu.querySelector("ul.affaires");
    let suivante = null;
    let g2 = 0;
    while (ul && contenu.scrollHeight > contenu.clientHeight + 1 && ul.children.length > 1 && g2++ < 80) {
      if (!suivante) {
        suivante = document.createElement("div");
        suivante.className = "feuille page pcont";
        suivante.innerHTML =
          `<div class="fiche-contenu"><h4>Feuille ${num + 1} — suite du casier</h4>` +
          `<ul class="affaires cont"></ul></div>`;
        // insérée SOUS les pages existantes (avant la première page du DOM)
        pile.insertBefore(suivante, pile.querySelector(".feuille.page"));
      }
      suivante.querySelector("ul").prepend(ul.lastElementChild);
    }
    cur = suivante;
    num++;
  }
}

// Feuilleteur ‹ 1/2 › : navigation complète entre les feuilles.
// Une seule feuille → pas de feuilleteur du tout.
function initPager(dossier) {
  const pager = dossier.querySelector(".pager");
  if (!pager) return;
  const pages = [...dossier.querySelectorAll(".feuille.page")].reverse(); // p1 d'abord
  if (pages.length < 2) {
    pager.remove();
    return;
  }
  let idx = 0;
  const lbl = pager.querySelector(".pg-lbl");
  const prev = pager.querySelector(".pg-prev");
  const next = pager.querySelector(".pg-next");
  const maj = () => {
    lbl.textContent = `Feuille ${idx + 1}/${pages.length}`;
    prev.disabled = idx === 0;
    next.disabled = idx === pages.length - 1;
  };
  next.addEventListener("click", () => {
    if (idx < pages.length - 1) {
      pages[idx].classList.add("tournee");
      idx++;
      maj();
    }
  });
  prev.addEventListener("click", () => {
    if (idx > 0) {
      idx--;
      pages[idx].classList.remove("tournee");
      maj();
    }
  });
  maj();
}

// Défaite non bloquante : le duel reste affiché, bandeau Rejouer / Menu.
function defaite() {
  $("defeat-summary").textContent =
    `Score : ${state.score} · Record (${MODES[state.mode].label}) : ` +
    (localStorage.getItem(bestKey()) ?? 0);
  $("defeat-bar").classList.remove("hidden");
}

function renderDuel({ entree = false } = {}) {
  state.locked = false;
  $("defeat-bar").classList.add("hidden");
  $("accusation-warning").classList.toggle("hidden", !MODES[state.mode]?.withAccusations);
  const left = $("card-left");
  const right = $("card-right");
  left.className = "dossier ouvert-ref";
  left.style.cssText = "";
  left.innerHTML = fardeHtml(state.left, "A", { ouvert: true });
  right.className = "dossier ferme" + (entree ? " entree" : "");
  right.style.cssText = "";
  right.innerHTML = fardeHtml(state.right, "B", { ouvert: false });
  paginate(left);
  paginate(right);
  initPager(left);
  initPager(right);
  $("hud-score").textContent = state.score;
  if (state.zen) {
    $("hud-best-label").textContent = "Erreurs";
    $("hud-best").textContent = state.mistakes;
  } else {
    $("hud-best-label").textContent = "Record";
    $("hud-best").textContent = localStorage.getItem(bestKey()) ?? 0;
  }
}

// Réponse au tampon : vol de l'outil → empreinte → ouverture → verdict → tour suivant
function onGuess(guess) {
  if (state.locked || screens.game.classList.contains("hidden")) return;
  state.locked = true;
  const right = $("card-right");
  const vLeft = valueOf(state.left);
  const vRight = valueOf(state.right);
  const correct = guess === "plus" ? vRight > vLeft : vRight < vLeft;

  // 1. le tampon vole jusqu'au dossier et le presse
  const outil = $(guess === "plus" ? "outil-plus" : "outil-moins");
  const farde = right.querySelector(".farde").getBoundingClientRect();
  const or = outil.getBoundingClientRect();
  outil.style.setProperty("--dx", `${farde.left + farde.width / 2 - (or.left + or.width / 2)}px`);
  outil.style.setProperty("--dy", `${farde.top + farde.height * 0.56 - (or.top + or.height / 2)}px`);
  outil.classList.add("presse");
  setTimeout(() => outil.classList.remove("presse"), 1150);

  // 2. l'empreinte + / − s'imprime (le délai CSS la cale sur la pression)
  const marque = right.querySelector(".marque-choix");
  marque.textContent = guess === "plus" ? "+" : "−";
  marque.classList.add(guess, "actif");

  // 3. la couverture s'ouvre quand le tampon se relève, le verdict se tamponne
  setTimeout(() => {
    right.classList.replace("ferme", "ouvert");
    const verdict = right.querySelector(".tampon-verdict");
    verdict.textContent = correct ? "Bien vu" : "Raté";
    verdict.classList.add(correct ? "correct" : "rate", "actif");
    if (correct) {
      state.score++;
      $("hud-score").textContent = state.score;
      if (!state.zen) {
        const best = Number(localStorage.getItem(bestKey()) ?? 0);
        if (state.score > best) localStorage.setItem(bestKey(), state.score);
      }
    }
  }, 1000);

  // 4. résolution : défaite, ou glissement vers le tour suivant
  setTimeout(() => {
    // Défaite : on NE quitte PAS l'écran — le joueur peut lire la fiche
    // qui l'a fait perdre (et la feuilleter) ; un bandeau propose la suite.
    if (!correct && !state.zen) return defaite();
    if (!correct) {
      state.mistakes++;
      $("hud-best").textContent = state.mistakes;
    }
    const left = $("card-left");
    const ra = left.getBoundingClientRect();
    const rb = right.getBoundingClientRect();
    left.classList.add("sortie");
    right.classList.add("glisse");
    right.style.transform = `translate(${ra.left - rb.left}px, ${ra.top - rb.top}px)`;
    setTimeout(() => {
      state.left = state.right;
      state.right = state.next ?? draw(state.left);
      if (!state.right) return gameOver(true); // pool épuisé : victoire
      state.next = draw(state.right);
      preload(state.next);
      renderDuel({ entree: true });
    }, 780);
  }, 3400);
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
  // L'écran doit être visible AVANT le rendu : la pagination des feuilles
  // mesure le débordement réel, impossible sur un écran en display:none.
  show("game");
  renderDuel();
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
  const nAcc = accusationsOf(p).length;
  const accPart = nAcc
    ? `<span class="acc-count">${nAcc} accusation${nAcc > 1 ? "s" : ""}</span>`
    : "";
  if (!p.affaires.length)
    return accPart || `<span class="clean">Aucune affaire recensée</span>`;
  const counts = { definitive: 0, appel: 0, encours: 0 };
  for (const a of p.affaires) counts[statutInfo(a.statut).groupe]++;
  const parts = [];
  if (counts.definitive) parts.push(`${counts.definitive} définitive${counts.definitive > 1 ? "s" : ""}`);
  if (counts.appel) parts.push(`${counts.appel} en appel`);
  if (counts.encours) parts.push(`${counts.encours} en cours`);
  return (
    `<strong>${p.affaires.length} affaire${p.affaires.length > 1 ? "s" : ""}</strong> — ${parts.join(" · ")}` +
    (accPart ? ` · ${accPart}` : "")
  );
}

function sourcesHtml(a) {
  return (a.sources ?? [])
    .map((u) => {
      let host = "source";
      try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
      return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host)}</a>`;
    })
    .join(" · ");
}

function browseDetail(p) {
  const acc = accusationsOf(p);
  if (!p.affaires.length && !acc.length)
    return `<p class="det-note">Article Wikipédia analysé : aucune affaire pénale recensée.</p>`;

  const affRows = [...p.affaires]
    .sort((a, b) => (b.annee ?? 0) - (a.annee ?? 0))
    .map((a) => {
      const s = statutInfo(a.statut);
      const peines = peinesText(a);
      const sources = sourcesHtml(a);
      return `<div class="det-aff">
        <div><span class="annee">${a.annee ?? "?"}</span> ${esc(a.titre)} <em class="badge ${s.groupe}">${s.label}</em></div>
        ${peines ? `<div class="det-peines">${esc(peines)}</div>` : ""}
        ${sources ? `<div class="det-sources">Sources : ${sources}</div>` : ""}
      </div>`;
    })
    .join("");

  const affBlock = p.affaires.length
    ? affRows
    : `<p class="det-note">Aucune affaire pénale au casier.</p>`;

  const accBlock = acc.length
    ? `<div class="det-acc-block">
         <p class="det-acc-head">Accusations recensées
           <span class="det-acc-warn">— une accusation n'est ni une preuve ni une condamnation ; présomption d'innocence</span>
         </p>` +
      [...acc]
        .sort((a, b) => (b.annee ?? 0) - (a.annee ?? 0))
        .map((a) => {
          const sources = sourcesHtml(a);
          return `<div class="det-aff det-acc">
            <div><span class="annee">${a.annee ?? "?"}</span> ${esc(a.titre)} <em class="badge accusation">${esc(accStatutLabel(a.statut))}</em></div>
            ${sources ? `<div class="det-sources">Sources : ${sources}</div>` : ""}
          </div>`;
        })
        .join("") +
      `</div>`
    : "";

  return affBlock + accBlock;
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
    .sort((a, b) => {
      if (sort === "nom") return a.nom.localeCompare(b.nom, "fr");
      if (sort === "acc")
        return (
          accusationsOf(b).length - accusationsOf(a).length ||
          b.affaires.length - a.affaires.length ||
          a.nom.localeCompare(b.nom, "fr")
        );
      // "aff" (défaut) : d'abord le nombre d'affaires, puis les accusations à égalité
      return (
        b.affaires.length - a.affaires.length ||
        accusationsOf(b).length - accusationsOf(a).length ||
        a.nom.localeCompare(b.nom, "fr")
      );
    });
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

// Les tampons + / − : c'est avec eux qu'on répond
$("outil-plus").addEventListener("click", () => onGuess("plus"));
$("outil-moins").addEventListener("click", () => onGuess("moins"));

// Bandeau de défaite
$("btn-defeat-retry").addEventListener("click", () => {
  $("defeat-bar").classList.add("hidden");
  startGame();
});
$("btn-defeat-home").addEventListener("click", () => {
  $("defeat-bar").classList.add("hidden");
  show("home");
});

initHome();
show("home");

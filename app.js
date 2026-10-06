/* Escouades 40K : calculateur de points Warhammer 40,000 (10e édition).
   Aucune dépendance. Données : data/units.json (générées depuis BSData). */
(function () {
  "use strict";

  /* ---------- Types d'unité : libellé + icône ---------- */
  const TYPES = {
    epic: ["Héros épique", '<path d="M4 18 3 8l5 4 4-7 4 7 5-4-1 10z"/>'],
    character: ["Personnage", '<circle cx="12" cy="9" r="4"/><path d="M5 20c1-4 4-6 7-6s6 2 7 6"/>'],
    infantry: ["Infanterie", '<path d="M5 15a7 7 0 0 1 14 0v4H5z"/><path d="M8 14h8"/><path d="M12 8v3"/>'],
    vehicle: ["Véhicule", '<rect x="3" y="14" width="18" height="5" rx="2.5"/><path d="M7 14v-3h8l2 3"/><path d="M15 12.5h6"/>'],
    monster: ["Monstre", '<path d="M4 5c1 6 3 9 8 9s7-3 8-9"/><path d="M8 14l1 5M16 14l-1 5M12 14v6"/>'],
    mounted: ["Monté", '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16l4-6h5l3 6M10 10 9 7H7"/>'],
    beast: ["Bête", '<ellipse cx="12" cy="16" rx="4.5" ry="3.5"/><circle cx="6" cy="10" r="1.8"/><circle cx="10" cy="6.5" r="1.8"/><circle cx="14" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/>'],
    swarm: ["Nuée", '<circle cx="6" cy="7" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="18" cy="8" r="1.6"/><circle cx="8" cy="13" r="1.6"/><circle cx="15" cy="13" r="1.6"/><circle cx="11" cy="19" r="1.6"/><circle cx="18" cy="18" r="1.6"/>'],
    fortification: ["Fortification", '<path d="M5 20V9h3V6h2v3h4V6h2v3h3v11z"/><path d="M10 20v-5h4v5"/>'],
    drone: ["Drone", '<circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'],
    other: ["Autre", '<path d="M12 3l9 9-9 9-9-9z"/>'],
  };
  const typeLabel = (t) => (TYPES[t] || TYPES.other)[0];
  const icon = (t) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (TYPES[t] || TYPES.other)[1] + "</svg>";

  /* ---------- Utilitaires ---------- */
  const $app = document.getElementById("app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Comme norm, mais tirets et apostrophes comptent comme des espaces (« avant-garde » = « avant garde »)
  const normS = (s) => norm(s).replace(/[-\u2010-\u2015\u2019']/g, " ").replace(/\s+/g, " ").trim();
  const uid = () => Math.random().toString(36).slice(2, 9);
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
  }

  /* ---------- Stockage local ---------- */
  const KEY = "escouades40k.v1";
  let db = { squads: [], last: null };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.squads)) db = raw;
  } catch (e) { /* stockage indisponible : on démarre vide */ }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast("Enregistrement impossible"); }
  }
  const getSquad = (id) => db.squads.find((s) => s.id === id);

  /* ---------- Données ---------- */
  let units = [], byId = new Map(), meta = {}, loadError = false;
  async function loadUnits() {
    try {
      const res = await fetch("data/units.json");
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      units = data.units;
      meta = { count: data.count, generated: data.generated, game: data.game };
      byId = new Map(units.map((u) => [u.id, u]));
      loadError = false;
    } catch (e) { loadError = true; return; }
    // Fichiers facultatifs modifiables à la main. Absent = on ignore ; illisible = on prévient.
    async function optionalJson(path) {
      let res;
      try { res = await fetch(path); } catch (e) { return {}; }
      if (!res.ok) return {};
      try { return await res.json(); }
      catch (e) { dataWarn.push(path.split("/").pop()); return {}; }
    }
    // Noms français : data/noms-fr.json
    const fr = await optionalJson("data/noms-fr.json");
    units.forEach((u) => {
      const v = fr[u.faction + "::" + u.name] || fr[u.name];
      u.fr = typeof v === "string" ? v.split("|").map((x) => x.trim()).filter(Boolean) : [];
      u.hay = normS([u.name].concat(u.fr).join(" "));
    });
    // Glossaire français → anglais pour la recherche : data/glossaire-fr.json
    const g = await optionalJson("data/glossaire-fr.json");
    gloss = Object.keys(g).filter((k) => k[0] !== "_").map((k) => {
      const alts = [].concat(g[k]).filter((x) => typeof x === "string"); // "vanguard" ou ["vanguard"]
      return { key: normS(k), alts: alts.map((a) => normS(a)) };
    }).sort((a, b) => b.key.length - a.key.length);
  }
  let gloss = [];
  const dataWarn = [];
  const warnHtml = () => (dataWarn.length
    ? '<p class="empty" style="margin:10px 0">⚠ Fichier illisible : ' + esc(dataWarn.join(", ")) +
      " (virgule ou guillemet manquant ?). Il est ignoré pour l’instant.</p>" : "");
  const stem = (w) => w.replace(/(s|x)$/, "");
  // Transforme la saisie en groupes : chaque groupe est une liste de variantes (l'une d'elles doit être trouvée)
  function queryGroups(raw) {
    let q = " " + normS(raw) + " ";
    const groups = [];
    for (const g of gloss) {
      if (!g.key.includes(" ")) continue;
      const re = new RegExp(" " + g.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "s? ");
      if (re.test(q)) { groups.push([g.key].concat(g.alts)); q = q.replace(re, " "); }
    }
    q.split(/\s+/).filter(Boolean).forEach((w) => {
      const base = stem(w);
      const hit = gloss.find((g) => !g.key.includes(" ") && (g.key === w || g.key === base));
      groups.push([w].concat(hit ? hit.alts : []));
    });
    return groups;
  }
  // Titre affiché : nom français s'il existe, sinon nom anglais
  const titleOf = (u) => (u.fr && u.fr[0]) || u.name;
  const subOf = (u) => (u.fr && u.fr[0] && norm(u.fr[0]) !== norm(u.name) ? " · " + u.name : "");

  /* ---------- Calculs ---------- */
  function tierLabel(u, i) {
    const t = u.pts[i], next = u.pts[i + 1];
    const to = next ? next.from - 1 : u.max;
    return t.from === to ? t.from + " fig." : t.from + "–" + to + " fig.";
  }
  // Caractéristiques minimales (profil du premier type de figurine de l'unité)
  const STAT_DEFS = [
    ["M", "M", "Mouvement"], ["T", "E", "Endurance"], ["Sv", "Sv", "Sauvegarde"],
    ["W", "PV", "Points de vie"], ["LD", "Cd", "Commandement"], ["OC", "CO", "Contrôle d’objectif"],
    ["InSv", "Inv", "Sauvegarde invulnérable"],
  ];
  function statsHtml(u) {
    if (!db.stats || !u.stats || !u.stats.M) return "";
    const chips = STAT_DEFS.filter((d) => u.stats[d[0]]).map((d) =>
      '<span title="' + d[2] + '"><b>' + esc(u.stats[d[0]]) + "</b><i>" + d[1] + '<span class="sr"> ' + d[2] + "</span></i></span>").join("");
    return '<div class="stats" role="group" aria-label="Caractéristiques">' + chips + "</div>";
  }
  const statsToggle = () =>
    '<label class="switch"><input type="checkbox" id="opt-stats"' + (db.stats ? " checked" : "") + '>' +
    '<span class="track" aria-hidden="true"></span>Afficher les caractéristiques</label>';
  function ptsText(u) { return u.pts.map((t) => t.pts + " pts").join(" / "); }
  function itemPts(it) {
    const u = byId.get(it.unitId);
    if (!u) return 0;
    return u.pts[Math.min(it.tier, u.pts.length - 1)].pts * it.qty;
  }
  const squadPts = (s) => s.items.reduce((n, it) => n + itemPts(it), 0);
  const squadCount = (s) => s.items.reduce((n, it) => n + it.qty, 0);
  const qtyIn = (s, unitId) => (s ? s.items.filter((i) => i.unitId === unitId).reduce((n, i) => n + i.qty, 0) : 0);

  function newSquad() {
    const s = { id: uid(), name: "Escouade " + (db.squads.length + 1), items: [] };
    db.squads.push(s);
    db.last = s.id;
    save();
    return s;
  }
  function addUnit(s, unitId) {
    const it = s.items.find((i) => i.unitId === unitId && i.tier === 0);
    if (it) it.qty++; else s.items.push({ uid: uid(), unitId, qty: 1, tier: 0 });
    save();
  }
  function removeUnit(s, unitId) {
    for (let k = s.items.length - 1; k >= 0; k--) {
      const it = s.items[k];
      if (it.unitId !== unitId) continue;
      if (--it.qty <= 0) s.items.splice(k, 1);
      break;
    }
    save();
  }

  /* ---------- Routeur ---------- */
  function route() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, qs] = h.split("?");
    return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs || "") };
  }
  function render() {
    const r = route();
    window.scrollTo(0, 0);
    if (r.parts[0] === "search") return viewSearch(r.params.get("squad"));
    if (r.parts[0] === "squad" && getSquad(r.parts[1])) return viewSquad(getSquad(r.parts[1]));
    return viewHome();
  }

  /* ---------- Vue : accueil ---------- */
  function viewHome() {
    const rows = db.squads.map((s) =>
      '<button class="squad-row" data-act="open" data-id="' + s.id + '">' +
      '<span class="name">' + esc(s.name) +
      '<br><span class="sub">' + squadCount(s) + " unité" + (squadCount(s) > 1 ? "s" : "") + "</span></span>" +
      '<span class="pts">' + squadPts(s) + " pts</span></button>"
    ).join("");
    $app.innerHTML =
      '<div class="top"><h1>Escouades</h1></div>' + warnHtml() +
      '<div class="hero">' +
      '<button class="btn" data-act="new">Nouvelle escouade</button>' +
      '<button class="btn ghost" data-act="search">Chercher une figurine</button></div>' +
      "<h2>Escouades enregistrées</h2>" +
      (rows ? '<div class="stack">' + rows + "</div>" :
        '<p class="empty">Aucune escouade pour l’instant. Crée la première avec « Nouvelle escouade ».</p>') +
      '<p class="muted foot">' +
      (loadError ? "Données indisponibles. Connecte-toi une première fois pour les télécharger." :
        esc(meta.game || "") + " · " + (meta.count || 0) + " unités · données du " + esc(meta.generated || "?")) +
      "<br>Projet de fan non officiel, sans lien avec Games Workshop. Données : BSData.</p>";
  }

  /* ---------- Vue : escouade ---------- */
  function viewSquad(s) {
    db.last = s.id; save();
    const items = s.items.map((it) => {
      const u = byId.get(it.unitId);
      if (!u) return "";
      const tierSel = u.pts.length > 1
        ? '<select class="field" data-act="tier" data-uid="' + it.uid + '" aria-label="Taille de l’unité">' +
          u.pts.map((t, i) => '<option value="' + i + '"' + (i === it.tier ? " selected" : "") + ">" + tierLabel(u, i) + " · " + t.pts + " pts</option>").join("") + "</select>"
        : '<span class="muted">' + tierLabel(u, 0) + " · " + u.pts[0].pts + " pts</span>";
      return '<div class="card item" data-uid="' + it.uid + '">' + '<button class="grip" data-act="grip" data-uid="' + it.uid + '" aria-label="Déplacer l’unité (glisser, ou flèches haut et bas au clavier)" title="Glisser pour réordonner">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg></button>' +
        '<div class="ico">' + icon(u.type) + "</div>" +
        '<div class="info"><div class="title">' + esc(titleOf(u)) + "</div>" +
        '<div class="meta">' + esc(typeLabel(u.type)) + " · " + esc(u.faction) + esc(subOf(u)) + "</div>" +
        '<div class="line-pts">' + itemPts(it) + " pts</div></div>" +
        statsHtml(u) +
        '<div class="controls">' + tierSel +
        '<div class="stepper"><button data-act="dec" data-uid="' + it.uid + '" aria-label="Moins"' + (it.qty <= 1 ? " disabled" : "") + ">−</button>" +
        '<span class="qty">' + it.qty + '</span><button data-act="inc" data-uid="' + it.uid + '" aria-label="Plus">+</button>' +
        '<button class="remove" data-act="del" data-uid="' + it.uid + '" aria-label="Retirer">✕</button></div></div></div>';
    }).join("");
    $app.innerHTML =
      '<div class="top"><button class="back" data-act="home" aria-label="Retour">‹</button>' +
      '<input class="name-input" id="squad-name" value="' + esc(s.name) + '" maxlength="40" aria-label="Nom de l’escouade"></div>' +
      '<div class="total"><span class="muted">Total</span><span class="pts pts-big" id="total">' + squadPts(s) + ' <small>pts</small></span></div>' +
      '<button class="btn" data-act="add-units">Ajouter des figurines</button>' +
      '<div style="margin-top:8px">' + statsToggle() + "</div>" +
      "<h2>Figurines</h2>" +
      (items ? '<div class="cards">' + items + "</div>" :
        '<p class="empty">Cette escouade est vide. Ajoute des figurines pour calculer les points.</p>') +
      '<div class="io"><button class="btn ghost" data-act="export">Exporter</button>' +
      '<button class="btn ghost" data-act="import">Importer</button></div>' +
      '<input type="file" id="import-file" accept=".json,application/json" hidden>' +
      '<div class="foot"><button class="btn danger" data-act="delete">Supprimer l’escouade</button></div>';
    document.getElementById("squad-name").addEventListener("input", (e) => {
      s.name = e.target.value.trim() || "Escouade sans nom";
      save();
    });
  }

  /* ---------- Vue : recherche ---------- */
  const F = { q: "", type: "", faction: db.faction || "", legends: false, limit: 40 };
  let target = null;

  function viewSearch(squadParam) {
    target = squadParam && getSquad(squadParam) ? squadParam : (getSquad(db.last) ? db.last : "__new");
    const factions = [...new Set(units.map((u) => u.faction))].sort();
    if (F.faction && !factions.includes(F.faction)) F.faction = "";
    const types = [...new Set(units.map((u) => u.type))].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "fr"));
    const squadOpts = db.squads.map((s) => '<option value="' + s.id + '"' + (s.id === target ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") +
      '<option value="__new"' + (target === "__new" ? " selected" : "") + ">+ Nouvelle escouade</option>";
    $app.innerHTML =
      '<div class="top"><button class="back" data-act="back" aria-label="Retour">‹</button><h1>Figurines</h1></div>' + warnHtml() +
      (loadError ? '<p class="empty">Données indisponibles. Connecte-toi une première fois pour les télécharger.</p>' :
      '<div class="filters">' +
      '<div class="target"><label for="f-target">Ajouter à</label><select class="field" id="f-target">' + squadOpts + "</select></div>" +
      '<input class="field" id="f-q" type="search" placeholder="Nom (ex. Bizarboy, Boyz, Intercessors…)" value="' + esc(F.q) + '" autocomplete="off">' +
      '<div class="row"><select class="field" id="f-type" aria-label="Type"><option value="">Tous les types</option>' +
      types.map((t) => '<option value="' + t + '"' + (F.type === t ? " selected" : "") + ">" + esc(typeLabel(t)) + "</option>").join("") + "</select>" +
      '<select class="field" id="f-faction" aria-label="Collection"><option value="">Toutes les collections</option>' +
      factions.map((f) => '<option value="' + esc(f) + '"' + (F.faction === f ? " selected" : "") + ">" + esc(f) + "</option>").join("") + "</select></div>" +
      '</div><div class="opts"><label class="check"><input type="checkbox" id="f-legends"' + (F.legends ? " checked" : "") + "> Inclure les unités Legends</label>" +
      statsToggle() + "</div>" +
      '<div id="results"></div>');
    if (!loadError) {
      const bind = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      bind("f-q", "input", (e) => { F.q = e.target.value; F.limit = 40; results(); });
      bind("f-type", "change", (e) => { F.type = e.target.value; F.limit = 40; results(); });
      bind("f-faction", "change", (e) => { F.faction = e.target.value; db.faction = F.faction; save(); F.limit = 40; results(); });
      bind("f-legends", "change", (e) => { F.legends = e.target.checked; F.limit = 40; results(); });
      bind("f-target", "change", (e) => { target = e.target.value; results(); });
      results();
    }
  }

  function filtered() {
    const groups = queryGroups(F.q);
    return units.filter((u) =>
      (F.legends || !u.legends) &&
      (!F.type || u.type === F.type) &&
      (!F.faction || u.faction === F.faction) &&
      groups.every((g) => g.some((w) => u.hay.includes(w))));
  }

  function results() {
    const list = filtered();
    const squad = getSquad(target);
    const shown = list.slice(0, F.limit);
    const cards = shown.map((u) => {
      const n = qtyIn(squad, u.id);
      return '<div class="card"><div class="ico">' + icon(u.type) + "</div>" +
        '<div class="info"><div class="title">' + esc(titleOf(u)) + "</div>" +
        '<div class="meta">' + esc(typeLabel(u.type)) + " · " + esc(u.faction) + esc(subOf(u)) + "</div>" +
        '<div class="meta">' + esc(ptsText(u)) + " · " + tierLabel(u, 0) + (u.pts.length > 1 ? " / " + tierLabel(u, u.pts.length - 1) : "") + "</div></div>" +
        '<div class="stepper">' +
        '<button data-act="rm" data-id="' + u.id + '" aria-label="Retirer"' + (n ? "" : " disabled") + ">−</button>" +
        (n ? '<span class="qty">' + n + "</span>" : "") +
        '<button class="add" data-act="ad" data-id="' + u.id + '" aria-label="Ajouter">+</button></div>' +
        statsHtml(u) + "</div>";
    }).join("");
    document.getElementById("results").innerHTML =
      '<p class="muted" style="margin-bottom:10px">' + list.length + " résultat" + (list.length > 1 ? "s" : "") + "</p>" +
      (cards ? '<div class="cards">' + cards + "</div>" : '<p class="empty">Aucune figurine ne correspond.</p>') +
      (list.length > shown.length ? '<button class="btn ghost more" data-act="more">Afficher plus</button>' : "");
  }

  function ensureTarget() {
    let s = getSquad(target);
    if (!s) {
      s = newSquad();
      target = s.id;
      const sel = document.getElementById("f-target");
      if (sel) {
        sel.innerHTML = db.squads.map((x) => '<option value="' + x.id + '"' + (x.id === s.id ? " selected" : "") + ">" + esc(x.name) + "</option>").join("") +
          '<option value="__new">+ Nouvelle escouade</option>';
      }
    }
    db.last = s.id;
    return s;
  }


  /* ---------- Export / import d'une escouade ---------- */
  const fileBase = (name) => (String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80)) || "escouade";

  function squadToFile(s) {
    return {
      app: "escouades40k", version: 1, game: meta.game || "", exportedAt: new Date().toISOString(),
      squad: {
        name: s.name, points: squadPts(s),
        items: s.items.map((it) => {
          const u = byId.get(it.unitId);
          return { unitId: it.unitId, name: u ? u.name : "", faction: u ? u.faction : "", qty: it.qty, tier: it.tier };
        }),
      },
    };
  }

  function exportSquad(s) {
    const name = fileBase(s.name) + ".json";
    const text = JSON.stringify(squadToFile(s), null, 2);
    const file = new File([text], name, { type: "application/json" });
    const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const download = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    };
    // Sur téléphone : feuille de partage (Enregistrer dans Fichiers, Messages, AirDrop…) ; sinon téléchargement direct
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: s.name }).catch((e) => { if (e && e.name !== "AbortError") download(); });
    } else download();
  }

  // Lit un fichier d'escouade ; retourne { name, items, skipped } ou null si le fichier n'est pas reconnu
  function parseSquadFile(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    const sq = data && (data.squad || data);
    if (!sq || !Array.isArray(sq.items)) return null;
    const items = [], skipped = [];
    sq.items.forEach((r) => {
      if (!r || typeof r !== "object") return;
      let u = byId.get(r.unitId);
      if (!u && r.name) u = units.find((x) => x.name === r.name && (!r.faction || x.faction === r.faction));
      if (!u) { skipped.push(r.name || "unité inconnue"); return; }
      const qty = Math.min(99, Math.max(1, parseInt(r.qty, 10) || 1));
      const tier = Math.min(u.pts.length - 1, Math.max(0, parseInt(r.tier, 10) || 0));
      items.push({ uid: uid(), unitId: u.id, qty, tier });
    });
    const name = typeof sq.name === "string" && sq.name.trim() ? sq.name.trim().slice(0, 40) : "";
    return { name, items, skipped, total: sq.items.length };
  }

  async function importSquad(s, file) {
    let text;
    try { text = await file.text(); } catch (e) { alert("Impossible de lire ce fichier."); return; }
    const r = parseSquadFile(text);
    if (!r) { alert("Ce fichier n’est pas une escouade valide."); return; }
    if (r.total > 0 && !r.items.length) { alert("Aucune des unités de ce fichier n’a été reconnue."); return; }
    const n = (k) => k + " unité" + (k > 1 ? "s" : "");
    let msg = "Remplacer « " + s.name + " » (" + n(squadCount(s)) + ") par « " + (r.name || s.name) + " » (" + n(r.items.reduce((a, i) => a + i.qty, 0)) + ") ?\nLe contenu actuel sera effacé.";
    if (r.skipped.length) msg += "\n\nNon reconnues, ignorées : " + r.skipped.join(", ") + ".";
    if (!confirm(msg)) return;
    if (r.name) s.name = r.name;
    s.items = r.items;
    save(); viewSquad(s); toast("Escouade importée");
  }

  /* ---------- Actions (délégation d'événements) ---------- */
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const r = route();
    const cur = r.parts[0] === "squad" ? getSquad(r.parts[1]) : null;
    const item = (id) => cur && cur.items.find((i) => i.uid === id);

    if (act === "new") { const s = newSquad(); location.hash = "#/squad/" + s.id; }
    else if (act === "open") location.hash = "#/squad/" + el.dataset.id;
    else if (act === "search") location.hash = "#/search";
    else if (act === "home") location.hash = "#/";
    else if (act === "back") location.hash = r.params.get("squad") ? "#/squad/" + r.params.get("squad") : "#/";
    else if (act === "add-units") location.hash = "#/search?squad=" + cur.id;
    else if (act === "more") { F.limit += 40; results(); }
    else if (act === "export" && cur) exportSquad(cur);
    else if (act === "import" && cur) { const inp = document.getElementById("import-file"); if (inp) inp.click(); }
    else if (act === "ad") {
      const s = ensureTarget(); addUnit(s, el.dataset.id); results();
      toast("Ajouté à " + s.name);
    }
    else if (act === "rm") {
      const s = getSquad(target); if (s) { removeUnit(s, el.dataset.id); results(); toast("Retiré"); }
    }
    else if (act === "inc") { item(el.dataset.uid).qty++; save(); viewSquad(cur); }
    else if (act === "dec") { const it = item(el.dataset.uid); if (it.qty > 1) it.qty--; save(); viewSquad(cur); }
    else if (act === "del") {
      cur.items = cur.items.filter((i) => i.uid !== el.dataset.uid); save(); viewSquad(cur); toast("Retiré");
    }
    else if (act === "delete") {
      if (confirm("Supprimer « " + cur.name + " » ?")) {
        db.squads = db.squads.filter((s) => s.id !== cur.id);
        if (db.last === cur.id) db.last = null;
        save(); location.hash = "#/";
      }
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "import-file") {
      const file = e.target.files && e.target.files[0], cur = getSquad(route().parts[1]);
      e.target.value = "";            // permet de réimporter le même fichier
      if (file && cur) importSquad(cur, file);
      return;
    }
    if (e.target.id === "opt-stats") {
      db.stats = e.target.checked; save();
      const r = route();
      if (r.parts[0] === "search") results();
      else if (r.parts[0] === "squad" && getSquad(r.parts[1])) {
        const y = window.scrollY; viewSquad(getSquad(r.parts[1])); window.scrollTo(0, y);
      }
      return;
    }
    const el = e.target.closest('[data-act="tier"]');
    if (!el) return;
    const r = route(), cur = getSquad(r.parts[1]);
    const it = cur && cur.items.find((i) => i.uid === el.dataset.uid);
    if (it) { it.tier = +el.value; save(); viewSquad(cur); }
  });


  /* ---------- Réorganisation des unités : glisser-déposer ---------- */
  let drag = null;
  function dragStep() {
    const card = drag.card;
    const place = () => { card.style.transform = "translateY(" + (drag.y + window.scrollY - drag.startY) + "px)"; };
    place();
    for (let guard = 0; guard < 20; guard++) {
      const r = card.getBoundingClientRect(), mid = r.top + r.height / 2;
      const prev = card.previousElementSibling, next = card.nextElementSibling;
      let swap = null;
      if (next) { const n = next.getBoundingClientRect(); if (mid > n.top + n.height / 2) swap = () => card.parentNode.insertBefore(next, card); }
      if (!swap && prev) { const q = prev.getBoundingClientRect(); if (mid < q.top + q.height / 2) swap = () => card.parentNode.insertBefore(card, prev); }
      if (!swap) break;
      const before = r.top;
      swap();
      drag.startY += card.getBoundingClientRect().top - before; // la carte reste sous le doigt
      place();
    }
  }
  document.addEventListener("pointerdown", (e) => {
    const h = e.target.closest('[data-act="grip"]');
    if (!h || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    const card = h.closest(".item");
    drag = { card, id: e.pointerId, startY: e.clientY + window.scrollY, y: e.clientY, raf: 0 };
    card.classList.add("dragging");
    document.body.classList.add("is-dragging");
    const tick = () => {
      if (!drag) return;
      const edge = 70, vh = window.innerHeight;       // défilement automatique près des bords
      if (drag.y < edge) window.scrollBy(0, -Math.ceil((edge - drag.y) / 4));
      else if (drag.y > vh - edge) window.scrollBy(0, Math.ceil((drag.y - (vh - edge)) / 4));
      dragStep();
      drag.raf = requestAnimationFrame(tick);
    };
    drag.raf = requestAnimationFrame(tick);
  });
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) drag.y = e.clientY; });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    cancelAnimationFrame(drag.raf);
    const card = drag.card, list = card.parentNode;
    card.classList.remove("dragging");
    card.style.transform = "";
    document.body.classList.remove("is-dragging");
    drag = null;
    const s = getSquad(route().parts[1]);
    if (!s) return;
    const order = [...list.querySelectorAll(".item")].map((c) => c.dataset.uid);
    const sorted = order.map((id) => s.items.find((i) => i.uid === id)).filter(Boolean);
    if (sorted.length === s.items.length) { s.items = sorted; save(); }
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest('[data-act="grip"]')) e.preventDefault(); });
  // Alternative au clavier : flèches haut / bas sur la poignée
  document.addEventListener("keydown", (e) => {
    const h = e.target.closest && e.target.closest('[data-act="grip"]');
    if (!h || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    const s = getSquad(route().parts[1]);
    if (!s) return;
    const i = s.items.findIndex((x) => x.uid === h.dataset.uid), j = i + (e.key === "ArrowUp" ? -1 : 1);
    if (i < 0 || !s.items[j]) return;
    [s.items[i], s.items[j]] = [s.items[j], s.items[i]];
    save(); viewSquad(s);
    const nh = document.querySelector('[data-act="grip"][data-uid="' + h.dataset.uid + '"]');
    if (nh) nh.focus();
  });

  window.addEventListener("hashchange", render);

  /* ---------- Démarrage ---------- */
  loadUnits().then(render);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();

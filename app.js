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
    } catch (e) { loadError = true; }
  }

  /* ---------- Calculs ---------- */
  function tierLabel(u, i) {
    const t = u.pts[i], next = u.pts[i + 1];
    const to = next ? next.from - 1 : u.max;
    return t.from === to ? t.from + " fig." : t.from + "–" + to + " fig.";
  }
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
      '<div class="top"><h1>Escouades</h1></div>' +
      '<div class="hero">' +
      '<button class="btn" data-act="new">Nouvelle escouade</button>' +
      '<button class="btn ghost" data-act="search">Chercher une figurine</button></div>' +
      "<h2>Escouades enregistrées</h2>" +
      (rows ? '<div class="stack">' + rows + "</div>" :
        '<p class="empty">Aucune escouade pour l’instant. Crée la première avec « Nouvelle escouade ».</p>') +
      '<p class="muted foot">' +
      (loadError ? "Données indisponibles. Connecte-toi une première fois pour les télécharger." :
        esc(meta.game || "") + " · " + (meta.count || 0) + " unités · données du " + esc(meta.generated || "?")) + "</p>";
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
      return '<div class="card item"><div class="ico">' + icon(u.type) + "</div>" +
        '<div class="info"><div class="title">' + esc(u.name) + "</div>" +
        '<div class="meta">' + esc(typeLabel(u.type)) + " · " + esc(u.faction) + "</div>" +
        '<div class="line-pts">' + itemPts(it) + " pts</div></div>" +
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
      "<h2>Figurines</h2>" +
      (items ? '<div class="cards">' + items + "</div>" :
        '<p class="empty">Cette escouade est vide. Ajoute des figurines pour calculer les points.</p>') +
      '<div class="foot"><button class="btn danger" data-act="delete">Supprimer l’escouade</button></div>';
    document.getElementById("squad-name").addEventListener("input", (e) => {
      s.name = e.target.value.trim() || "Escouade sans nom";
      save();
    });
  }

  /* ---------- Vue : recherche ---------- */
  const F = { q: "", type: "", faction: "", legends: false, limit: 40 };
  let target = null;

  function viewSearch(squadParam) {
    target = squadParam && getSquad(squadParam) ? squadParam : (getSquad(db.last) ? db.last : "__new");
    const factions = [...new Set(units.map((u) => u.faction))].sort();
    const types = [...new Set(units.map((u) => u.type))].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b), "fr"));
    const squadOpts = db.squads.map((s) => '<option value="' + s.id + '"' + (s.id === target ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") +
      '<option value="__new"' + (target === "__new" ? " selected" : "") + ">+ Nouvelle escouade</option>";
    $app.innerHTML =
      '<div class="top"><button class="back" data-act="back" aria-label="Retour">‹</button><h1>Figurines</h1></div>' +
      (loadError ? '<p class="empty">Données indisponibles. Connecte-toi une première fois pour les télécharger.</p>' :
      '<div class="filters">' +
      '<div class="target"><label for="f-target">Ajouter à</label><select class="field" id="f-target">' + squadOpts + "</select></div>" +
      '<input class="field" id="f-q" type="search" placeholder="Nom (ex. Boyz, Intercessor…)" value="' + esc(F.q) + '" autocomplete="off">' +
      '<div class="row"><select class="field" id="f-type" aria-label="Type"><option value="">Tous les types</option>' +
      types.map((t) => '<option value="' + t + '"' + (F.type === t ? " selected" : "") + ">" + esc(typeLabel(t)) + "</option>").join("") + "</select>" +
      '<select class="field" id="f-faction" aria-label="Collection"><option value="">Toutes les collections</option>' +
      factions.map((f) => '<option value="' + esc(f) + '"' + (F.faction === f ? " selected" : "") + ">" + esc(f) + "</option>").join("") + "</select></div>" +
      '<label class="check"><input type="checkbox" id="f-legends"' + (F.legends ? " checked" : "") + "> Inclure les unités Legends</label></div>" +
      '<div id="results"></div>');
    if (!loadError) {
      const bind = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
      bind("f-q", "input", (e) => { F.q = e.target.value; F.limit = 40; results(); });
      bind("f-type", "change", (e) => { F.type = e.target.value; F.limit = 40; results(); });
      bind("f-faction", "change", (e) => { F.faction = e.target.value; F.limit = 40; results(); });
      bind("f-legends", "change", (e) => { F.legends = e.target.checked; F.limit = 40; results(); });
      bind("f-target", "change", (e) => { target = e.target.value; results(); });
      results();
    }
  }

  function filtered() {
    const q = norm(F.q.trim());
    return units.filter((u) =>
      (F.legends || !u.legends) &&
      (!F.type || u.type === F.type) &&
      (!F.faction || u.faction === F.faction) &&
      (!q || norm(u.name).includes(q)));
  }

  function results() {
    const list = filtered();
    const squad = getSquad(target);
    const shown = list.slice(0, F.limit);
    const cards = shown.map((u) => {
      const n = qtyIn(squad, u.id);
      return '<div class="card"><div class="ico">' + icon(u.type) + "</div>" +
        '<div class="info"><div class="title">' + esc(u.name) + "</div>" +
        '<div class="meta">' + esc(typeLabel(u.type)) + " · " + esc(u.faction) + "</div>" +
        '<div class="meta">' + esc(ptsText(u)) + " · " + tierLabel(u, 0) + (u.pts.length > 1 ? " / " + tierLabel(u, u.pts.length - 1) : "") + "</div></div>" +
        '<div class="stepper">' +
        '<button data-act="rm" data-id="' + u.id + '" aria-label="Retirer"' + (n ? "" : " disabled") + ">−</button>" +
        (n ? '<span class="qty">' + n + "</span>" : "") +
        '<button class="add" data-act="ad" data-id="' + u.id + '" aria-label="Ajouter">+</button></div></div>';
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
    const el = e.target.closest('[data-act="tier"]');
    if (!el) return;
    const r = route(), cur = getSquad(r.parts[1]);
    const it = cur && cur.items.find((i) => i.uid === el.dataset.uid);
    if (it) { it.tier = +el.value; save(); viewSquad(cur); }
  });

  window.addEventListener("hashchange", render);

  /* ---------- Démarrage ---------- */
  loadUnits().then(render);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();

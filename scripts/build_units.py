#!/usr/bin/env python3
"""Lit les catalogues BSData (Warhammer 40,000 11e, format JSON) et produit data/units.json.

Usage : python scripts/build_units.py <dossier_bsdata> [sortie.json]
"""
import json, re, sys, glob, os, datetime

PTS_NAME = "pts"
GAME = "Warhammer 40,000 11e"

# Ordre de priorité pour choisir le "type" affiché (le premier trouvé gagne)
TYPE_PRIORITY = [
    ("Epic Hero", "epic"), ("Character", "character"), ("Monster", "monster"),
    ("Vehicle", "vehicle"), ("Walker", "vehicle"), ("Mounted", "mounted"),
    ("Beast", "beast"), ("Swarm", "swarm"), ("Fortification", "fortification"),
    ("Infantry", "infantry"), ("Drone", "drone"),
]
SKIP_CATS = {"Reference", "Allied Units"}
# Conditions liées à autre chose que l'effectif de l'unité (taille de bataille, armée…)
OUTSIDE_SCOPES = {"force", "roster", "primary-catalogue", "game", "primary-category"}


def as_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def pts_of(entry):
    for c in entry.get("costs", []):
        if c.get("name") == PTS_NAME:
            return as_int(c.get("value")) or 0, c.get("typeId")
    return 0, None


def constraint(group, kind):
    for c in group.get("constraints", []):
        if c.get("type") == kind and c.get("field") == "selections" and c.get("scope") == "parent":
            return as_int(c.get("value"))
    return None


def size_range(unit):
    """Taille min/max de l'unité d'après les contraintes des groupes/modèles enfants."""
    mn = mx = 0
    found = False
    children = list(unit.get("selectionEntryGroups", [])) + \
        [e for e in unit.get("selectionEntries", []) if e.get("type") == "model"]
    for ch in children:
        cmin, cmax = constraint(ch, "min"), constraint(ch, "max")
        if cmin is None and cmax is None:
            continue
        if cmax is not None and cmax < 0:
            cmax = None
        found = True
        mn += max(cmin or 0, 0)
        mx += cmax if cmax is not None else max(cmin or 0, 0)
    if not found:
        return 1, 1
    mn = max(mn, 1)
    return mn, max(mx, mn)


def model_entries(unit):
    """Figurines (type model) directement sous l'unité ou dans ses groupes."""
    out = [e for e in unit.get("selectionEntries", []) if e.get("type") == "model"]
    for g in unit.get("selectionEntryGroups", []):
        out += [e for e in g.get("selectionEntries", []) if e.get("type") == "model"]
    return out


def per_model_cost(unit):
    """Coût par figurine quand l'unité n'a pas de coût propre (ex. Carnifex, Starfangs)."""
    costs = {pts_of(m)[0] for m in model_entries(unit)}
    costs.discard(0)
    return costs.pop() if len(costs) == 1 else 0


def own_modifiers(entry):
    """Modificateurs de l'entrée elle-même (y compris groupes de modificateurs), pas de ses enfants."""
    out = list(entry.get("modifiers", []))
    stack = list(entry.get("modifierGroups", []))
    while stack:
        g = stack.pop()
        out.extend(g.get("modifiers", []))
        stack.extend(g.get("modifierGroups", []))
    return out


def all_conditions(mod):
    conds = list(mod.get("conditions", []))
    stack = list(mod.get("conditionGroups", []))
    while stack:
        g = stack.pop()
        conds.extend(g.get("conditions", []))
        stack.extend(g.get("conditionGroups", []))
    return conds


def tiers_of(unit, tid):
    """Paliers de points : [(à partir de N figurines, points)]."""
    tiers = {}
    for m in own_modifiers(unit):
        if m.get("field") != tid or m.get("type") != "set":
            continue
        conds = all_conditions(m)
        if not conds:
            continue
        thr, ok = None, True
        for c in conds:
            t = c.get("type")
            if c.get("field") != "selections" or c.get("scope") in OUTSIDE_SCOPES:
                ok = False
                break
            if t == "atLeast":
                thr = as_int(c.get("value"))
            elif t == "greaterThan":
                v = as_int(c.get("value"))
                thr = v + 1 if v is not None else None
            else:
                ok = False
                break
        val = as_int(m.get("value"))
        if ok and thr and val is not None:
            tiers[thr] = val
    return sorted(tiers.items())


def cat_names(entry):
    return {c.get("name") for c in entry.get("categoryLinks", [])}


def faction_of(entry, cat_name):
    for n in cat_names(entry):
        if n and n.startswith("Faction:"):
            return n.split(":", 1)[1].strip()
    return re.sub(r"^.*? - ", "", cat_name).replace(" Library", "").strip()


def type_of(entry):
    cats = cat_names(entry)
    if cats & SKIP_CATS:
        return None, False
    battleline = "Battleline" in cats
    for label, key in TYPE_PRIORITY:
        if label in cats:
            return key, battleline
    return "other", battleline


def unit_stats(entry, pmap):
    """Premier profil « Unit » trouvé dans l'entrée ou ses modèles enfants (en suivant les liens vers les profils partagés)."""
    def from_profile(p):
        return {c.get("name"): (c.get("$text") or "").strip() for c in p.get("characteristics", [])}
    stack = [entry]
    while stack:
        e = stack.pop(0)
        for p in e.get("profiles", []):
            if p.get("typeName") == "Unit":
                return from_profile(p)
        for l in e.get("infoLinks", []):
            if l.get("type") == "profile":
                p = pmap.get(l.get("targetId"))
                if p and p.get("typeName") == "Unit":
                    return from_profile(p)
        stack.extend(e.get("selectionEntries", []))
        stack.extend(e.get("selectionEntryGroups", []))
    return {}


WEAPON_TYPES = {"Ranged Weapons": ("R", "BS"), "Melee Weapons": ("M", "WS")}
# Options sans rapport avec l'équipement de base (croisade, améliorations, reliques…)
SKIP_OPTIONS = re.compile(r"crusade|battle (trait|scar|honour)|experience|enhancement|relic|weapon modification|"
                          r"warlord|legendary|advancement|commendation|blackstone|deeds|boon|honours", re.I)


def unit_weapons(entry, pmap, emap, gmap):
    """Profils d'armes (tir puis mêlée) que l'unité peut porter, y compris les options d'équipement."""
    found, seen, stack = {}, set(), [entry]
    def keep(p):
        if p and p.get("typeName") in WEAPON_TYPES:
            found.setdefault(p.get("name", "").strip(), p)
    while stack:
        e = stack.pop(0)
        for p in e.get("profiles", []):
            keep(p)
        for l in e.get("infoLinks", []):
            if l.get("type") == "profile":
                keep(pmap.get(l.get("targetId")))
        kids = list(e.get("selectionEntries", [])) + list(e.get("selectionEntryGroups", []))
        for l in e.get("entryLinks", []):
            if SKIP_OPTIONS.search(l.get("name", "")):
                continue
            t = (emap if l.get("type") == "selectionEntry" else gmap).get(l.get("targetId"))
            if t and t.get("id") not in seen:
                seen.add(t.get("id"))
                kids.append(t)
            kids.append({"profiles": l.get("profiles", []), "infoLinks": l.get("infoLinks", [])})
        stack.extend(k for k in kids if k.get("type") != "unit" and not SKIP_OPTIONS.search(k.get("name", "")))
    rows = []
    for name, p in found.items():
        kind, skill = WEAPON_TYPES[p["typeName"]]
        ch = {c.get("name"): (c.get("$text") or "").strip() for c in p.get("characteristics", [])}
        kw = ch.get("Keywords", "")
        rows.append([name, kind, ch.get("Range", ""), ch.get("A", ""), ch.get(skill, ""),
                     ch.get("S", ""), ch.get("AP", ""), ch.get("D", ""), "" if kw == "-" else kw])
    rows.sort(key=lambda r: r[1] != "R")  # tir d'abord, ordre BSData conservé sinon
    return rows


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "data/units.json"
    units, seen = [], set()
    catalogues, pmap, emap, gmap = [], {}, {}, {}
    weapons, weapon_idx = [], {}
    for path in sorted(glob.glob(os.path.join(src, "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        cat = data.get("catalogue") or data.get("gameSystem")
        if not cat:
            continue
        for p in cat.get("sharedProfiles", []):
            pmap[p.get("id")] = p
        for e in cat.get("sharedSelectionEntries", []):
            emap[e.get("id")] = e
        for g in cat.get("sharedSelectionEntryGroups", []):
            gmap[g.get("id")] = g
        if data.get("catalogue"):
            catalogues.append(cat)
    for cat in catalogues:
        cat_name = cat.get("name", "")
        entries = list(cat.get("sharedSelectionEntries", [])) + list(cat.get("selectionEntries", []))
        for e in entries:
            if e.get("type") not in ("unit", "model"):
                continue
            if e.get("type") == "model" and \
                    not any(p.get("typeName") == "Unit" for p in e.get("profiles", [])):
                continue
            base, tid = pts_of(e)
            per_model = 0
            if base <= 0 and e.get("type") == "unit":
                per_model = per_model_cost(e)
            if base <= 0 and not per_model:
                continue
            utype, battleline = type_of(e)
            if utype is None:
                continue
            faction = faction_of(e, cat_name).split(" - ")[0].strip(" -")
            name = e.get("name", "").strip()
            legends = "[Legends]" in name
            name = re.sub(r"\s*\[(Legends|Crucible)\]", "", name).strip()
            key = (faction, name, legends)
            if key in seen:
                continue
            seen.add(key)
            mn, mx = size_range(e)
            tiers = tiers_of(e, tid)
            if per_model:
                # Points = nombre de figurines x coût par figurine
                sizes = list(range(mn, mx + 1)) if mx - mn <= 11 else [mn, mx]
                ladder = [{"from": n, "pts": n * per_model} for n in sizes]
            elif tiers:
                # Règle : l'effectif maximal est le double du minimum, et le
                # premier palier de points s'applique à partir de (minimum + 1).
                mn = tiers[0][0] - 1
                mx = max(2 * mn, tiers[-1][0])
            if not per_model:
                ladder = [{"from": mn, "pts": base}] + [{"from": t, "pts": p} for t, p in tiers if t > mn]
            if mx < ladder[-1]["from"]:
                mx = ladder[-1]["from"]
            # Armes : table commune (une arme partagée par plusieurs unités n'est écrite qu'une fois)
            w = []
            for row in unit_weapons(e, pmap, emap, gmap):
                k = tuple(row)
                if k not in weapon_idx:
                    weapon_idx[k] = len(weapons)
                    weapons.append(row)
                w.append(weapon_idx[k])
            units.append({
                "id": e.get("id"), "name": name, "faction": faction, "type": utype,
                "battleline": battleline, "legends": legends, "min": mn, "max": mx,
                "pts": ladder, "stats": unit_stats(e, pmap), "w": w,
            })
    if len(units) < 500:
        # Garde-fou : ne jamais écraser les données avec un résultat vide ou anormal
        sys.exit("Erreur : seulement %d unités trouvées dans %s, données non modifiées." % (len(units), src))
    units.sort(key=lambda u: (u["faction"], u["name"]))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        # weapons : [nom, "R" tir / "M" mêlée, portée, A, CT ou CC, F, PA, D, mots-clés]
        json.dump({"game": GAME, "count": len(units),
                   "generated": datetime.date.today().isoformat(), "units": units, "weapons": weapons},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("%d unités écrites dans %s" % (len(units), out))


if __name__ == "__main__":
    main()

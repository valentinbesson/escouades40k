#!/usr/bin/env python3
"""Lit les catalogues BSData (Warhammer 40,000 10e) et produit data/units.json.

Usage : python scripts/build_units.py <dossier_bsdata> [sortie.json]
"""
import json, re, sys, glob, os, datetime
import xml.etree.ElementTree as ET

NS = {"b": "http://www.battlescribe.net/schema/catalogueSchema"}
PTS_NAME = "pts"

# Ordre de priorité pour choisir le "type" affiché (le premier trouvé gagne)
TYPE_PRIORITY = [
    ("Epic Hero", "epic"), ("Character", "character"), ("Monster", "monster"),
    ("Vehicle", "vehicle"), ("Walker", "vehicle"), ("Mounted", "mounted"),
    ("Beast", "beast"), ("Swarm", "swarm"), ("Fortification", "fortification"),
    ("Infantry", "infantry"), ("Drone", "drone"),
]
SKIP_CATS = {"Reference", "Allied Units"}


def q(tag):
    return "{%s}%s" % (NS["b"], tag)


def pts_of(entry):
    for c in entry.findall("b:costs/b:cost", NS):
        if c.get("name") == PTS_NAME:
            try:
                return int(float(c.get("value")))
            except (TypeError, ValueError):
                return 0
    return 0


def pts_type_id(entry):
    for c in entry.findall("b:costs/b:cost", NS):
        if c.get("name") == PTS_NAME:
            return c.get("typeId")
    return None


def size_range(unit):
    """Taille min/max de l'unité d'après les contraintes des groupes/modèles enfants."""
    mn = mx = 0
    found = False
    children = list(unit.findall("b:selectionEntryGroups/b:selectionEntryGroup", NS)) + \
        list(unit.findall("b:selectionEntries/b:selectionEntry", NS))
    for child in children:
        if child.tag == q("selectionEntry") and child.get("type") != "model":
            continue
        cmin = cmax = None
        for c in child.findall("b:constraints/b:constraint", NS):
            if c.get("field") != "selections" or c.get("scope") != "parent":
                continue
            if c.get("type") == "min":
                cmin = int(float(c.get("value")))
            elif c.get("type") == "max":
                cmax = int(float(c.get("value")))
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


def tiers_of(unit, tid):
    """Paliers de points : [(à partir de N figurines, points)]."""
    tiers = {}
    mods = unit.findall("b:modifiers/b:modifier", NS) + unit.findall(".//b:modifierGroups//b:modifier", NS)
    for m in mods:
        if m.get("field") != tid or m.get("type") != "set":
            continue
        conds = m.findall(".//b:condition", NS)
        if not conds:
            continue
        thr = None
        ok = True
        for c in conds:
            t = c.get("type")
            if c.get("field") != "selections":
                ok = False
                break
            if t == "atLeast":
                thr = int(float(c.get("value")))
            elif t == "greaterThan":
                thr = int(float(c.get("value"))) + 1
            else:
                ok = False
                break
        if ok and thr:
            try:
                tiers[thr] = int(float(m.get("value")))
            except ValueError:
                pass
    return sorted(tiers.items())


def faction_of(entry, cat_name):
    for cl in entry.findall("b:categoryLinks/b:categoryLink", NS):
        n = cl.get("name") or ""
        if n.startswith("Faction:"):
            return n.split(":", 1)[1].strip()
    return re.sub(r"^.*? - ", "", cat_name).replace(" Library", "").strip()


def type_of(entry):
    cats = {cl.get("name") for cl in entry.findall("b:categoryLinks/b:categoryLink", NS)}
    if cats & SKIP_CATS:
        return None, False
    battleline = "Battleline" in cats
    for label, key in TYPE_PRIORITY:
        if label in cats:
            return key, battleline
    return "other", battleline


def main():
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "data/units.json"
    units, seen = [], set()
    for path in sorted(glob.glob(os.path.join(src, "*.cat"))):
        root = ET.parse(path).getroot()
        cat_name = root.get("name", "")
        entries = root.findall("b:sharedSelectionEntries/b:selectionEntry", NS) + \
            root.findall("b:selectionEntries/b:selectionEntry", NS)
        for e in entries:
            if e.get("type") not in ("unit", "model"):
                continue
            # Une "unit" multi-figurines porte son profil sur ses modèles enfants ;
            # une unité d'un seul modèle (type="model") porte son propre profil.
            if e.get("type") == "model" and \
                    not any(p.get("typeName") == "Unit" for p in e.findall("b:profiles/b:profile", NS)):
                continue
            base = pts_of(e)
            if base <= 0:
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
            tiers = tiers_of(e, pts_type_id(e))
            if tiers:
                # Règle 10e : l'effectif maximal est le double du minimum, et le
                # premier palier de points s'applique à partir de (minimum + 1).
                mn = tiers[0][0] - 1
                mx = max(2 * mn, tiers[-1][0])
            ladder = [{"from": mn, "pts": base}] + [{"from": t, "pts": p} for t, p in tiers if t > mn]
            if mx < ladder[-1]["from"]:
                mx = ladder[-1]["from"]
            stats = {}
            for p in e.iter(q("profile")):
                if p.get("typeName") == "Unit":
                    for c in p.findall("b:characteristics/b:characteristic", NS):
                        stats[c.get("name")] = (c.text or "").strip()
                    break
            units.append({
                "id": e.get("id"), "name": name, "faction": faction, "type": utype,
                "battleline": battleline, "legends": legends, "min": mn, "max": mx, "pts": ladder, "stats": stats,
            })
    units.sort(key=lambda u: (u["faction"], u["name"]))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"game": "Warhammer 40,000 10e", "count": len(units),
                   "generated": datetime.date.today().isoformat(), "units": units},
                  f, ensure_ascii=False, separators=(",", ":"))
    print("%d unités écrites dans %s" % (len(units), out))


if __name__ == "__main__":
    main()

# Escouades 40K

Calculateur de points d'escouade pour **Warhammer 40,000 (11e édition)**, installable sur iPhone/iPad
et utilisable hors ligne. Les données viennent du projet communautaire
[BSData](https://github.com/BSData/wh40k-11e) et sont mises à jour chaque semaine par GitHub Actions.

## Mise en ligne (GitHub Pages)

1. Crée un dépôt sur GitHub (par exemple `escouades40k`), puis envoie-y tous ces fichiers
   (y compris le dossier caché `.github`).
2. Dans le dépôt : **Settings → Pages → Build and deployment** → *Source* : **Deploy from a branch**,
   branche **main**, dossier **/ (root)** → **Save**.
3. Après une minute environ, l'app est disponible sur `https://TON-PSEUDO.github.io/escouades40k/`.
4. Dans **Settings → Actions → General → Workflow permissions**, choisis **Read and write permissions**
   (nécessaire pour que la mise à jour automatique puisse enregistrer les nouvelles données).
5. Pour tester la mise à jour tout de suite : onglet **Actions → Mise à jour des données (BSData) → Run workflow**.

## Installation sur iPhone / iPad

1. Ouvre l'adresse de l'app dans **Safari** (pas dans Chrome).
2. Touche **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lance l'app depuis l'icône. La première ouverture télécharge les données ; ensuite tout marche sans réseau.

À savoir : les escouades sont stockées dans l'app installée. Celles créées dans Safari **avant**
l'installation ne sont pas reprises : il vaut mieux installer l'app avant de commencer.

## Utilisation

- **Accueil** : liste des escouades, « Nouvelle escouade », « Chercher une figurine ».
- **Recherche** : filtres par nom, type et collection (faction). Les boutons **+ / −** ajoutent ou retirent
  la figurine dans l'escouade choisie en haut de la page.
- **Escouade** : renommer (toucher le titre), changer la quantité, choisir la taille de l'unité
  (par exemple 10 ou 20 figurines, avec les points correspondants) ou retirer une ligne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | L'application |
| `sw.js` | Service worker : stockage en cache pour le hors ligne |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `data/units.json` | Unités, types, tailles et points (généré) |
| `scripts/build_units.py` | Convertit les fichiers BSData en `units.json` |
| `.github/workflows/update-data.yml` | Mise à jour hebdomadaire automatique |

## Limites

- Les points sont ceux de BSData : ils peuvent avoir quelques jours de retard sur les publications officielles.
- Les équipements et améliorations (armes, reliques, etc.) ne sont pas pris en compte : seuls les points
  de base de chaque unité, selon sa taille, sont calculés.
- Pas de photos : une icône représente chaque type d'unité.
- Projet de fan, sans lien avec Games Workshop. Données : BSData, licence de leur dépôt.

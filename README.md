# Escouades 40K

Calculateur de points d'escouade pour **Warhammer 40,000 (11e édition)**, 

Installable possible sur mobile et desktop
pour une utilisable hors ligne.

Les escouades restent sur le cache du navigateur de chacun,
il n'y a pas de compte ni de partage de données.

Les données viennent du projet communautaire :
[BSData](https://github.com/BSData/wh40k-11e) et sont mises à jour chaque semaine par GitHub Actions.

## Partager l'app :
https://valentinbesson.github.io/escouades40k/

## Installation sur iPhone / iPad

1. Ouvre l'adresse de l'app dans **Safari** (pas dans Chrome).
2. Touche **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lance l'app depuis l'icône. La première ouverture télécharge les données ; ensuite tout marche sans réseau.

À savoir : les escouades sont stockées dans l'app installée. Celles créées dans Safari **avant**
l'installation ne sont pas reprises : il vaut mieux installer l'app avant de commencer.

## Utilisation

- **Accueil** : « Chercher une figurine », liste des escouades, puis « Nouvelle escouade » en dessous.
  Possibilité de changer l'ordre des Escouades via glisser déposer.
  
- **Recherche de figurines** : filtres par nom, type et collection (faction). Les boutons **+ / −** ajoutent ou retirent
  la figurine dans l'escouade choisie en haut de la page.

- **Escouade** : renommer (toucher le titre), changer la quantité, choisir la taille de l'unité
  (par exemple 10 ou 20 figurines, avec les points correspondants) ou retirer une ligne.
- **Caractéristiques** : l'interrupteur « Afficher les caractéristiques » montre le profil de l'unité et un
  panneau **Armes** dépliable (tir et mêlée : portée, A, CT/CC, F, PA, D et mots-clés). Toutes les armes
  que l'unité peut prendre en option y figurent, pas seulement l'équipement de base.
  
- **Export / Import** : Il est possible d'exporter et d'importer les caractéristiques d'une Escouade depuis sa page.
  Importer une sauvegarde d'escouade depuis une page remplace l'entièreté des caractéristiques de l'Escouade. 
  (Y compris son nom)
  
## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css`, `app.js` | L'application |
| `sw.js` | Service worker : stockage en cache pour le hors ligne |
| `manifest.webmanifest`, `icons/` | Installation sur l'écran d'accueil |
| `data/units.json` | Unités, types, tailles, points, caractéristiques et armes (généré) |
| `data/noms-fr.json` | Noms français officiels (modifiable à la main, jamais écrasé) |
| `data/glossaire-fr.json` | Mots français courants compris par la recherche (modifiable) |
| `scripts/build_units.py` | Convertit les fichiers BSData en `units.json` |
| `.github/workflows/update-data.yml` | Mise à jour hebdomadaire automatique |

## Noms français

La recherche comprend les noms anglais et certains français. 

[ ## pour l'admin :
Pour ajouter un nom, ajoute une ligne dans
`data/noms-fr.json` : `"Nom anglais": "Nom français",`. Si le même nom anglais existe dans plusieurs
collections avec des traductions différentes, préfixe-le : `"Astra Militarum::Nom anglais": "Nom français",`.
Les unités Legends n'ont pas de nom français. ]

## Partager l'app

Envoie simplement l'adresse du site (`https://valentinbesson.github.io/escouades40k/`) : chaque personne

## Limites

- Les points sont ceux de BSData : ils peuvent avoir quelques jours de retard sur les publications officielles.
- Les équipements et améliorations (armes, reliques, etc.) ne sont pas pris en compte : seuls les points
  de base de chaque unité, selon sa taille, sont calculés.
- Pas de photos : une icône représente chaque type d'unité.
- Projet de fan, sans lien avec Games Workshop. Données : BSData, licence de leur dépôt.

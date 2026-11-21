# MBOKA ELENGI

*« Le beau pays » en lingala.* Jeu de simulation de vie en monde ouvert, à **Kinshasa**.

**Version 0.1.0 (alpha)**. Zone pilote : **Limete / Échangeur**, reproduite à partir de la **vraie carte** (OpenStreetMap).

| | |
|---|---|
| Moteur | Godot 4.7.2 (rendu « Compatibility », OpenGL), choisi pour fonctionner sur PC modestes et smartphones |
| Plateformes | Windows (installateur `.exe`), Android (`.apk`). iOS : plus tard, un Mac est nécessaire |
| Langues du jeu | Français et lingala |

## Contenu de la version 0.1

- **9 441 bâtiments réels** et **602 routes réelles** de Limete, générés automatiquement depuis OpenStreetMap
- **Tour de l'Échangeur** modélisée d'après des vues aériennes : 4 colonnes, nacelles dorées, mât et flèche jaune, esplanade en étoile
- **Monument Patrice Lumumba**, FIKIN, Université Libre de Kinshasa, Notre-Dame d'Afrique et des panneaux sur les lieux réels
- **Circulation kinoise** : taxis jaunes, taxis-bus « Esprit de mort », bus, motos-taxis « wewa », piétons
- **5 missions** avec dialogues en français et en lingala, un chronomètre et des récompenses en francs congolais (FC)
- **Mini-carte ronde** et **grande carte** (touche `M`) : icônes par catégorie, légende, point de destination, **vue 3D**
- **Commandes** : clavier (Z/Q/S/D), souris, manette, écran tactile (joystick virtuel)
- Sauvegarde automatique (argent, missions)

## Installer le jeu

### Android
1. Copiez `MbokaElengi.apk` sur le téléphone, ou téléchargez-le directement.
2. Ouvrez le fichier. Android demande d'**autoriser l'installation d'applications inconnues** : acceptez pour cette fois.
3. Lancez **MBOKA ELENGI**.

### Windows
1. Lancez `MbokaElengi-Setup-0.1.0.exe`.
2. Windows peut afficher « Windows a protégé votre ordinateur », car le programme n'a pas encore de signature payante. Cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**.
3. Suivez l'assistant. Un raccourci est créé sur le Bureau et dans le menu Démarrer. Le jeu se désinstalle depuis *Paramètres > Applications*.

## Commandes

| Action | PC | Manette | Mobile |
|---|---|---|---|
| Marcher | Z Q S D / flèches | Stick gauche | Joystick à gauche |
| Caméra | Clic, puis souris (Échap libère la souris) | Stick droit | Glisser à droite |
| Courir | Maj | Clic stick gauche | Bouton COURIR |
| Sauter | Espace | A | Bouton SAUT |
| Accepter une mission | E | X | Bouton « Accepter » |
| Grande carte | M | Select | Bouton CARTE |

## Structure du dépôt

```
game/                 Projet Godot (ouvrir game/project.godot)
  data/               Données de ville générées depuis OpenStreetMap
  scripts/city/       Génération de la ville 3D (bâtiments, routes, arbres)
  scripts/landmarks/  Monuments (Tour de l'Échangeur, Lumumba)
  scripts/missions/   Missions et dialogues
  scripts/player/     Joueur, personnage, caméra
  scripts/ui/         Interface, mini-carte, grande carte, commandes tactiles
  scripts/world/      Circulation et piétons
  shaders/            Matériaux (façades, tôle, routes, sol)
tools/osm/            Scripts Python : télécharger et convertir la carte
installer/windows/    Script de l'installateur Windows (NSIS)
docs/                 Documentation (feuille de route, architecture, sécurité)
```

## Développer

1. Installez **Godot 4.7.2** (gratuit, sur godotengine.org). Il fonctionne sur un PC portable avec 8 Go de mémoire.
2. Ouvrez `game/project.godot`, puis appuyez sur **F5** pour lancer le jeu.
3. Pour mettre à jour la carte :
   ```
   python tools/osm/fetch_osm.py 15.336 -4.385 15.356 -4.366 echangeur.osm
   python tools/osm/build_city_data.py echangeur.osm game/data/limete_echangeur.json
   ```

## Crédits et licences

- Données cartographiques : **© les contributeurs d'OpenStreetMap**, licence ODbL 1.0 (https://www.openstreetmap.org/copyright)
- Moteur : Godot Engine (licence MIT)
- Ce jeu est une création originale. Il n'utilise aucune ressource d'un autre jeu.

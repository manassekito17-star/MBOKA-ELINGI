# MBOKA ELENGI

*« Le beau pays » en lingala.* Jeu de simulation de vie en monde ouvert, à **Kinshasa**.

**Version 0.2.0 (alpha)**. Zone : **Limete, de l'Échangeur à la 7e rue** (environ 3 × 4,5 km), reproduite à partir de la **vraie carte** (OpenStreetMap, complétée par les bâtiments détectés par satellite).

| | |
|---|---|
| Moteur | Godot 4.7.2 (rendu « Compatibility », OpenGL), choisi pour fonctionner sur PC modestes et smartphones |
| Plateformes | Windows (installateur `.exe`), Android (`.apk`). iOS : plus tard, un Mac est nécessaire |
| Langues du jeu | Français et lingala |

## Contenu de la version 0.2

- **44 647 bâtiments** : 22 031 relevés dans OpenStreetMap, 15 810 détectés par satellite (Google Open Buildings via Overture Maps) et 6 806 maisons de parcelle générées pour combler les îlots vides (marquées comme générées dans les données)
- **Toits en tôle à deux pentes**, murs de clôture des parcelles, lampadaires sur les boulevards, uniquement les **vrais arbres** cartographiés
- **Tour de l'Échangeur** avec **ascenseur jusqu'à la plateforme panoramique (158 m)**
- **2 passerelles piétonnes** réelles sur le boulevard Lumumba, **praticables** (escaliers, tablier, auvent)
- **Personnages humains 3D réalistes** et animés (marche, course, sprint, saut, discussion), avec teints de peau foncés, vêtements variés et pagnes en wax. Personnage principal : tresses plaquées, boucle d'oreille, veste à col montant
- **Minibus Mercedes 207 « Esprit de mort »** (porte ouverte, chargeur), taxis jaunes, bus, motos-taxis
- 5 missions en français et en lingala, mini-carte ronde, grande carte 2D (légende, destination) et vue 3D
- Commandes clavier, souris, manette et tactile (joystick, SAUT, COURIR, ACTION)

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
| Accepter une mission / ascenseur | E | X | Bouton ACTION |
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
   python tools/osm/fetch_osm.py 15.328 -4.385 15.356 -4.345 limete.osm 3
   python tools/osm/fetch_overture.py 15.328 -4.385 15.356 -4.345 overture.geojson
   python tools/osm/build_city_data.py limete.osm game/data/limete_echangeur.json --extra overture.geojson --fill
   ```

## Crédits et licences

- Données cartographiques : **© les contributeurs d'OpenStreetMap**, licence ODbL 1.0 (https://www.openstreetmap.org/copyright)
- Bâtiments complémentaires : **© Overture Maps Foundation** (ODbL) et **Google Open Buildings** (CC BY 4.0)
- Personnages et animations : **Quaternius** (« Universal Base Characters », « Universal Animation Library »), licence CC0
- Moteur : Godot Engine (licence MIT)
- Ce jeu est une création originale. Il n'utilise aucune ressource d'un autre jeu.

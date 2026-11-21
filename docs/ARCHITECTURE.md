# Architecture technique (v0.1)

## Choix du moteur
Unreal Engine 5 a été écarté pour l'instant : le PC de développement (i5-8265U, 8 Go de mémoire, carte graphique intégrée) ne peut pas le faire tourner, et Unreal ne produit pas d'APK sans une machine puissante. **Godot 4.7** avec le rendu « Compatibility » (OpenGL ES 3 / OpenGL 3.3) fonctionne sur ce PC et sur la majorité des smartphones Android.

## Chaîne de la carte
`OpenStreetMap (API)` → `tools/osm/fetch_osm.py` → fichier `.osm` → `tools/osm/build_city_data.py` → `game/data/*.json` → `CityBuilder` (au lancement du jeu)

- Repère : origine au centre de la Tour de l'Échangeur ; `x` vers l'est et `y` vers le nord, en mètres. Dans Godot, `z = -y`.
- Hauteur des bâtiments : prise dans OSM (`height`, `building:levels`). À défaut, elle est estimée de façon stable (même bâtiment, même hauteur) : 80 % de plain-pied, ce qui est typique des quartiers de Kinshasa.
- Performances : bâtiments regroupés par tuiles de 200 m, avec un maillage et une collision par tuile ; affichage limité à 750 m ; arbres instanciés (MultiMesh) ; matériaux procéduraux sans textures.

## Modules (scripts)
| Script | Rôle |
|---|---|
| `core/game_state.gd` | Argent, progression, sauvegarde, commandes (autoload) |
| `city/city_builder.gd` | Sol, routes, bâtiments, arbres, grille d'occupation |
| `landmarks/*.gd` | Monuments modélisés à la main |
| `player/*.gd` | Joueur, caméra, personnage animé |
| `world/traffic.gd` | Véhicules et piétons sur les vraies routes |
| `missions/*.gd` | Données et logique des missions |
| `ui/*.gd` | Interface, mini-carte, grande carte, commandes tactiles |

## Tests
- Vérification automatique : le projet est lancé sous Linux avec un écran virtuel et des captures d'écran sont prises (option `-- --capture=fichier.png`).
- Restent à tester sur de vrais appareils : la version Windows (pas encore lancée sur Windows) et le téléphone Android (fluidité, commandes tactiles).

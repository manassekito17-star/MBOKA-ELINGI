# Interface de jeu — Kinshasa 3D

Cette interface est une création originale. Elle n'utilise aucun logo, aucune image, aucune police, aucune carte ni aucun autre élément de GTA V.

- **Identité visuelle** :
  - police Barlow Semi Condensed (Google Fonts, licence OFL) ;
  - couleurs jaune taxi kinois (`#f2b233`) et bleu du fleuve ;
  - panneaux sombres translucides, animations courtes.
- **Règle suivie** : chaque indicateur affiche une **vraie valeur du jeu**, et chaque bouton déclenche une **vraie action**. Ce qui n'existe pas dans le moteur (gilet pare-balles, ouverture des portes) n'apparaît pas à l'écran.

Code : `web/kinshasa/jeu/js/` (`hud.js`, `minicarte.js`, `menu.js`, `controles.js`, `tactile.js`, `gps.js`, `missions.js`) et `web/kinshasa/jeu/ihm.css`.

## Captures

| | |
|---|---|
| ![HUD en véhicule](images/interface/bureau_hud_vehicule.jpg) | ![HUD à pied, GPS et mission](images/interface/bureau_hud_pied.jpg) |
| HUD en véhicule : mini-carte (routes réelles, itinéraire GPS violet), tableau de bord, bandeau GPS, mission | HUD à pied : santé, endurance, argent, heure, chronomètre de mission |
| ![Menu Carte](images/interface/bureau_menu_carte.jpg) | ![Menu Véhicules](images/interface/bureau_menu_vehicules.jpg) |
| Menu pause, onglet Carte : lieux réels, filtres, itinéraire | Onglet Véhicules : caractéristiques, GPS, dépanneuse, peinture |
| ![Paramètres, commandes](images/interface/bureau_menu_parametres.jpg) | ![Téléphone horizontal](images/interface/mobile_paysage_vehicule.jpg) |
| Paramètres : remappage des touches | Téléphone à l'horizontale, en véhicule (accélérateur, frein, klaxon…) |

Captures faites dans Chromium avec rendu logiciel (sans carte graphique), d'où une image moins nette que sur un vrai appareil.

## 1. HUD (affichage en jeu)

| Élément | Position | Source de la valeur |
|---|---|---|
| Mini-carte | bas à gauche | Voir section 2. |
| Santé | sous la mini-carte | `joueur.sante` (0–100). Voir le détail sous ce tableau. |
| Endurance | sous la mini-carte | `joueur.endurance`. Voir le détail sous ce tableau. |
| Rue et commune | sous la mini-carte | Nom **réel** de la rue la plus proche (OSM et Overture), puis l'état de la circulation (simulée). |
| Argent | haut à droite | Argent liquide du joueur. La banque est séparée et se consulte dans le menu. |
| Heure et météo | haut à droite | Horloge du jeu (le temps du jeu passe 30 fois plus vite que le temps réel) et météo simulée. |
| Chronomètre de mission | haut à droite | Temps restant et récompense de la mission en cours. |
| Notifications | haut à gauche | 4 au maximum. Elles disparaissent seules. |
| Bandeau GPS | haut, au centre | Prochaine manœuvre réelle (à gauche ou à droite), avec la distance et le nom de la rue. Voir section 2. |
| Objectif | bas, au centre | Étape actuelle de la mission. |
| Actions possibles | à droite | Menu d'interaction contextuel. Voir section 3. |
| Tableau de bord | bas à droite, seulement en véhicule | Voir section 4. |

Détail des barres :

- **Santé** :
  - la jauge baisse en cas de chute de plus de 5 m environ, de choc en voiture ou d'accident ;
  - après 10 s sans blessure, elle remonte de 0,6 point par seconde ;
  - à 0 : évacuation vers l'**hôpital réel le plus proche**, avec des frais (15 000 FC au maximum).
- **Endurance** :
  - elle baisse quand on court (11 points par seconde en sprint, 4 en course) ;
  - elle remonte au repos ;
  - à 0, le personnage est essoufflé et ne peut plus courir jusqu'à 30 %.

**Absent volontairement : le gilet pare-balles.** Le jeu n'a ni combat ni arme, donc une jauge de protection serait un faux indicateur.

## 2. Mini-carte, grande carte et GPS

- **Mini-carte** (`minicarte.js`, canvas 2D, environ 12 images par seconde) :
  - elle tourne avec la caméra ;
  - elle affiche les **vraies routes**, avec leur classe et leur largeur, ainsi que les bâtiments et les parcs des tuiles chargées, et l'eau (fleuve, rivières) tirée de `zones/<zone>/eau.json` ;
  - le zoom s'adapte à la vitesse ; les boutons + et − changent le zoom ; le bouton ⤢ ouvre la grande carte.
- **Lieux réels** affichés (`zones/<zone>/lieux.json`, produit par `tools/jumeau/index_lieux.py` à partir d'OSM et d'Overture) :
  - stations-service, hôpitaux, pharmacies, banques, police, restaurants, commerces, hôtels ;
  - arrêts de bus : en **bleu** quand ils sont réels (OSM), en **gris** quand ils sont simulés.

  Nombre de lieux par zone : Limete 217, Gombe 2 907, Centre 1 505, Kalamu 905.
- **Grande carte** (menu → Carte) :
  - le nord est en haut ;
  - on la déplace en glissant, on zoome avec la molette ou en pinçant ;
  - les catégories se filtrent ;
  - un champ permet de rechercher un lieu ;
  - **un clic choisit une destination GPS**, nommée d'après la rue réelle la plus proche.
- **GPS** (`gps.js`) :
  - l'itinéraire est calculé avec l'algorithme A\* sur le **réseau routier réel** de la zone ;
  - en voiture, les sens uniques OSM sont respectés ; à pied, ils sont ignorés ;
  - le trajet s'affiche en violet sur les deux cartes ;
  - il est recalculé si l'on s'écarte de plus de 35 m ;
  - « arrivé » s'affiche à moins de 18 m de la destination.

## 3. Menu d'interaction contextuel

La touche **E** (manette : **X**) exécute l'action en surbrillance. Les touches **1 à 5** exécutent directement l'action correspondante. Sur la manette, ← et → changent l'action choisie. Seules les actions **réellement possibles à l'endroit où l'on se trouve** sont proposées :

| Lieu ou situation | Actions (prix simulés) |
|---|---|
| Près de son véhicule | Prendre le volant |
| Arrêt de bus, avec un bus à l'arrêt | Monter (500 FC) |
| Moto-taxi ou taxi proche | Course (1 000 ou 1 500 FC) |
| Station-service réelle | Faire le plein. Réparer le véhicule (20 000 FC). |
| Garage réel | Réparer le véhicule |
| Pharmacie réelle | Se soigner : +40 de santé (3 000 FC) |
| Hôpital réel | Soins complets (10 000 FC) |
| Banque réelle | Retirer 20 000 FC. Déposer tout l'argent liquide. |
| Restaurant réel | Manger : +15 de santé et endurance pleine (5 000 FC) |
| Commerce réel | Boisson : endurance pleine (2 000 FC) |
| Arrêt de bus | Horaires (simulés) |
| Passager | Descendre. Demander l'arrêt. |

**Absent volontairement : l'ouverture des portes.** Les bâtiments n'ont pas d'intérieur, donc il n'y a aucune porte à ouvrir.

## 4. Véhicule

Le tableau de bord n'apparaît qu'au volant. Toutes ses valeurs viennent du véhicule conduit :

- vitesse en km/h ;
- **rapport** P, R, N ou D, déduit du mouvement réel (la boîte est automatique, il n'y a pas de rapports manuels) ;
- nom du véhicule ;
- carburant (la consommation est simulée) ;
- état mécanique :
  - il baisse lors des chocs détectés par la physique Rapier ;
  - sous 30 %, la puissance est réduite ; à 0 %, le véhicule est en panne ;
- **compteur kilométrique** : il mesure la distance réellement parcourue et est sauvegardé ;
- voyants : phares, frein à main, réserve de carburant, moteur endommagé, gyrophare.

Commandes communes : klaxon (H), phares (L), caméra (C), frein à main (Espace), sortie (F). Le bouton **R** (manette : **X**) a un rôle différent selon le type de véhicule :

| Véhicule | Action R |
|---|---|
| Police, ambulance | Gyrophare et sirène |
| Taxi, minibus, moto | Chercher un client (mission taxi) |
| Camion, camionnette | Chercher une livraison |

## 5. Menu pause (Échap, ou Start sur la manette)

Le jeu est **réellement figé** pendant la pause : la circulation, la physique, l'horloge et les missions s'arrêtent. Seul l'affichage continue.

| Onglet | Contenu |
|---|---|
| Reprendre | Ferme le menu. |
| Carte | Grande carte, destination GPS, filtres, recherche. |
| Personnage | Statistiques (distances, missions, argent, santé) et éditeur existant : vêtements, coiffure, peau, accessoires, styles. |
| Véhicules | Pour chaque véhicule : caractéristiques, carburant, état, compteur, distance, itinéraire GPS. Voir le détail sous ce tableau. |
| Missions | Mission en cours (GPS, abandon) et missions proposées autour de vous. Voir le détail sous ce tableau. |
| Transports | Lignes de bus (panneau existant). |
| Zones | Changement de commune (panneau existant). |
| Paramètres | Sous-onglets : Commandes (remappage), Manette, Graphismes (qualité, champ de vision, ombres, densité de circulation), Audio (volume, ambiance), Écran tactile (taille et disposition des boutons), Aide et données. |
| Sauvegarde | Sauvegarder, recharger, nouvelle partie. |
| Quitter | Retour à la carte satellite. |

Détails :

- **Véhicules** :
  - **Dépanneuse** : 15 000 FC. Elle n'est proposée que si le véhicule est à plus de 60 m. Le véhicule est livré **après 90 s de jeu**, au bord d'une vraie route, près du joueur. Il n'apparaît jamais instantanément.
  - **Repeindre** : 25 000 FC, à moins de 15 m du véhicule.
- **Missions** :
  - 4 types : course, client taxi, livraison, urgence médicale ;
  - les destinations sont des **lieux réels** de la zone ;
  - les clients, les délais et les récompenses sont des éléments de jeu ;
  - une mission qui demande un véhicule précis ne peut pas démarrer sans lui, et la raison est affichée ;
  - bonus de 25 % si la mission est finie rapidement.

## 6. Commandes

Toutes les touches se **remappent** dans Paramètres → Commandes. Les choix sont enregistrés dans le navigateur.

| Action | Clavier (AZERTY / QWERTY) | Manette (disposition standard) |
|---|---|---|
| Avancer, reculer | Z/W, S (ou flèches) | Stick gauche |
| Gauche, droite | Q/A, D (ou flèches) | Stick gauche |
| Caméra | Souris | Stick droit |
| Sauter / frein à main | Espace | A |
| Courir | Maj | L3 (clic du stick gauche) |
| Accélérer, freiner | Z/W, S | RT, LT |
| Interagir | E | X |
| Monter ou descendre d'un véhicule | F | Y |
| Action du véhicule | R | X (en véhicule) |
| Klaxon | H | RB |
| Phares | L | LB |
| Changer de caméra | C | Vue (View) |
| Menu pause | Échap | Start |
| Retour / fermer | Retour arrière | B |
| Zoom de la mini-carte | + / − | Croix ↑ / ↓ |
| Choisir une action | 1 à 5 | Croix ← / → |
| Grande carte | M | — |
| S'accroupir | Ctrl ou X | R3 |

**Téléphone** :

- joystick à gauche ; caméra en glissant le doigt sur la moitié droite de l'écran ;
- les boutons changent selon la situation :
  - **à pied** : agir, sauter, courir, s'accroupir ;
  - **en véhicule** : accélérateur, frein (à maintenir), klaxon, phares, action du véhicule ;
  - **toujours** : véhicule, caméra, plein écran ;
- Paramètres → Écran tactile :
  - **taille des boutons** de 44 à 84 px ;
  - **Modifier la disposition** : on glisse chaque bouton et le joystick à l'endroit voulu, puis on appuie sur « Terminer » ;
  - la disposition est enregistrée séparément pour l'écran horizontal et l'écran vertical.

## 7. Ce qui est réel, simulé ou absent

| Élément | Statut |
|---|---|
| Routes, noms de rues, sens uniques, feux OSM, lieux (stations, hôpitaux, pharmacies, banques…), cours d'eau | **Réels** (OSM, Overture) |
| Itinéraire GPS | **Calculé** sur le réseau réel |
| Argent, prix, salaires, récompenses, banque | **Simulés** (économie de jeu) |
| Santé, endurance, carburant, dégâts | **Simulés** (règles de jeu) |
| Clients, délais de mission, horaires de bus | **Simulés** |
| Gilet pare-balles, combat | **Absents** (pas de combat dans le jeu) |
| Ouverture des portes, intérieurs | **Absents** (bâtiments sans intérieur) |
| Changement manuel de vitesse | **Absent** (boîte automatique, rapport affiché P/R/N/D) |

## 8. Tests

```
cd web/kinshasa/jeu && npm test                                  # dont tests/interface.test.js (GPS, missions)
node web/kinshasa/jeu/tests/e2e_interface.cjs http://localhost:8080   # interface complète dans Chromium
node web/kinshasa/jeu/tests/e2e_navigateur.cjs http://localhost:8080  # jeu complet (non-régression)
```

`e2e_interface.cjs` clique réellement sur chaque élément et vérifie l'effet dans le jeu :

- valeurs du HUD et mini-carte ;
- endurance et blessure après une chute ;
- retrait au distributeur d'une banque réelle ;
- pause qui fige le jeu ;
- les 9 onglets du menu ;
- remappage d'une touche, champ de vision, volume, sauvegarde ;
- destination GPS choisie sur la carte ;
- mission complète avec sa récompense ;
- tableau de bord (vitesse, rapport, compteur, voyant des phares) ;
- dépanneuse non instantanée ;
- boutons tactiles en véhicule et pédale d'accélérateur ;
- éditeur de disposition.

Un seul délai est raccourci pendant le test : celui de la dépanneuse, qui passe de 90 s à 0, pour gagner du temps.

**Résultats du 23/11/2026** (serveur local, Chromium avec rendu logiciel) :

- `npm test` : 25 tests sur 25 ;
- `e2e_interface.cjs` : 43 vérifications sur 43, aucune erreur JavaScript ;
- `e2e_navigateur.cjs` (non-régression du jeu existant) : 29 vérifications sur 29.

Chevauchements vérifiés par une capture sur Pixel 7 et iPhone 13, à l'horizontale et à la verticale, à pied et en véhicule, avec GPS, mission et notification affichés en même temps : aucun.


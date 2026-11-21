# Sécurité

- **Aucun secret dans le dépôt** : les clés de signature Android (`*.keystore`), les mots de passe et les jetons sont exclus par `.gitignore`. En intégration continue (CI), ils doivent passer par les **Secrets GitHub**.
- **Clé de signature Android** : elle doit rester la même d'une version à l'autre, sinon Android refuse la mise à jour et il faut désinstaller le jeu. Conservez-la dans un endroit sûr (gestionnaire de mots de passe, avec une sauvegarde hors ligne).
- **Sauvegarde locale** : en mode solo, `user://sauvegarde.json` est relu de façon défensive (types et bornes vérifiés). Le joueur peut modifier ce fichier, ce qui est acceptable hors ligne.
- **Multijoueur (futur)** : le serveur sera la seule autorité sur l'argent, l'inventaire, les propriétés et la progression. Toute action du client sera validée côté serveur, avec limitation du nombre de requêtes et journalisation.
- **Données personnelles** : aucune donnée n'est collectée en v0.1, et aucune connexion réseau n'est faite par le jeu. Aucune permission Android n'est demandée.
- **Données tierces** : seules des sources à licence compatible sont utilisées (OpenStreetMap, ODbL). Pas d'extraction de Google Maps ou de Bing Maps.

class_name MissionData
extends RefCounted
## Contenu des missions de la zone Limete / Échangeur.
## Les dialogues mélangent français et lingala (traduction entre parenthèses),
## comme on parle couramment à Kinshasa.
##
## Champs d'une étape :
##   at      : [x, y] position sur la carte (m) — ou "poi" : identifiant OSM
##   label   : nom affiché sur l'objectif
##   text    : consigne affichée au joueur
##   radius  : distance de validation (m)
##   timer   : (optionnel) secondes pour atteindre l'objectif
##   cost    : (optionnel) prix à payer à cette étape (FC)
##   done    : message à l'arrivée

const MISSIONS := [
	{
		"id": "m1_mbote",
		"title": "Mbote na Kin !",
		"giver": "Papa Mbuta", "giver_at": [-40.0, -150.0],
		"intro": "Mbote ndeko ! Sango nini ? (Bonjour mon frère/ma sœur ! Quoi de neuf ?)\nBienvenue à Limete. Tu vois la grande tour là-bas ? C'est la Tour de l'Échangeur, la fierté de Kinshasa. Va la voir de près. Tokende ! (Allons-y !)",
		"reward": 5000,
		"steps": [
			{"at": [0.0, 0.0], "label": "Tour de l'Échangeur", "radius": 32.0,
			 "text": "Rejoins l'esplanade de la Tour de l'Échangeur",
			 "done": "Kitoko mingi ! (Très beau !) Les nacelles dorées brillent au soleil."},
		],
	},
	{
		"id": "m2_lumumba",
		"title": "Hommage à Lumumba",
		"giver": "Maître Kabeya", "giver_at": [20.0, -45.0],
		"intro": "Mbote ! Je suis professeur d'histoire. Non loin d'ici se dresse le monument de Patrice Emery Lumumba, premier Premier ministre du Congo indépendant en 1960. Va lui rendre hommage, mwana (mon enfant).",
		"reward": 3000,
		"steps": [
			{"poi": "n2298412028", "label": "Monument Patrice Lumumba", "radius": 18.0,
			 "text": "Va au monument Patrice Lumumba",
			 "done": "« L'Afrique écrira sa propre histoire. » — P. E. Lumumba"},
		],
	},
	{
		"id": "m3_colis",
		"title": "Livraison express",
		"giver": "Mama Nsimba", "giver_at": [250.0, -350.0],
		"intro": "Eh mwana ! Mbote. J'ai besoin d'aide : mon colis attend au supermarché Kin Marche. Porte-le vite à mon fils à l'Université Libre de Kinshasa (ULK). Il a un examen ! Nakopesa yo mbongo. (Je te donnerai de l'argent.)",
		"reward": 15000,
		"steps": [
			{"poi": "w1028400780", "label": "Kin Marche", "radius": 14.0,
			 "text": "Récupère le colis au supermarché Kin Marche",
			 "done": "Colis récupéré. Vite, à l'université !"},
			{"poi": "w354099810", "label": "Université Libre de Kinshasa", "radius": 18.0, "timer": 240.0,
			 "text": "Livre le colis à l'ULK avant la fin du temps",
			 "done": "Matondo mingi ! (Merci beaucoup !) Juste à temps pour l'examen."},
		],
	},
	{
		"id": "m4_fete",
		"title": "Boissons pour la fête",
		"giver": "Ya Fiston", "giver_at": [230.0, 800.0],
		"intro": "Mbote ndeko ! Ce soir on fête la fin des examens à l'Institut Lumumba. Achète des boissons à la Plazza (2 000 FC) et apporte-les là-bas. Bilei mpe masanga ! (De la nourriture et des boissons !)",
		"reward": 10000,
		"steps": [
			{"poi": "n6581449658", "label": "Plazza", "radius": 14.0, "cost": 2000,
			 "text": "Achète les boissons à la Plazza (2 000 FC)",
			 "done": "Boissons achetées."},
			{"poi": "w60658740", "label": "Institut Lumumba", "radius": 22.0,
			 "text": "Apporte les boissons à l'Institut Lumumba",
			 "done": "Ambiance ! La fête peut commencer."},
		],
	},
	{
		"id": "m5_course",
		"title": "Le grand tour de Limete",
		"giver": "Coach Mbala", "giver_at": [200.0, 30.0],
		"intro": "Mbote ! Tu es en forme ? Course chronométrée : passe à Notre-Dame d'Afrique, à l'Alliance Franco-Congolaise, puis reviens à la Tour. Mbangu mbangu ! (Vite vite !)",
		"reward": 20000,
		"steps": [
			{"poi": "w363665145", "label": "Notre-Dame d'Afrique", "radius": 20.0, "timer": 200.0,
			 "text": "Point 1 : église Notre-Dame d'Afrique", "done": "Point 1 validé !"},
			{"poi": "n5179741368", "label": "Alliance Franco-Congolaise", "radius": 20.0, "timer": 120.0,
			 "text": "Point 2 : Alliance Franco-Congolaise", "done": "Point 2 validé !"},
			{"at": [0.0, 0.0], "label": "Tour de l'Échangeur", "radius": 32.0, "timer": 150.0,
			 "text": "Arrivée : Tour de l'Échangeur", "done": "Champion ! Ozali makasi ! (Tu es fort !)"},
		],
	},
]

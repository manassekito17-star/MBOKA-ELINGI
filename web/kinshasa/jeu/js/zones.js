// Zones jouables (mode « GTA ») préparées avec tools/jumeau/decouper_zone.py.
// Chaque zone est une vraie portion de Kinshasa ; ce fichier ne contient que
// les réglages du jeu : nom, point de départ, lignes SIMULÉES ajoutées.
export const ZONES = {
  limete: {
    nom: "Limete — Tour de l'Échangeur",
    court: "Limete",
    description: "3,2 × 3,2 km autour de la Tour de l'Échangeur",
    depart: { x: -38, z: -128 },
    monument: "echangeur",
    lignesSimulees: [
      { axe: "Boulevard Lumumba", id: "sim_m1", ref: "M1", nom: "Minibus Boulevard Lumumba (ligne simulée)",
        type: "minibus", depart: "Échangeur", terminus: "Nord de la zone", nbBus: 4 },
    ],
  },
  gombe: {
    nom: "Gombe — centre-ville",
    court: "la Gombe",
    description: "9,2 × 4 km : la commune de la Gombe, le long du fleuve, et le bord des communes voisines",
    depart: { x: 1300, z: -1150 },        // Place de la Gare / boulevard du 30 Juin
    monument: null,
    lignesSimulees: [
      { axe: "Boulevard du 30 Juin", id: "sim_g1", ref: "G1", nom: "Minibus Boulevard du 30 Juin (ligne simulée)",
        type: "minibus", depart: "Gare Centrale", terminus: "Ouest de la Gombe", nbBus: 5 },
      { axe: "Avenue des Huileries", id: "sim_g2", ref: "G2", nom: "Minibus Avenue des Huileries (ligne simulée)",
        type: "minibus", depart: "Est", terminus: "Ouest", nbBus: 3 },
    ],
  },
  centre: {
    nom: "Lingwala / Kasa-Vubu — Stade des Martyrs",
    court: "Lingwala et Kasa-Vubu",
    description: "2,8 × 4,6 km : Stade des Martyrs, Palais du Peuple, Hôpital du Cinquantenaire, boulevard Triomphal",
    depart: { x: 380, z: -180 },          // boulevard Triomphal, entre le Palais du Peuple et le stade
    monument: "centre",
    lignesSimulees: [
      { axe: "Boulevard Triomphal", id: "sim_c1", ref: "C1", nom: "Minibus Boulevard Triomphal (ligne simulée)",
        type: "minibus", depart: "Palais du Peuple", terminus: "Stade des Martyrs", nbBus: 3 },
      { axe: "Avenue Kasa-Vubu", id: "sim_c2", ref: "C2", nom: "Minibus Avenue Kasa-Vubu (ligne simulée)",
        type: "minibus", depart: "Nord", terminus: "Sud", nbBus: 4 },
    ],
  },
  kalamu: {
    nom: "Kalamu — Matonge, Rond-point Victoire",
    court: "Kalamu",
    description: "2,6 × 4,5 km : Matonge, Rond-point Victoire, avenues Kasa-Vubu, de la Victoire et de l'Université",
    depart: { x: -290, z: -960 },         // près du Rond-point Victoire
    monument: null,
    lignesSimulees: [
      { axe: "Avenue de la Victoire", id: "sim_k1", ref: "K1", nom: "Minibus Avenue de la Victoire (ligne simulée)",
        type: "minibus", depart: "Rond-point Victoire", terminus: "Est", nbBus: 3 },
      { axe: "Avenue de l’Université", id: "sim_k2", ref: "K2", nom: "Minibus Avenue de l'Université (ligne simulée)",
        type: "minibus", depart: "Nord", terminus: "Sud", nbBus: 4 },
    ],
  },
  kintambo: {
    nom: "Kintambo — Hôpital général de référence",
    court: "Kintambo",
    description: "2 × 2 km : Kintambo, l'Hôpital Général de Référence de Kintambo, avenue de l'OUA, Kintambo Magasin",
    depart: { x: -75, z: 10 },            // devant l'hôpital, avenue de l'Hôpital
    monument: null,
    lignesSimulees: [
      { axe: "Avenue de l’OUA", id: "sim_t1", ref: "T1", nom: "Minibus Avenue de l'OUA (ligne simulée)",
        type: "minibus", depart: "Nord", terminus: "Sud", nbBus: 3 },
    ],
  },
};

export const ZONE_DEFAUT = "limete";

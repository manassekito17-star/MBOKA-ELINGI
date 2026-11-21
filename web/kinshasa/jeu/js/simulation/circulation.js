// SIMULATION URBAINE de Kinshasa (circulation et piétons), indépendante du rendu.
//
// - Suivi de véhicule : modèle IDM (Intelligent Driver Model, Treiber 2000) :
//   distance de sécurité, accélération et freinage progressifs. Les bouchons,
//   files aux feux et ondes de ralentissement en découlent naturellement.
// - Changement de voie prudent (inspiré de MOBIL) sur les routes à 2 voies.
// - Carrefours : feux tricolores (simulés) aux croisements d'axes, priorité
//   à l'axe principal ailleurs, interdiction de bloquer un carrefour.
// - Itinéraires A* sur le vrai réseau, recalculés en cas d'accident.
// - Transports : bus (lignes, arrêts, montée/descente), minibus, taxis
//   collectifs et motos-taxis (prise en charge et dépose de clients).
// - Piétons : marche sur les trottoirs, attente aux arrêts, appel de taxi ou
//   de moto, traversée aux passages piétons.
// - Demande variable selon l'heure (pointes du matin et du soir) et le niveau.
//
// TOUT CE QUI EST PRODUIT ICI EST SIMULÉ : ce n'est pas le trafic réel observé.
import { Reseau, MAJEURES } from "./reseau.js";
import { aleatoire } from "../geo.js";

export const NIVEAUX = ["faible", "moyen", "intense"];
const FACTEUR_NIVEAU = [0.5, 1, 1.7];

/** Profil horaire simulé de la demande (1 = journée normale). */
export function profilHoraire(h) {
  if (h < 5) return 0.15;
  if (h < 6) return 0.45;
  if (h < 9) return 1.3;       // pointe du matin
  if (h < 16) return 0.85;
  if (h < 19) return 1.4;      // pointe du soir
  if (h < 21) return 0.7;
  return 0.35;
}

/** Types de véhicules : dimensions, vitesse relative, capacité. */
export const VEHICULES = {
  voiture: { long: 4.5, larg: 1.8, v0: 1.0, capacite: 0 },
  taxi: { long: 4.3, larg: 1.75, v0: 1.0, capacite: 4 },          // taxi collectif jaune
  minibus: { long: 5.4, larg: 2.0, v0: 0.9, capacite: 18 },       // « esprit de mort / esprit de vie »
  bus: { long: 11.5, larg: 2.5, v0: 0.8, capacite: 60 },          // Transco
  moto: { long: 2.0, larg: 0.7, v0: 1.05, capacite: 1 },          // « wewa » (moto-taxi)
  camion: { long: 8.5, larg: 2.45, v0: 0.75, capacite: 0 },
  livraison: { long: 5.2, larg: 2.0, v0: 0.9, capacite: 0 },
  ambulance: { long: 5.4, larg: 2.0, v0: 1.1, capacite: 0 },
  police: { long: 4.6, larg: 1.8, v0: 1.05, capacite: 0 },
};
/** Répartition simulée du trafic libre (estimation d'après les sources citées dans la doc). */
const MELANGE = [["taxi", 0.24], ["minibus", 0.14], ["voiture", 0.24], ["moto", 0.24], ["camion", 0.05],
  ["livraison", 0.05], ["ambulance", 0.02], ["police", 0.02]];
/** Profils de conducteurs (aucun ne provoque volontairement de collision). */
const PROFILS = [
  { nom: "calme", T: 1.6, s0: 2.5, a: 1.1, b: 1.8, v0: 0.9 },
  { nom: "normal", T: 1.25, s0: 2.0, a: 1.5, b: 2.2, v0: 1.0 },
  { nom: "pressé", T: 0.95, s0: 1.6, a: 2.0, b: 2.6, v0: 1.1 },
];

const LIGNE_ARRET_FEU = 9;      // distance (m) entre la ligne d'arrêt et le centre du carrefour (feux)
const LIGNE_ARRET = 5;          // idem sans feux
const RAYON_CARREFOUR = 9;
const VERT = 28, ORANGE = 4, ROUGE_INTEGRAL = 2;
const CYCLE = 2 * (VERT + ORANGE + ROUGE_INTEGRAL);

export class Circulation {
  /**
   * reseauJson : routes de la zone (reseau.json) ; transports : transports.json (réel).
   * options : { graine, niveau (0-2), heure, cibleVehicules, ciblePietons, lignesSimulees }
   */
  constructor(reseauJson, transports = null, options = {}) {
    this.R = reseauJson instanceof Reseau ? reseauJson : new Reseau(reseauJson);
    this.rnd = aleatoire(options.graine ?? 2026);
    this.niveau = options.niveau ?? 1;
    this.heure = options.heure ?? 10;
    this.base = options.cibleVehicules ?? 300;
    this.basePietons = options.ciblePietons ?? 260;
    // « Bulle » autour du joueur : densité locale maintenue (rues animées là où l'on regarde).
    this.bulle = options.bulle ?? { vehicules: 45, pietons: 70 };
    this.auto = options.auto ?? true;          // apparition / disparition automatique
    this.t = 0;
    this.vehicules = [];
    this.pietons = [];
    this.lignes = [];
    this.arrets = new Map();
    this.passages = [];
    this.evenements = [];                       // journal (tests, interface)
    this.engages = new Map();                   // nœud -> Set(véhicules engagés)
    this.bloques = new Set();                   // arcs entièrement bloqués (accident)
    this.joueur = null;
    this.nid = 1;
    this._feux();
    this._grappes();
    this._passages(transports?.passages || []);
    this.arretsReels = transports?.arrets || [];
    for (const l of transports?.lignes || []) this.ajouterLigne({ ...l, type: "bus", nbBus: options.busParLigne ?? 4 });
    for (const l of options.lignesSimulees || []) this.ajouterLigne({ ...l, reel: false });
  }

  // ------------------------------------------------------------------ feux
  _feux() {
    const R = this.R;
    this.controleurs = [];
    const eligible = R.noeuds.filter((n) => {
      if (!n.carrefour) return false;
      const ent = n.entrants.map((e) => R.arcs[e]);
      return ent.filter((a) => a.rang >= 3).length >= 2 && new Set(ent.filter((a) => a.rang >= 2).map((a) => a.nom || a.id)).size >= 2;
    });
    for (const n of eligible) {
      let c = this.controleurs.find((c) => Math.hypot(c.x - n.x, c.z - n.z) < 40);
      if (!c) {
        const a0 = R.arcs[n.entrants.find((e) => R.arcs[e].rang >= 3)];
        c = { id: this.controleurs.length, x: n.x, z: n.z, axe: R.cap(a0.id, true), decalage: this.rnd() * CYCLE, noeuds: [] };
        this.controleurs.push(c);
      }
      c.noeuds.push(n.id);
      n.feu = c.id;
    }
  }

  /** Regroupe les carrefours très proches (boulevards à deux chaussées) en un seul carrefour logique. */
  _grappes() {
    const R = this.R;
    for (const n of R.noeuds) n.grappe = n.id;
    const racine = (i) => (R.noeuds[i].grappe === i ? i : (R.noeuds[i].grappe = racine(R.noeuds[i].grappe)));
    for (const a of R.arcs) {
      const na = R.noeuds[a.de], nb = R.noeuds[a.vers];
      if (na.carrefour && nb.carrefour && a.long < 25) {
        const ra = racine(na.id), rb = racine(nb.id);
        if (ra !== rb) R.noeuds[ra].grappe = rb;
      }
    }
    for (const n of R.noeuds) n.grappe = racine(n.id);
  }

  /** Phase (0 ou 1) d'un arc entrant dans un carrefour à feux. */
  phaseArc(arcId) {
    const a = this.R.arcs[arcId];
    const c = this.controleurs[this.R.noeuds[a.vers].feu];
    return Math.abs(Math.cos(this.R.cap(arcId, true) - c.axe)) > 0.7 ? 0 : 1;
  }

  /** État du feu pour un arc entrant : "vert" | "orange" | "rouge" | null (pas de feu). */
  etatFeu(arcId) {
    const n = this.R.noeuds[this.R.arcs[arcId].vers];
    if (n.feu === undefined) return null;
    const c = this.controleurs[n.feu];
    const t = (this.t + c.decalage) % CYCLE;
    const debut = this.phaseArc(arcId) === 0 ? 0 : VERT + ORANGE + ROUGE_INTEGRAL;
    const u = t - debut;
    if (u >= 0 && u < VERT) return "vert";
    if (u >= VERT && u < VERT + ORANGE) return "orange";
    return "rouge";
  }

  /** Temps (s) avant le prochain passage au vert d'un arc (0 si vert). */
  avantVert(arcId) {
    const n = this.R.noeuds[this.R.arcs[arcId].vers];
    if (n.feu === undefined) return 0;
    const c = this.controleurs[n.feu];
    const t = (this.t + c.decalage) % CYCLE;
    const debut = this.phaseArc(arcId) === 0 ? 0 : VERT + ORANGE + ROUGE_INTEGRAL;
    return ((debut - t) % CYCLE + CYCLE) % CYCLE;
  }

  // -------------------------------------------------------- passages piétons
  _passages(reels) {
    const R = this.R;
    const ajouter = (arcId, s, reel, nom) => {
      const a = R.arcs[arcId];
      const p = { id: this.passages.length, arcs: [{ arc: arcId, s }], reel, nom, pietons: new Set(),
        largeur: a.largeur + 2, ...R.point(arcId, s) };
      if (a.jumeau >= 0) p.arcs.push({ arc: a.jumeau, s: a.long - s });
      for (const { arc, s: ss } of p.arcs) R.arcs[arc].traversees.push({ s: ss, id: p.id });
      this.passages.push(p);
      return p;
    };
    for (const c of reels) {
      const pr = R.arcProche(c.x, c.z);
      if (pr && pr.d < 15) ajouter(pr.arc, pr.s, true, c.nom || "Passage piéton");
    }
    // Passages simulés devant chaque arrivée d'axe dans un carrefour à feux.
    const vus = new Set();
    for (const n of R.noeuds) {
      if (n.feu === undefined) continue;
      for (const e of n.entrants) {
        const a = R.arcs[e];
        if (a.rang < 2 || a.long < 20 || vus.has(e)) continue;
        vus.add(e);
        if (a.jumeau >= 0) vus.add(a.jumeau);
        ajouter(e, a.long - 6, false, "Passage piéton (simulé)");
      }
    }
  }

  // -------------------------------------------------------------- lignes
  /**
   * Ligne de transport : { id, ref, nom, reel, trace:[x,z...], arrets:[ids réels] ou objets,
   *   type: "bus"|"minibus", nbBus, depart, terminus }
   */
  ajouterLigne(l) {
    const R = this.R;
    const tr = [];
    for (let i = 0; i < l.trace.length; i += 2) tr.push([l.trace[i], l.trace[i + 1]]);
    const distTrace = (x, z) => {
      let d = Infinity;
      for (let i = 1; i < tr.length; i++) {
        const [ax, az] = tr[i - 1], [bx, bz] = tr[i];
        const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
        d = Math.min(d, Math.hypot(ax + lx * t - x, az + lz * t - z));
      }
      return d;
    };
    const cout = (a) => {
      const m = R.point(a.id, a.long / 2);
      return (a.long / a.vmax) * (distTrace(m.x, m.z) < 25 ? 1 : 12);
    };
    const n0 = R.noeudProche(tr[0][0], tr[0][1], (n) => n.sortants.length > 0);
    const n1 = R.noeudProche(tr[tr.length - 1][0], tr[tr.length - 1][1], (n) => n.entrants.length > 0);
    const aller = R.itineraire(n0, n1, cout);
    const retour = R.itineraire(n1, n0, cout);
    if (!aller || !retour || !aller.length) return null;
    const ligne = { id: l.id, ref: l.ref || "", nom: l.nom || "", reel: !!l.reel, type: l.type || "bus",
      depart: l.depart || "", terminus: l.terminus || "", chemins: [aller, retour], arrets: [] };
    // Arrêts réels proches du tracé, puis arrêts simulés pour combler les trous de plus de 400 m.
    const reels = (l.arrets || []).map((a) => (typeof a === "string" ? this.arretsReels.find((r) => r.id === a) : a)).filter(Boolean);
    for (const a of this.arretsReels) if (distTrace(a.x, a.z) < 60 && !reels.includes(a)) reels.push(a);
    const placer = (chemin, x, z) => {
      let best = null, acc = 0;
      chemin.forEach((aid, i) => {
        const a = R.arcs[aid];
        for (let s = 0; s <= a.long; s += 4) {
          const p = R.point(aid, s);
          const d = Math.hypot(p.x - x, p.z - z);
          if (!best || d < best.d) best = { i, s: Math.max(4, Math.min(a.long - 12, s)), d, abs: acc + s };
        }
        acc += a.long;
      });
      return best;
    };
    const stops = [];
    for (const a of reels) stops.push({ id: a.id, nom: a.nom || "Arrêt", reel: true, x: a.x, z: a.z });
    // Arrêts simulés le long de l'aller.
    let acc = 0;
    const longueur = aller.reduce((s, aid) => s + R.arcs[aid].long, 0);
    const absReels = stops.map((s) => placer(aller, s.x, s.z)).filter((p) => p && p.d < 60).map((p) => p.abs);
    let k = 1;
    for (let d = 150; d < longueur - 100; d += 400) {
      if (absReels.some((a) => Math.abs(a - d) < 220)) continue;
      acc = 0;
      for (const aid of aller) {
        const a = R.arcs[aid];
        if (acc + a.long >= d) {
          const p = R.point(aid, d - acc);
          stops.push({ id: `${l.id}_sim${k}`, nom: `Arrêt ${k} (simulé)`, reel: false, x: p.x, z: p.z });
          k++;
          break;
        }
        acc += a.long;
      }
    }
    for (const st of stops) {
      if (!this.arrets.has(st.id)) this.arrets.set(st.id, { ...st, lignes: [], attente: new Set() });
      const arret = this.arrets.get(st.id);
      arret.lignes.push(ligne.id);
      const pos = [placer(aller, st.x, st.z), placer(retour, st.x, st.z)];
      ligne.arrets.push({ id: st.id, pos: pos.map((p) => (p && p.d < 60 ? { i: p.i, s: p.s, abs: p.abs } : null)) });
    }
    ligne.arrets.sort((a, b) => (a.pos[0]?.abs ?? 0) - (b.pos[0]?.abs ?? 0));
    ligne.longueur = longueur;
    this.lignes.push(ligne);
    // Véhicules de la ligne, répartis sur l'aller et le retour.
    const nb = l.nbBus ?? 3;
    for (let i = 0; i < nb; i++) {
      const sens = i % 2;
      const chemin = ligne.chemins[sens];
      const iRoute = Math.floor((i / nb) * chemin.length * 0.9);
      const v = this._creerVehicule(ligne.type, chemin[iRoute], 5, 0, chemin.slice(iRoute));
      if (!v) continue;
      v.ligne = ligne.id;
      v.sens = sens;
      v.decalageRoute = iRoute;
      v.role = "ligne";
      this._prochainsArrets(v);
    }
    return ligne;
  }

  _prochainsArrets(v) {
    const ligne = this.lignes.find((l) => l.id === v.ligne);
    v.arretsAVenir = ligne.arrets.map((a) => ({ id: a.id, ...a.pos[v.sens] }))
      .filter((a) => a.i !== undefined && a.i >= (v.decalageRoute || 0))
      .map((a) => ({ ...a, i: a.i - (v.decalageRoute || 0) }))
      .sort((a, b) => a.i - b.i || a.s - b.s);
  }

  // ------------------------------------------------------------- véhicules
  _creerVehicule(type, arcId, s, voie, route, profil) {
    const a = this.R.arcs[arcId];
    const t = VEHICULES[type];
    voie = Math.min(voie, a.voies - 1);
    // Pas d'apparition sur un autre véhicule.
    for (const w of this.vehicules) {
      if (w.arc === arcId && w.voie === voie && Math.abs(w.s - s) < (w.long + t.long) / 2 + 3) return null;
    }
    const p = profil ?? PROFILS[Math.floor(this.rnd() * PROFILS.length)];
    const v = {
      id: this.nid++, type, role: type, arc: arcId, s, voie, lat: this.R.decalageVoie(arcId, voie), v: 0, acc: 0,
      long: t.long, larg: t.larg, capacite: t.capacite, passagers: [], profil: p,
      T: p.T, s0: type === "moto" ? 1.0 : p.s0, amax: p.a * (type === "bus" || type === "camion" ? 0.7 : 1),
      b: p.b, v0f: p.v0 * t.v0, route: route || [arcId], iRoute: 0, etat: "route", attente: 0,
      distance: 0, freine: false, sirene: type === "ambulance" || type === "police", cooldownVoie: 0,
      bloqueDepuis: 0, x: 0, z: 0, cap: 0,
    };
    if (v.route[0] !== arcId) v.route.unshift(arcId);
    this.vehicules.push(v);
    this._position(v);
    return v;
  }

  /** Ajoute un véhicule d'un type donné avec un itinéraire (tests et scénarios). */
  ajouterVehicule(type, arcId, s, voie, route, profil) {
    return this._creerVehicule(type, arcId, s, voie, route, profil);
  }

  _position(v) {
    const p = this.R.point(v.arc, v.s, v.lat);
    v.x = p.x; v.z = p.z;
    v.cap = Math.atan2(p.dx, -p.dz);
  }

  _arcSuivant(v) {
    return v.iRoute + 1 < v.route.length ? v.route[v.iRoute + 1] : -1;
  }

  /** Coût d'un arc pour le calcul d'itinéraire (temps + congestion, accidents interdits). */
  _cout(a) {
    if (this.bloques.has(a.id)) return Infinity;
    const n = this._occupation?.get(a.id) || 0;
    const capacite = Math.max(1, (a.long / 7) * a.voies);
    return (a.long / a.vmax) * (1 + 2 * (n / capacite) ** 2);
  }

  _nouvelleDestination(v, minDist = 500) {
    const R = this.R;
    const a = R.arcs[v.arc];
    for (let essai = 0; essai < 12; essai++) {
      const n = R.noeuds[Math.floor(this.rnd() * R.noeuds.length)];
      if (!n.entrants.length) continue;
      if (Math.hypot(n.x - R.noeuds[a.vers].x, n.z - R.noeuds[a.vers].z) < minDist) continue;
      const r = R.itineraire(a.vers, n.id, (x) => this._cout(x));
      if (r && r.length) {
        v.route = [v.arc, ...r];
        v.iRoute = 0;
        v.dest = n.id;
        return true;
      }
    }
    return false;
  }

  _allerVers(v, noeud) {
    const a = this.R.arcs[v.arc];
    const r = this.R.itineraire(a.vers, noeud, (x) => this._cout(x));
    if (!r) return false;
    v.route = [v.arc, ...r];
    v.iRoute = 0;
    v.dest = noeud;
    return true;
  }

  // ------------------------------------------------------------- piétons
  ajouterPieton(arcId, s, cote = 1, options = {}) {
    const a = this.R.arcs[arcId];
    const p = {
      id: this.nid++, arc: arcId, s: Math.max(0, Math.min(a.long, s)), cote, dir: options.dir ?? 1,
      v: 1.0 + this.rnd() * 0.5, etat: options.etat || "marche", attente: 0, vehicule: null,
      variante: Math.floor(this.rnd() * 1000), x: 0, z: 0, cap: 0, ligne: options.ligne || null,
      arret: options.arret || null, destination: options.destination ?? null, traversee: null, progression: 0,
      vers: null,
    };
    this.pietons.push(p);
    this._positionPieton(p);
    return p;
  }

  _positionPieton(p) {
    const a = this.R.arcs[p.arc];
    const trottoir = a.largeur / 2 + 1.6;
    let lat = p.cote * trottoir;
    if (p.etat === "traverse") lat = p.cote * trottoir * (1 - 2 * p.progression);
    const q = this.R.point(p.arc, p.s, lat);
    p.x = q.x; p.z = q.z;
    if (p.etat === "traverse") p.cap = Math.atan2(p.cote * q.dz, p.cote * q.dx);
    else p.cap = Math.atan2(q.dx * p.dir, -q.dz * p.dir);
  }

  // --------------------------------------------------------- interactions
  /** Position du joueur (obstacle pour les véhicules). */
  definirJoueur(x, z, enVehicule = false) {
    this.joueur = { x, z, enVehicule };
  }

  /** Provoque un accident simulé près d'un point : un véhicule s'immobilise et bloque sa voie. */
  provoquerAccident(x, z, duree = 120) {
    let best = null;
    for (const v of this.vehicules) {
      if (v.etat !== "route" || v.role === "ligne") continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < 250 && (!best || d < best.d) && this.R.arcs[v.arc].rang >= 2) best = { v, d };
    }
    if (!best) return null;
    const v = best.v;
    v.etat = "accident";
    v.accidentFin = this.t + duree;
    const a = this.R.arcs[v.arc];
    const voiesLibres = a.voies - this.vehicules.filter((w) => w.arc === a.id && w.etat === "accident").length;
    if (voiesLibres <= 0) {
      this.bloques.add(a.id);
      // Les véhicules qui devaient passer par là cherchent un autre itinéraire.
      for (const w of this.vehicules) {
        if (w === v || w.role === "ligne") continue;
        const k = w.route.indexOf(a.id, w.iRoute + 1);
        if (k > w.iRoute && w.dest !== undefined) {
          const ok = this._allerVers(w, w.dest);
          this._journal("deviation", { v: w.id, ok });
        }
      }
    }
    this._journal("accident", { v: v.id, arc: a.id, bloque: voiesLibres <= 0 });
    return v;
  }

  _journal(type, d) {
    this.evenements.push({ t: this.t, type, ...d });
    if (this.evenements.length > 2000) this.evenements.splice(0, 500);
  }

  // ---------------------------------------------------------- pas de temps
  /** Avance la simulation de dt secondes (sous-pas de 0,1 s au maximum). */
  pas(dt) {
    let reste = Math.min(dt, 1);
    while (reste > 1e-6) {
      const h = Math.min(0.1, reste);
      this._pas(h);
      reste -= h;
    }
  }

  cibleVehicules() {
    return Math.round(this.base * FACTEUR_NIVEAU[this.niveau] * profilHoraire(this.heure));
  }
  ciblePietons() {
    return Math.round(this.basePietons * FACTEUR_NIVEAU[this.niveau] * (0.4 + 0.6 * profilHoraire(this.heure)));
  }

  _pas(h) {
    this.t += h;
    const R = this.R;
    // Index des véhicules par (arc, voie), triés par position.
    const voies = new Map();
    this._occupation = new Map();
    for (const v of this.vehicules) {
      const k = v.arc * 4 + (v.interfile ? 3 : v.voie);
      if (!voies.has(k)) voies.set(k, []);
      voies.get(k).push(v);
      this._occupation.set(v.arc, (this._occupation.get(v.arc) || 0) + 1);
    }
    for (const l of voies.values()) l.sort((a, b) => a.s - b.s);
    this._voies = voies;
    const premierSur = (arc, voie) => {
      const a = R.arcs[arc];
      const l = voies.get(arc * 4 + Math.min(voie, a.voies - 1));
      return l && l.length ? l[0] : null;
    };
    // Engagements de carrefour : libérés une fois le carrefour dégagé.
    for (const [n, set] of this.engages) {
      for (const v of set) {
        const a = R.arcs[v.arc];
        if (v.retire) { set.delete(v); continue; }                // véhicule retiré de la simulation
        if (!this._dansCarrefour(v, n)) {
          const vers = R.noeuds[a.vers];
          if (!(vers.grappe === n && a.long - (v.s + v.long / 2) < 60)) set.delete(v);   // encore en approche : garder
        }
      }
    }
    // Piétons sur les passages (occupation).
    for (const c of this.passages) {
      c.pietons.clear();
    }
    for (const p of this.pietons) if (p.etat === "traverse" && p.traversee !== null) this.passages[p.traversee].pietons.add(p);

    // 1. Accélérations (IDM) avec obstacles : véhicule devant, feu, carrefour, passage, arrêt, joueur.
    for (const v of this.vehicules) {
      const a = R.arcs[v.arc];
      if (v.etat === "accident") {
        v.acc = -6; v.freine = true;
        if (this.t > v.accidentFin) {
          v.etat = "route";
          this.bloques.delete(v.arc);
          this._journal("fin_accident", { v: v.id });
        }
        continue;
      }
      if (v.etat === "arret") {
        v.acc = -6;
        continue;
      }
      const v0 = a.vmax * v.v0f;
      let gap = Infinity, vl = 0;
      const avant = v.s + v.long / 2;
      // Véhicule devant sur la même voie (ou dans l'interfile pour une moto qui remonte la file).
      const l = voies.get(v.arc * 4 + (v.interfile ? 3 : v.voie));
      const i = l.indexOf(v);
      if (i + 1 < l.length) {
        const w = l[i + 1];
        gap = w.s - w.long / 2 - avant; vl = w.v;
      } else if (!v.interfile) {
        const sv0 = this._arcSuivant(v);
        if (sv0 >= 0) {
          const w = premierSur(sv0, v.voie);
          if (w) { gap = a.long - avant + w.s - w.long / 2; vl = w.v; }
        }
      }
      const obstacle = (s) => { const g = s - avant; if (g < gap) { gap = g; vl = 0; } };
      // Motos « wewa » : remontent prudemment une file arrêtée, entre les voitures (≤ 15 km/h).
      if (v.type === "moto" && v.etat === "route" && !v.client && !v.interfile && gap < 5 && vl < 0.5 && a.largeur >= 5.5) {
        v.interfile = true;
        this._journal("interfile", { v: v.id });
      }
      if (v.interfile) {
        const lr = voies.get(v.arc * 4 + v.voie) || [];
        const ok = lr.every((w) => { const d = w.s - v.s; return d > 0 ? d - (w.long + v.long) / 2 > 6 || w.v > 3 : -d - (w.long + v.long) / 2 > 4; });
        const fileArretee = lr.some((w) => w.s > v.s && w.s - v.s < 25 && w.v < 1);
        if (ok && !fileArretee) v.interfile = false;   // rejoint sa voie quand il y a de la place
      }
      const dFin = a.long - avant;
      const sv = this._arcSuivant(v);
      // Carrefour au bout de l'arc : décision à l'approche, engagement près de la ligne d'arrêt.
      const n = R.noeuds[a.vers];
      const interne = R.noeuds[a.de].grappe === n.grappe && R.noeuds[a.de].carrefour;   // arc à l'intérieur d'une grappe
      if (sv >= 0 && n.carrefour && !interne && !(this.engages.get(n.grappe)?.has(v))) {
        const ligneArret = a.long - (n.feu !== undefined ? LIGNE_ARRET_FEU : LIGNE_ARRET);
        const dist = ligneArret - avant;
        const decision = Math.max(25, (v.v * v.v) / (2 * v.b) + 15);
        if (dist < decision) {
          const ok = dist < -0.5 || this._peutEntrer(v, a, n, sv, dist);
          if (ok && dist < 4) {
            if (!this.engages.has(n.grappe)) this.engages.set(n.grappe, new Set());
            this.engages.get(n.grappe).add(v);
            this._journal("entree_carrefour", { v: v.id, noeud: n.id, arc: a.id,
              feu: n.feu !== undefined ? this.etatFeu(a.id) : null, dist });
            v.attente = 0;
          } else if (!ok) {
            obstacle(ligneArret);
            v.attente += h;
          }
        }
      }
      if (v.interfile) { gap = Math.min(gap, 30); vl = Math.min(vl, 4); }
      // Passages piétons occupés (sur cet arc et le suivant).
      for (const tr of a.traversees) {
        if (tr.s > avant - 1 && this.passages[tr.id].pietons.size) obstacle(tr.s - 3.5);
      }
      if (sv >= 0) for (const tr of R.arcs[sv].traversees) {
        if (this.passages[tr.id].pietons.size) obstacle(a.long + tr.s - 3.5);
      }
      // Arrêt de bus ou client à prendre.
      if (v.arretsAVenir?.length) {
        const st = v.arretsAVenir[0];
        if (st.i === v.iRoute) obstacle(st.s + v.long / 2);
      }
      if (v.client && v.clientArc === v.arc && v.clientS > v.s) obstacle(v.clientS + v.long / 2 + 1);
      // Fin d'itinéraire : s'arrêter avant la fin de l'arc.
      if (sv < 0 && v.role === "ligne") obstacle(a.long - 4);
      // Joueur (piéton ou véhicule) devant, dans le couloir de la voie.
      if (this.joueur) {
        const dx = this.joueur.x - v.x, dz = this.joueur.z - v.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 3600) {
          const fx = Math.sin(v.cap), fz = -Math.cos(v.cap);
          const devant = dx * fx + dz * fz, cote = Math.abs(dx * -fz + dz * fx);
          if (devant > 0 && cote < (this.joueur.enVehicule ? 2.2 : 1.6)) obstacle(v.s + devant - (this.joueur.enVehicule ? 2.5 : 1));
        }
      }
      // IDM.
      const vv = v.v;
      const vlim = v.interfile ? Math.min(v0, 4) : v0;
      const dv = vv - vl;
      const sEtoile = v.s0 + Math.max(0, vv * v.T + (vv * dv) / (2 * Math.sqrt(v.amax * v.b)));
      let acc = v.amax * (1 - (vv / Math.max(0.1, vlim)) ** 4 - (gap > 0 ? (sEtoile / gap) ** 2 : 100));
      acc = Math.max(-9, Math.min(v.amax, acc));
      v.acc = acc;
      v.freine = acc < -0.8 || (vv < 0.2 && gap < 10);
      v.gap = gap;
    }

    // 2. Intégration + anti-chevauchement (aucune collision entre véhicules de la même voie).
    for (const v of this.vehicules) {
      if (v.etat === "accident" || v.etat === "arret") { v.v = Math.max(0, v.v + v.acc * h); }
      else v.v = Math.max(0, v.v + v.acc * h);
      const ds = v.v * h;
      v.s += ds;
      v.distance += ds;
      if (v.v < 0.3) v.bloqueDepuis += h; else v.bloqueDepuis = 0;
    }
    for (const l of voies.values()) {
      l.sort((a, b) => a.s - b.s);
      for (let i = l.length - 2; i >= 0; i--) {
        const v = l[i], w = l[i + 1];
        const max = w.s - (w.long + v.long) / 2 - 0.5;
        if (v.s > max) { v.s = Math.max(0, max); v.v = Math.min(v.v, w.v); }
      }
    }

    // 3. Passage d'un arc au suivant, fins d'itinéraire, arrêts.
    for (const v of [...this.vehicules]) {
      const a = R.arcs[v.arc];
      this._arrets(v, h);
      if (v.s + v.long / 2 > a.long && this._arcSuivant(v) < 0) {
        if (v.role === "ligne") { v.s = a.long - v.long / 2; this._terminus(v); }
        else this._finItineraire(v);
        continue;
      }
      if (v.s <= a.long) { this._changementVoie(v, h); this._position(v); continue; }
      const sv = this._arcSuivant(v);
      const b = R.arcs[sv];
      const voie = Math.min(v.voie, b.voies - 1);
      const s2 = v.s - a.long;
      const dernier = premierSur(sv, voie);
      if (dernier && dernier.s - dernier.long / 2 < s2 + v.long / 2 + 0.5) {
        v.s = a.long; v.v = 0;          // la place est prise : attendre au bout de l'arc
        this._position(v);
        continue;
      }
      v.arc = sv; v.s = s2; v.voie = voie; v.iRoute++;
      v.lat = R.decalageVoie(sv, voie);
      if (v.arretsAVenir) for (const st of v.arretsAVenir) if (st.i < v.iRoute) st.i = -1;
      if (v.arretsAVenir) v.arretsAVenir = v.arretsAVenir.filter((st) => st.i >= 0);
      this._position(v);
    }

    // 3 bis. Vérification finale (listes à jour) : deux véhicules ne peuvent jamais se chevaucher.
    //        Un changement de voie conflictuel est annulé ; sinon le suiveur est retenu.
    this._antiChevauchement();

    // 4. Véhicules bloqués trop longtemps loin du joueur : retirés (évite les blocages permanents).
    for (const v of [...this.vehicules]) {
      if (v.bloqueDepuis > 60 && v.role !== "ligne" && v.etat !== "accident" && !v.passagers.length && !v.joueurABord && this._loinDuJoueur(v, 150)) {
        this._retirer(v, "bloque");
      }
    }

    this._pietons(h);
    if (this.auto) { this._equilibrer(); this._autourJoueur(); }
  }

  _antiChevauchement() {
    for (let passe = 0; passe < 2; passe++) {
      const voies = new Map();
      for (const v of this.vehicules) {
        const k = v.arc * 4 + (v.interfile ? 3 : v.voie);
        if (!voies.has(k)) voies.set(k, []);
        voies.get(k).push(v);
      }
      let corrige = false;
      for (const [k, l] of voies) {
        if (k % 4 === 3) continue;
        l.sort((a, b) => a.s - b.s);
        for (let i = l.length - 2; i >= 0; i--) {
          const v = l[i], w = l[i + 1];
          const max = w.s - (w.long + v.long) / 2 - 0.3;
          if (v.s <= max) continue;
          corrige = true;
          if (v.voieAvant !== undefined && v.cooldownVoie > 5.5) { v.voie = v.voieAvant; v.voieAvant = undefined; continue; }
          if (w.voieAvant !== undefined && w.cooldownVoie > 5.5) { w.voie = w.voieAvant; w.voieAvant = undefined; continue; }
          v.s = Math.max(0, max); v.v = Math.min(v.v, w.v);
          if (max < 0 && w.s < (w.long + v.long) / 2) { w.s = (w.long + v.long) / 2 + 0.3; }   // entrée simultanée sur l'arc
        }
      }
      if (!corrige) break;
    }
  }

  _loinDuJoueur(o, d) {
    return !this.joueur || Math.hypot(o.x - this.joueur.x, o.z - this.joueur.z) > d;
  }

  /** Le véhicule peut-il s'engager dans le carrefour ? */
  _peutEntrer(v, a, n, sv, distanceLigne) {
    const R = this.R;
    // Ne jamais bloquer le carrefour : il faut de la place à la sortie, en comptant
    // les véhicules déjà engagés qui vont vers la même sortie.
    const engages = this.engages.get(n.grappe);
    // Traverser toute la grappe : l'espace doit exister après sa sortie.
    let i = v.iRoute + 1;
    while (i < v.route.length && this.R.noeuds[this.R.arcs[v.route[i]].vers].grappe === n.grappe
      && this.R.noeuds[this.R.arcs[v.route[i]].vers].carrefour) i++;
    let espace = this._espaceLibre(v, Math.min(i + 1, v.route.length), 40);
    if (engages) for (const w of engages) if (w !== v && w.arc !== sv && this._arcSuivant(w) === sv) espace -= w.long + 2;
    if (espace < v.long + 3) return false;
    // Conflit : un véhicule venant d'une autre branche est réellement dans le carrefour.
    const conflit = engages && [...engages].some((w) => w !== v && w.arc !== v.arc && this._dansCarrefour(w, n.grappe));
    if (n.feu !== undefined) {
      const feu = this.etatFeu(a.id);
      if (feu === "vert") return !conflit || this._memeAxe(engages, v, a);
      if (feu === "orange") return v.v * v.v / (2 * v.b) > distanceLigne;   // trop près pour s'arrêter
      return false;
    }
    if (conflit) return false;
    // Priorité à l'axe le plus important ; sinon céder le passage.
    if (a.rang >= n.rangMax) return true;
    for (const e of n.entrants) {
      if (e === a.id) continue;
      const c = R.arcs[e];
      if (c.rang <= a.rang) continue;
      const lc = [];
      for (let k = 0; k < c.voies; k++) lc.push(...(this._voies.get(e * 4 + k) || []));
      if (lc.some((w) => c.long - w.s < 35 && w.v > 1)) return v.attente > 12;   // patience à Kinshasa…
    }
    return true;
  }

  /** Espace libre (m) le long de l'itinéraire à partir de l'arc d'indice i, jusqu'au premier véhicule. */
  _espaceLibre(v, i, max) {
    let espace = 0;
    for (; i < v.route.length && espace < max; i++) {
      const b = this.R.arcs[v.route[i]];
      const l = this._voies.get(b.id * 4 + Math.min(v.voie, b.voies - 1));
      if (l && l.length) return espace + l[0].s - l[0].long / 2;
      espace += b.long;
    }
    return Math.max(espace, max);
  }

  /** Le véhicule occupe-t-il physiquement la zone du carrefour (grappe g) ? */
  _dansCarrefour(w, g) {
    const a = this.R.arcs[w.arc];
    const de = this.R.noeuds[a.de], vers = this.R.noeuds[a.vers];
    const dansDe = de.carrefour && de.grappe === g, dansVers = vers.carrefour && vers.grappe === g;
    if (dansDe && dansVers) return true;                               // arc interne à la grappe
    if (dansVers) return a.long - (w.s + w.long / 2) < 1;              // a franchi la ligne d'arrêt
    if (dansDe) return w.s - w.long / 2 < RAYON_CARREFOUR * 0.6;      // pas encore sorti
    return false;
  }

  _memeAxe(engages, v, a) {
    const cap = this.R.cap(a.id, true);
    return [...engages].every((w) => w === v || Math.abs(Math.cos(this.R.cap(w.arc, false) - cap)) > 0.7
      || Math.abs(Math.cos(this.R.cap(w.arc, true) - cap)) > 0.7);
  }

  _changementVoie(v, h) {
    const a = this.R.arcs[v.arc];
    const cible = this.R.decalageVoie(v.arc, v.voie);
    v.lat += Math.max(-h * 1.2, Math.min(h * 1.2, cible - v.lat));
    v.cooldownVoie -= h;
    if (a.voies < 2 || v.cooldownVoie > 0 || v.etat !== "route" || v.arretsAVenir?.[0]?.i === v.iRoute) return;
    const avantLent = v.gap < 25 && (v.v < 2 || v.gap < v.v * 1.5);
    if (!avantLent) return;
    const autre = v.voie === 0 ? 1 : 0;
    const l = this._voies.get(v.arc * 4 + autre) || [];
    const ok = l.every((w) => {
      const d = w.s - v.s;
      if (d > 0) return d - (w.long + v.long) / 2 > Math.max(6, v.v * 1.0);
      return -d - (w.long + v.long) / 2 > Math.max(6, w.v * 1.2);
    });
    if (ok) {
      v.voieAvant = v.voie;
      v.voie = autre;
      v.cooldownVoie = 6;
      this._journal("changement_voie", { v: v.id });
    }
  }

  // ---------------------------------------- arrêts, clients, terminus
  _arrets(v, h) {
    if (v.etat === "arret") {
      v.attente += h;
      v.v = 0;
      if (v.role === "ligne") {
        const arret = this.arrets.get(v.arretActuel);
        v.minuterie -= h;
        if (v.minuterie <= 0) {
          // Descente d'un passager à la fois, puis montée.
          const descend = v.passagers.find((p) => p.descendA === v.arretActuel || (v.terminusAtteint && p.descendA !== undefined));
          if (descend) {
            v.passagers.splice(v.passagers.indexOf(descend), 1);
            this._descendre(descend, v, arret);
            v.minuterie = 1.1;
            return;
          }
          const monte = arret && [...arret.attente].find((p) => p.ligne === v.ligne);
          if (monte && v.passagers.length < v.capacite) {
            arret.attente.delete(monte);
            monte.etat = "aBord"; monte.vehicule = v.id;
            const autres = this.lignes.find((l) => l.id === v.ligne).arrets.map((s) => s.id).filter((id) => id !== v.arretActuel);
            monte.descendA = monte.destinationArret || autres[Math.floor(this.rnd() * autres.length)];
            v.passagers.push(monte);
            this._journal("montee", { v: v.id, p: monte.id, arret: v.arretActuel });
            v.minuterie = 1.4;
            return;
          }
          if (v.attente > (v.terminusAtteint ? 20 : 6)) {
            this._journal("depart_arret", { v: v.id, arret: v.arretActuel });
            v.etat = "route"; v.attente = 0;
            if (v.terminusAtteint) this._repartir(v);
          }
        }
      } else if (v.minuterie !== undefined) {
        v.minuterie -= h;
        if (v.minuterie <= 0) { v.etat = "route"; v.attente = 0; v.minuterie = undefined; }
      }
      return;
    }
    if (v.v > 0.4) return;
    const avant = v.s + v.long / 2;
    if (v.role === "ligne" && this._arcSuivant(v) < 0 && this.R.arcs[v.arc].long - avant < 8) {
      this._terminus(v);
      return;
    }
    // Arrêt de bus atteint ?
    if (v.arretsAVenir?.length) {
      const st = v.arretsAVenir[0];
      if (st.i === v.iRoute && Math.abs(avant - (st.s + v.long / 2)) < 3) {
        v.arretsAVenir.shift();
        v.etat = "arret"; v.arretActuel = st.id; v.minuterie = 1.5; v.attente = 0;
        this._journal("arrivee_arret", { v: v.id, arret: st.id });
      }
    }
    // Client atteint (taxi, minibus, moto).
    if (v.client && v.clientArc === v.arc && Math.abs(v.s - v.clientS) < 4) {
      const p = v.client;
      v.client = null;
      p.etat = "aBord"; p.vehicule = v.id;
      v.passagers.push(p);
      v.etat = "arret"; v.minuterie = 2.5; v.attente = 0;
      this._journal("prise_en_charge", { v: v.id, p: p.id });
      // Aller à la destination du client.
      const dest = p.destination ?? this._noeudAleatoireLoin(v, 300, 1500);
      if (!this._allerVers(v, dest)) this._nouvelleDestination(v);
    }
  }

  _noeudAleatoireLoin(v, dmin, dmax) {
    const R = this.R;
    const a = R.noeuds[R.arcs[v.arc].vers];
    for (let k = 0; k < 40; k++) {
      const n = R.noeuds[Math.floor(this.rnd() * R.noeuds.length)];
      const d = Math.hypot(n.x - a.x, n.z - a.z);
      if (d > dmin && d < dmax && n.entrants.length) return n.id;
    }
    return R.arcs[v.arc].vers;
  }

  _finItineraire(v) {
    const a = this.R.arcs[v.arc];
    // Déposer les passagers (taxis, motos).
    if (v.passagers.length) {
      for (const p of v.passagers) this._descendre(p, v, null);
      this._journal("depose", { v: v.id, n: v.passagers.length });
      v.passagers = [];
      v.etat = "arret"; v.minuterie = 2; v.v = 0;
      v.s = a.long - v.long / 2;
    }
    if (v.joueurABord) { v.arriveeJoueur = true; v.v = 0; return; }   // le joueur descend (géré par le jeu)
    if (!this.auto || this.rnd() < 0.85) {
      if (this._nouvelleDestination(v)) return;
    }
    this._retirer(v, "arrivee");
  }

  _terminus(v) {
    if (v.terminusAtteint || v.etat === "arret") return;
    v.terminusAtteint = true;
    v.etat = "arret"; v.minuterie = 1.5; v.attente = 0;
    for (const p of v.passagers) this._descendre(p, v, null);
    v.passagers = [];
    this._journal("terminus", { v: v.id, ligne: v.ligne });
  }

  _repartir(v) {
    const ligne = this.lignes.find((l) => l.id === v.ligne);
    v.sens = 1 - v.sens;
    v.terminusAtteint = false;
    const chemin = ligne.chemins[v.sens];
    // Rejoindre le début du chemin retour (demi-tour au terminus).
    const debut = this.R.arcs[chemin[0]];
    const lien = this.R.arcs[v.arc].vers === debut.de ? [] : this.R.itineraire(this.R.arcs[v.arc].vers, debut.de) || [];
    v.route = [v.arc, ...lien, ...chemin];
    v.iRoute = 0;
    v.decalageRoute = -(1 + lien.length);
    this._prochainsArrets(v);
    this._journal("demi_tour", { v: v.id, ligne: v.ligne });
  }

  _retirer(v, raison) {
    const i = this.vehicules.indexOf(v);
    if (i >= 0) this.vehicules.splice(i, 1);
    v.retire = true;
    for (const set of this.engages.values()) set.delete(v);
    for (const p of v.passagers) this._descendre(p, v, null);
    this._journal("retrait", { v: v.id, raison });
  }

  // -------------------------------------------------------------- piétons
  _descendre(p, v, arret) {
    p.etat = "marche"; p.vehicule = null; p.ligne = null; p.descendA = undefined;
    const a = this.R.arcs[v.arc];
    p.arc = v.arc; p.s = Math.max(0, Math.min(a.long, v.s)); p.cote = 1; p.dir = this.rnd() < 0.5 ? 1 : -1;
    p.attente = 0;
    this._journal("descente", { v: v.id, p: p.id, arret: arret?.id ?? null });
  }

  _pietons(h) {
    const R = this.R;
    for (const p of this.pietons) {
      if (p.etat === "aBord") {
        const v = this.vehicules.find((w) => w.id === p.vehicule);
        if (v) { p.x = v.x; p.z = v.z; p.cap = v.cap; } else p.etat = "marche";
        continue;
      }
      const a = R.arcs[p.arc];
      p.attente += h;
      if (p.etat === "marche") {
        p.s += p.v * p.dir * h;
        // Passage piéton : traverser parfois.
        for (const tr of a.traversees) {
          if (Math.abs(p.s - tr.s) < 0.8 && p.vers !== tr.id && this.rnd() < 0.5) {
            p.etat = "attenteTraversee"; p.traversee = tr.id; p.s = tr.s; p.attente = 0;
            p.vers = tr.id;
            break;
          }
        }
        // Arrêt de bus proche : attendre un bus.
        if (p.etat === "marche" && this.lignes.length && this.rnd() < h * 0.02) {
          for (const arret of this.arrets.values()) {
            if (Math.hypot(arret.x - p.x, arret.z - p.z) < 40) {
              p.etat = "attenteBus"; p.arret = arret.id; p.ligne = arret.lignes[0]; p.attente = 0;
              arret.attente.add(p);
              const q = R.arcProche(arret.x, arret.z);
              if (q) { p.arc = q.arc; p.s = q.s; p.cote = 1; }
              break;
            }
          }
        }
        // Appeler un taxi ou une moto (axes principaux surtout).
        if (p.etat === "marche" && this.rnd() < h * (a.rang >= 2 ? 0.006 : 0.002)) {
          p.etat = this.rnd() < 0.5 ? "attenteMoto" : "attenteTaxi"; p.attente = 0;
        }
        if (p.s < 0 || p.s > a.long) this._carrefourPieton(p);
      } else if (p.etat === "attenteTraversee") {
        if (this._peutTraverser(p)) { p.etat = "traverse"; p.progression = 0; p.attente = 0; }
        else if (p.attente > 120) { p.etat = "marche"; p.traversee = null; }
      } else if (p.etat === "traverse") {
        const c = this.passages[p.traversee];
        p.progression += (p.v * 1.1 * h) / c.largeur;
        if (p.progression >= 1) {
          p.cote = -p.cote; p.etat = "marche"; p.traversee = null; p.progression = 0;
          this._journal("traversee", { p: p.id, passage: c.id });
        }
      } else if (p.etat === "attenteBus") {
        if (p.attente > 600) { this.arrets.get(p.arret)?.attente.delete(p); p.etat = "marche"; }
      } else if (p.etat === "attenteTaxi" || p.etat === "attenteMoto") {
        this._appelerVehicule(p);
        if (p.attente > 120 && !p.reserve) p.etat = "marche";
      }
      this._positionPieton(p);
    }
    if (this.auto) {
      const cible = this.ciblePietons();
      while (this.pietons.length < cible) {
        const a = R.arcs[Math.floor(this.rnd() * R.arcs.length)];
        this.ajouterPieton(a.id, this.rnd() * a.long, this.rnd() < 0.5 ? 1 : -1, { dir: this.rnd() < 0.5 ? 1 : -1 });
      }
      if (this.pietons.length > cible * 1.15 + (this.joueur ? this.bulle.pietons : 0)) {
        const p = this.pietons.find((p) => p.etat === "marche" && this._loinDuJoueur(p, 150));
        if (p) this.pietons.splice(this.pietons.indexOf(p), 1);
      }
    }
  }

  _carrefourPieton(p) {
    const R = this.R;
    const a = R.arcs[p.arc];
    const n = R.noeuds[p.s < 0 ? a.de : a.vers];
    const choix = n.sortants.filter((e) => e !== p.arc && e !== a.jumeau);
    const e = choix.length ? choix[Math.floor(this.rnd() * choix.length)] : (a.jumeau >= 0 ? a.jumeau : p.arc);
    if (!choix.length) { p.dir = -p.dir; p.s = Math.max(0, Math.min(a.long, p.s)); return; }
    p.arc = e; p.s = 0.5; p.dir = 1; p.vers = null;
  }

  /** Un piéton peut-il s'engager sur le passage ? */
  _peutTraverser(p) {
    const c = this.passages[p.traversee];
    for (const { arc, s } of c.arcs) {
      const a = this.R.arcs[arc];
      // Carrefour à feux : traverser quand les véhicules de cet axe ont le rouge assez longtemps.
      if (this.R.noeuds[a.vers].feu !== undefined && s > a.long - 15) {
        if (this.etatFeu(arc) !== "rouge" || this.avantVert(arc) < 8) return false;
      }
      // Aucun véhicule trop proche (ni déjà sur le passage). Après 15 s d'attente, le piéton
      // s'engage dès que les véhicules peuvent encore s'arrêter sans freinage brutal.
      const patient = p.attente < 15;
      for (let k = 0; k < a.voies; k++) {
        for (const w of this._voies?.get(arc * 4 + k) || []) {
          const d = s - (w.s + w.long / 2);
          const marge = patient ? Math.max(12, w.v * 4) : Math.max(8, (w.v * w.v) / (2 * 1.8) + 4);
          if (w.v < 0.5 && d > 1) continue;                  // véhicule déjà arrêté devant le passage : il cède
          if (d > -w.long - 2 && d < marge) return false;
        }
      }
    }
    return true;
  }

  /** Arc (sens de circulation) longeant le trottoir où se trouve le piéton, et abscisse. */
  _bordure(p) {
    const a = this.R.arcs[p.arc];
    if (p.cote === 1 || a.jumeau < 0) return [p.arc, p.s];
    return [a.jumeau, a.long - p.s];
  }

  /** Un piéton qui attend un taxi ou une moto en réserve un qui arrive derrière lui. */
  _appelerVehicule(p) {
    if (p.reserve) return;
    const type = p.etat === "attenteMoto" ? ["moto"] : ["taxi", "minibus"];
    let best = null;
    for (const v of this.vehicules) {
      if (!type.includes(v.type) || v.role === "ligne" || v.client || v.etat !== "route" || v.joueurABord) continue;
      if (v.passagers.length >= v.capacite) continue;
      const [arcP, sP] = this._bordure(p);
      if (v.arc !== arcP) continue;                     // même sens de circulation que le côté du client
      const d = sP - v.s;
      if (d > v.v * v.v / (2 * v.b) + 6 && d < 150 && (!best || d < best.d)) best = { v, d, arcP, sP };
    }
    if (best) {
      best.v.client = p;
      best.v.clientArc = best.arcP;
      best.v.clientS = best.sP;
      p.reserve = best.v.id;
      this._journal("reservation", { v: best.v.id, p: p.id });
    }
  }

  // ------------------------------------------------ apparition / disparition
  _equilibrer() {
    const R = this.R;
    const cible = this.cibleVehicules();
    let n = 0;
    while (this.vehicules.filter((v) => v.role !== "ligne").length < cible && n++ < 6) {
      let u = this.rnd();
      let type = "voiture";
      for (const [t, p] of MELANGE) { if ((u -= p) <= 0) { type = t; break; } }
      const candidats = R.arcs;
      const a = candidats[Math.floor(this.rnd() * candidats.length)];
      if (a.long < 20 || (type !== "moto" && type !== "voiture" && a.rang < 2 && this.rnd() < 0.7)) continue;
      const v = this._creerVehicule(type, a.id, 3 + this.rnd() * (a.long - 6), Math.floor(this.rnd() * a.voies));
      if (!v) continue;
      v.v = a.vmax * 0.5;
      if (!this._nouvelleDestination(v, 300)) this._retirer(v, "sans_itineraire");
    }
    if (this.vehicules.length > cible * 1.15 + this.lignes.length * 4 + (this.joueur ? this.bulle.vehicules : 0)) {
      const v = this.vehicules.find((v) => v.role !== "ligne" && !v.passagers.length && !v.joueurABord && v.etat === "route" && this._loinDuJoueur(v, 250));
      if (v) this._retirer(v, "densite");
    }
  }

  /** Arcs dont le milieu est entre rmin et rmax du joueur (cache 2 s). */
  _arcsAutour(rmin, rmax) {
    const j = this.joueur;
    const c = this._cacheAutour;
    if (c && c.rmin === rmin && c.rmax === rmax && Math.hypot(c.x - j.x, c.z - j.z) < 30 && this.t - c.t < 2) return c.l;
    const l = this.R.arcs.filter((a) => {
      const m = this.R.point(a.id, a.long / 2);
      const d = Math.hypot(m.x - j.x, m.z - j.z);
      return d > rmin && d < rmax && a.long > 15;
    });
    this._cacheAutour = { x: j.x, z: j.z, t: this.t, rmin, rmax, l };
    return l;
  }

  _autourJoueur() {
    if (!this.joueur || !this.bulle) return;
    const j = this.joueur, f = FACTEUR_NIVEAU[this.niveau] * (0.4 + 0.6 * profilHoraire(this.heure));
    const proches = this.vehicules.filter((v) => Math.hypot(v.x - j.x, v.z - j.z) < 300).length;
    if (proches < this.bulle.vehicules * f) {
      const arcs = this._arcsAutour(140, 300);
      if (arcs.length) {
        const a = arcs[Math.floor(this.rnd() * arcs.length)];
        let u = this.rnd(), type = "voiture";
        for (const [t, p] of MELANGE) { if ((u -= p) <= 0) { type = t; break; } }
        if (!(type !== "moto" && type !== "voiture" && a.rang < 2)) {
          const v = this._creerVehicule(type, a.id, 3 + this.rnd() * (a.long - 6), Math.floor(this.rnd() * a.voies));
          if (v) { v.v = a.vmax * 0.6; if (!this._nouvelleDestination(v, 300)) this._retirer(v, "sans_itineraire"); }
        }
      }
    }
    const pp = this.pietons.filter((p) => Math.hypot(p.x - j.x, p.z - j.z) < 150).length;
    if (pp < this.bulle.pietons * f) {
      const arcs = this._arcsAutour(25, 150);
      if (arcs.length) {
        const a = arcs[Math.floor(this.rnd() * arcs.length)];
        this.ajouterPieton(a.id, this.rnd() * a.long, this.rnd() < 0.5 ? 1 : -1, { dir: this.rnd() < 0.5 ? 1 : -1 });
      }
    }
  }

  // -------------------------------------------------------------- mesures
  statistiques() {
    const R = this.R;
    const maj = this.vehicules.filter((v) => MAJEURES.has(R.arcs[v.arc].classe) && v.etat === "route");
    const moy = (l) => (l.length ? l.reduce((s, v) => s + v.v, 0) / l.length : 0);
    return {
      t: this.t, vehicules: this.vehicules.length, pietons: this.pietons.length,
      vitesseMoyenne: moy(this.vehicules), vitesseAxes: moy(maj),
      arretes: this.vehicules.filter((v) => v.v < 0.5).length,
      accidents: this.vehicules.filter((v) => v.etat === "accident").length,
    };
  }

  /** Horaires simulés : prochain passage estimé à chaque arrêt d'une ligne. */
  horaires(ligneId) {
    const l = this.lignes.find((x) => x.id === ligneId);
    if (!l) return [];
    const bus = this.vehicules.filter((v) => v.ligne === ligneId);
    return l.arrets.map((st) => {
      const arret = this.arrets.get(st.id);
      let mieux = Infinity;
      for (const v of bus) {
        const pos = st.pos[v.sens];
        if (!pos) continue;
        // Distance restante le long de l'itinéraire jusqu'à l'arrêt.
        const iCible = pos.i - (v.decalageRoute || 0);
        if (iCible < v.iRoute) continue;
        let d = -v.s;
        for (let k = v.iRoute; k < iCible && k < v.route.length; k++) d += this.R.arcs[v.route[k]].long;
        d += pos.s;
        if (d >= 0) mieux = Math.min(mieux, d / 7 + (v.etat === "arret" ? 10 : 0));
      }
      return { id: st.id, nom: arret.nom, reel: arret.reel, attente: arret.attente.size, prochain: mieux };
    });
  }
}

export { Reseau };

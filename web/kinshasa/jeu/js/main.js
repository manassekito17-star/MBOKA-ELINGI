// Kinshasa 3D — mode jeu (« GTA ») : point d'entrée.
// Zone jouable réelle chargée par tuiles ; simulation urbaine (circulation,
// transports publics, piétons) ; personnage personnalisable ; véhicules
// physiques ; caméras ; cycle jour/nuit ; météo ; son ; sauvegarde.
import * as THREE from "three";
import { Physique } from "./physique.js";
import { Monde } from "./monde.js";
import { Joueur } from "./joueur.js";
import { Vehicule, TYPES, PLACES, quatY } from "./vehicules.js";
import { Environnement, METEOS } from "./environnement.js";
import { Audio } from "./audio.js";
import { Controles, pleinEcranHorizontal } from "./controles.js";
import { chargerPersonnages, creerPersonnage, apparenceAleatoire } from "./personnages.js";
import { tourEchangeur, monumentsCentre } from "./monuments.js";
import { Projection, Trajet } from "./geo.js";
import { Circulation, NIVEAUX, profilHoraire } from "./simulation/circulation.js";
import { RenduCirculation } from "./simulation/rendu.js";
import { editeurPersonnage, panneauTransports, panneauZones, chargerApparence } from "./interface.js";
import * as Sauvegarde from "./sauvegarde.js";
import { ZONES, ZONE_DEFAUT } from "./zones.js";
import { Materiaux } from "./materiaux.js";
import { creerPostTraitement } from "./posttraitement.js";
import { HUD, fc } from "./hud.js";
import { Carte, categorie } from "./minicarte.js";
import { creerMenu } from "./menu.js";
import { GPS } from "./gps.js";
import { Missions } from "./missions.js";
import { appliquerTactile, editerTactile } from "./tactile.js";
import { nomTouche } from "./controles.js";
import { chargerRegistre, BatimentsRemarquables, aplanirRelief } from "./batiments.js";

const params = new URLSearchParams(location.search);
const mobile = matchMedia("(pointer: coarse)").matches;
// Réglages du joueur (menu Paramètres), enregistrés dans le navigateur.
const CLE_REGLAGES = "kinshasa3d.reglages.v1";
const reglages = { volume: 0.6, ambiance: 1, fov: 65, ombres: true, tailleBoutons: 58, positions: {}, qualite: null };
try { Object.assign(reglages, JSON.parse(localStorage.getItem(CLE_REGLAGES) || "{}")); } catch { /* stockage indisponible */ }
const enregistrerReglages = () => { try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(reglages)); } catch { /* ignoré */ } };
const QUALITE = params.get("qualite") || reglages.qualite || (mobile ? "basse" : "moyenne");
const ZONE = [params.get("zone"), params.has("lat") ? null : Sauvegarde.derniereZone(), ZONE_DEFAUT].find((z) => z && ZONES[z]);
const CONFIG = ZONES[ZONE];
const $ = (id) => document.getElementById(id);
const CAMERAS_PIED = ["3e personne", "1re personne", "aérienne", "libre"];
const CAMERAS_VEHICULE = ["poursuite", "intérieure", "aérienne"];

const etat = {
  mode: "pied",               // pied | conduite | passager
  vehicule: null,             // véhicule du joueur (physique) qu'il conduit
  simV: null,                 // véhicule simulé (bus, moto-taxi, taxi) où il est passager
  descendreAuProchain: false,
  camPied: 0, camVeh: 0,
  argent: 20000, banque: 100000, msgT: 0, lieuProche: null,
  pause: false,
  stats: { pied: 0, vehicule: 0, temps: 0 },
};
let hud = null;

/** Notification de jeu (fil en haut à gauche). */
function message(t, duree = 3.5, type = "") {
  if (hud) hud.notifier(t, { duree: Math.min(9, duree + 1.5), type });
}

/** Tracé d'un axe nommé (points triés le long de sa direction principale). */
function traceAxe(reseau, nom) {
  const pts = [];
  for (const r of reseau) if (r.n === nom) for (let i = 0; i < r.p.length; i += 2) pts.push([r.p[i], r.p[i + 1]]);
  if (pts.length < 4) return null;
  let a = pts[0], b = pts[0], dmax = 0;
  for (const p of pts) for (const q of pts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > dmax) { dmax = d; a = p; b = q; } }
  const ux = (b[0] - a[0]) / dmax, uz = (b[1] - a[1]) / dmax;
  pts.sort((p, q) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uz - ((q[0] - a[0]) * ux + (q[1] - a[1]) * uz));
  return pts.flat();
}

async function demarrer() {
  const progression = (t, r) => { $("chargement-texte").textContent = t; $("chargement-barre").style.width = `${r * 100}%`; };
  progression("Moteur physique…", 0.05);
  const physique = await Physique.creer();

  const renderer = new THREE.WebGLRenderer({ antialias: QUALITE !== "basse", powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITE === "haute" ? 2 : 1.25));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = QUALITE !== "basse" && reglages.ombres !== false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $("jeu").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  let post = null;   // post-traitement (qualité haute)
  const camera = new THREE.PerspectiveCamera(reglages.fov, innerWidth / innerHeight, 0.15, 5000);
  scene.add(camera);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    post?.taille(innerWidth, innerHeight);
  });

  $("chargement-zone").textContent = `Zone jouable : ${CONFIG.nom} (${CONFIG.description}, données réelles)`;
  document.title = `Kinshasa 3D — ${CONFIG.court}`;
  progression(`Carte réelle de ${CONFIG.court}…`, 0.15);
  // Matériaux photographiques (désactivables : ?rendu=simple, pour comparer avec l'ancien rendu).
  const materiaux = params.get("rendu") === "simple" ? null : new Materiaux(renderer, QUALITE);
  if (materiaux) await materiaux.charger();
  const monde = new Monde(scene, physique, `zones/${ZONE}/`, QUALITE, materiaux);
  // Bâtiments remarquables (modèles individuels) : registre, terrassement du relief sous leurs sites,
  // emprises retirées des tuiles génériques.
  const registre = await chargerRegistre();
  let remarquables = null;
  monde.preparerRelief = (man, relief) => {
    remarquables = new BatimentsRemarquables(registre, ZONE, man);
    aplanirRelief(relief, remarquables.aplanissements());
  };
  const manifest = await monde.charger();
  monde.exclusions = remarquables.exclusions();
  const transports = await (await fetch(`zones/${ZONE}/transports.json`)).json().catch(() => null);
  const lieuxZone = await (await fetch(`zones/${ZONE}/lieux.json`)).json().catch(() => []);
  const eauZone = await (await fetch(`zones/${ZONE}/eau.json`)).json().catch(() => []);
  const proj = new Projection(manifest.origine[0], manifest.origine[1]);
  $("attribution").textContent = manifest.attribution + " · Transports : " + (transports?.source || "—") + " · Personnages : Quaternius (CC0) · Textures : Poly Haven (CC0)";

  progression("Personnages et animations…", 0.3);
  await chargerPersonnages();

  const env = new Environnement(scene, renderer, QUALITE);
  const audio = new Audio();
  const ctl = new Controles(renderer.domElement);
  if (CONFIG.monument === "echangeur") tourEchangeur(scene, physique, monde.hauteur(0, 0));
  const modeles = new Set(remarquables.liste.filter((b) => b.modele).map((b) => b.id));
  const monuments = CONFIG.monument === "centre" ? monumentsCentre(scene, physique, monde, manifest.monuments, modeles) : {};
  progression("Bâtiments remarquables…", 0.35);
  await remarquables.construire(scene, physique, monde, QUALITE);

  // --- Sauvegarde et point de départ.
  const sauv = params.has("nouveau") ? null : Sauvegarde.charger(ZONE);
  if (sauv) {
    env.heure = sauv.heure; env.meteo = sauv.meteo; etat.argent = sauv.argent; etat.banque = sauv.banque;
    Object.assign(etat.stats, sauv.stats);
  }
  audio.regler(reglages.volume, reglages.ambiance);
  if (reglages.ombres === false) env.soleil.castShadow = false;
  let depart = { ...CONFIG.depart };
  const lieuDemande = remarquables.liste.find((b) => b.id === params.get("lieu"));   // « Y aller » depuis une fiche
  if (params.has("lat") && params.has("lon")) depart = proj.versLocal(+params.get("lon"), +params.get("lat"));
  else if (lieuDemande) depart = { ...lieuDemande.entreeZone };
  else if (sauv) depart = sauv.joueur;
  const limX = (manifest.demi_x ?? manifest.demi) - 20, limZ = (manifest.demi_z ?? manifest.demi) - 20;
  depart.x = Math.max(-limX, Math.min(limX, depart.x));
  depart.z = Math.max(-limZ, Math.min(limZ, depart.z));
  const surRoute = pointRoute(monde.reseau, depart.x, depart.z, ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]);
  const trottoir = surRoute.largeur / 2 + 2.2;
  // « Y aller » : on part de l'entrée du bâtiment ; si aucune rue publique n'est à moins de 40 m (esplanade), on y reste.
  const routeLoin = lieuDemande && Math.hypot(surRoute.x - depart.x, surRoute.z - depart.z) > 40;
  if ((!sauv || params.has("lat") || lieuDemande) && !routeLoin) depart = { x: surRoute.x + surRoute.nx * trottoir, z: surRoute.z + surRoute.nz * trottoir };

  // --- Simulation urbaine (circulation, bus, minibus, motos-taxis, piétons).
  progression("Simulation de la circulation…", 0.4);
  const lignesSimulees = [];
  for (const l of CONFIG.lignesSimulees) {
    const trace = traceAxe(monde.reseau, l.axe);
    if (trace) lignesSimulees.push({ ...l, trace, arrets: [] });
  }
  const sim = new Circulation(monde.reseau, transports, {
    heure: env.heure, niveau: sauv?.niveau ?? 1, busParLigne: 4, lignesSimulees,
    cibleVehicules: QUALITE === "basse" ? 200 : 300, ciblePietons: QUALITE === "basse" ? 160 : 260,
  });
  sim.definirJoueur(depart.x, depart.z, false);
  for (let i = 0; i < 90; i++) sim.pas(1);   // la ville « tourne » déjà quand le joueur arrive
  const rendu = new RenduCirculation(scene, physique, sim, monde, QUALITE);

  progression("Chargement des quartiers autour de vous…", 0.6);
  monde.mettreAJour(depart.x, depart.z);
  for (let i = 0; i < 100 && monde.enCours.size; i++) await new Promise((r) => setTimeout(r, 50));
  physique.pas(1 / 60);
  const yDepart = (physique.solSous(depart.x, 300, depart.z) ?? monde.hauteur(depart.x, depart.z)) + 0.1;
  const joueur = new Joueur(physique, scene, depart.x, yDepart, depart.z, chargerApparence());
  // « Y aller » : on arrive face au bâtiment demandé.
  if (lieuDemande) { const bx = remarquables.boite(lieuDemande); ctl.lacet = Math.atan2(-(bx.x - depart.x), -(bx.z - depart.z)); }

  // --- Véhicules du joueur (stationnés le long de la rue, ou restaurés).
  const flotte = [];
  if (sauv && sauv.vehicules.length) {
    for (const v of sauv.vehicules) if (TYPES[v.type]) {
      const ve = new Vehicule(physique, scene, v.type, v.x, v.y, v.z, v.a, v.couleur);
      ve.carburant = Number.isFinite(v.c) ? v.c : 1;
      if (Number.isFinite(v.odo)) ve.odometre = v.odo;
      if (Number.isFinite(v.s)) ve.sante = Math.max(0, Math.min(100, v.s));
      flotte.push(ve);
    }
  } else {
    const route = new Trajet(surRoute.route.p);
    // Garés en file derrière le point de départ (le plus proche à ~10 m), pour ne pas boucher le passage.
    let d = Math.max(0, surRoute.d - 70);
    for (const type of ["taxi", "voiture", "moto", "minibus", "camion", "bus"]) {
      const p = route.point(Math.min(route.longueur, d));
      const ang = Math.atan2(-p.dx, -p.dz);
      const cote = surRoute.largeur / 2 - TYPES[type].w / 2 - 0.3;
      const x = p.x - p.dz * cote, z = p.z + p.dx * cote;
      flotte.push(new Vehicule(physique, scene, type, x, monde.hauteur(x, z), z, ang));
      d += TYPES[type].l + 4;
    }
  }

  // --- Panneaux.
  if (sauv) joueur.sante = sauv.sante;
  // Panneaux existants (éditeur, lignes, zones) : affichés dans le menu pause.
  const appliquerApparence = (ap) => { joueur.changerApparence(ap); message("Personnage mis à jour.", 3, "succes"); };

  // --- Véhicules du joueur : monter / descendre (F).
  function entrerSortir(force = false) {
    if (etat.mode === "passager") return;
    if (etat.mode === "pied") {
      const p = joueur.position();
      let meilleur = null, dmin = 4.5;
      for (const v of flotte) {
        const q = v.position();
        const d = Math.hypot(q.x - p.x, q.z - p.z) - TYPES[v.type].l / 4;
        if (d < dmin) { dmin = d; meilleur = v; }
      }
      if (!meilleur) return message("Aucun de vos véhicules à proximité (moins de 4 m). Pour un bus ou une moto-taxi : touche E.");
      etat.mode = "conduite";
      etat.vehicule = meilleur;
      meilleur.freinAMain = false;
      joueur.monter(meilleur.objet, PLACES[meilleur.type][0], true);
      ctl.lacet = 0;
      etat.camVeh = 0;
      message(mobile
        ? `${TYPES[meilleur.type].nom} — joystick : avancer, reculer, tourner · ■ frein · F : descendre · ◎ : caméra`
        : `${TYPES[meilleur.type].nom} — Z/W accélérer, S freiner/reculer, Q/A D tourner, F descendre, C ou V caméra`);
    } else {
      const v = etat.vehicule;
      if (!force && Math.abs(v.vitesse()) > 3) return message("Ralentissez pour descendre.");
      const p = v.position(), a = v.angle();
      const cote = TYPES[v.type].w / 2 + 0.8;
      v.freinAMain = true;
      joueur.descendre(p.x - Math.cos(a) * cote, p.y + 0.3, p.z + Math.sin(a) * cote, a);
      etat.mode = "pied";
      etat.vehicule = null;
      v.objet.visible = true;
      tableau.visible = false;
      message("Véhicule stationné (frein à main serré). Il restera ici, même après sauvegarde.");
    }
  }

  // --- Transports publics : monter comme passager (bus à l'arrêt, moto-taxi, taxi).
  function prendreTransport() {
    const p = joueur.position();
    let best = null;
    for (const v of sim.vehicules) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d > (v.type === "bus" ? 9 : 5.5)) continue;
      const libre = v.passagers.length < v.capacite;
      const ok = v.role === "ligne" ? v.etat === "arret" && libre
        : ["moto", "taxi"].includes(v.type) && libre && !v.client && v.v < 3 && v.etat !== "accident";
      if (ok && (!best || d < best.d)) best = { v, d };
    }
    if (!best) return false;
    const v = best.v;
    const prix = v.role === "ligne" ? 500 : v.type === "moto" ? 1000 : 1500;
    if (etat.argent < prix) { message(`Pas assez d'argent (${prix} FC).`); return true; }
    etat.argent -= prix;
    v.joueurABord = true;
    etat.mode = "passager";
    etat.simV = v;
    etat.descendreAuProchain = false;
    etat.camVeh = 0;
    ctl.lacet = 0;
    const objet = rendu.objetVehicule(v.id);
    const places = PLACES[v.type];
    joueur.monter(objet, places[Math.min(places.length - 1, v.type === "moto" ? 1 : 2)], false);
    if (v.role === "ligne") {
      const l = sim.lignes.find((x) => x.id === v.ligne);
      message(`Ligne ${l.ref} — ${l.nom} : ${prix} FC. Touche E pour descendre au prochain arrêt.`, 6);
    } else {
      const dest = sim._noeudAleatoireLoin(v, 500, 1400);
      sim._allerVers(v, dest);
      const nom = sim.R.arcs.find((a) => a.vers === dest && a.nom)?.nom || "un quartier voisin";
      message(`${v.type === "moto" ? "Moto-taxi (wewa)" : "Taxi collectif"} : ${prix} FC, direction ${nom}. E pour descendre.`, 6);
    }
    return true;
  }

  function descendreTransport() {
    const v = etat.simV;
    v.joueurABord = false;
    v.arriveeJoueur = false;
    const a = sim.R.arcs[v.arc];
    const q = sim.R.point(v.arc, v.s, a.largeur / 2 + 1.8);
    const y = (physique.solSous(q.x, 300, q.z) ?? monde.hauteur(q.x, q.z)) + 0.2;
    joueur.descendre(q.x, y, q.z, -v.cap);
    etat.mode = "pied";
    etat.simV = null;
    tableau.visible = false;
    message("Vous êtes descendu(e).");
  }

  // --- Missions, GPS, carte (systèmes réels reliés à l'interface) -------------------
  const missions = new Missions(lieuxZone, Math.floor(Math.random() * 1e6));
  if (sauv) Object.assign(missions.stats, sauv.missions);
  const gps = new GPS(sim.R);
  const carte = new Carte(monde, sim, lieuxZone, eauZone);
  carte.remarquables = remarquables.liste;
  const hopitaux = lieuxZone.filter((l) => categorie(l[3]) === "hopital");
  const remorquages = [];          // dépanneuse : { v, t (s restantes) }
  let clientPnj = null;            // client ou malade d'une mission (personnage visible)

  const positionJoueur = () => (etat.mode === "conduite" ? etat.vehicule.position() : etat.mode === "passager" ? { x: etat.simV.x, y: 0, z: etat.simV.z } : joueur.position());
  const capJoueur = () => (etat.mode === "conduite" ? etat.vehicule.angle() : etat.mode === "passager" ? -etat.simV.cap : joueur.cap);
  const vehiculeProche = (rayon) => {
    const p = joueur.position();
    let best = null, dmin = rayon;
    for (const v of flotte) { const q = v.position(), d = Math.hypot(q.x - p.x, q.z - p.z); if (d < dmin) { dmin = d; best = v; } }
    return best;
  };
  const payer = (prix, quoi) => {
    if (etat.argent < prix) { message(`Pas assez d'argent liquide (${fc(prix)} pour ${quoi}). Retirez de l'argent à une banque.`, 4, "alerte"); return false; }
    etat.argent -= prix;
    return true;
  };

  /** Actions réellement possibles autour du joueur (menu d'interaction). */
  function actionsDisponibles() {
    const A = [];
    const p = positionJoueur();
    const toucheF = nomTouche(ctl.carte.vehicule[0] || "KeyF");
    if (etat.mode === "passager") {
      const v = etat.simV;
      A.push(v.role === "ligne"
        ? { texte: etat.descendreAuProchain ? "Vous descendrez au prochain arrêt" : "Descendre au prochain arrêt", faire: () => { etat.descendreAuProchain = true; message("Vous descendrez au prochain arrêt."); } }
        : { texte: "Demander au chauffeur de s'arrêter", faire: () => { v.route = v.route.slice(0, v.iRoute + 1); if (v.v < 1.5) descendreTransport(); else message("Le chauffeur s'arrête dès que possible…"); } });
      return A;
    }
    if (etat.mode === "pied") {
      const vp = vehiculeProche(4.5);
      if (vp) A.push({ texte: `Monter dans : ${TYPES[vp.type].nom}`, touche: toucheF, faire: entrerSortir });
      for (const v of sim.vehicules) {
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        if (v.role === "ligne" && v.etat === "arret" && d < 9 && v.passagers.length < v.capacite) {
          const l = sim.lignes.find((x) => x.id === v.ligne);
          A.push({ texte: `Monter dans le ${v.type} ligne ${l.ref}`, prix: 500, faire: prendreTransport }); break;
        }
        if (["moto", "taxi"].includes(v.type) && v.v < 3 && !v.client && v.passagers.length < v.capacite && d < 5.5 && v.etat !== "accident") {
          A.push({ texte: v.type === "moto" ? "Prendre la moto-taxi (wewa)" : "Prendre le taxi collectif", prix: v.type === "moto" ? 1000 : 1500, faire: prendreTransport }); break;
        }
      }
    }
    // Lieux réels proches (catégorie Overture / OSM).
    const l = etat.lieuProche;
    const vRavit = etat.vehicule || vehiculeProche(25);
    if (l) {
      const cat = categorie(l.k), k = l.k || "";
      if (cat === "station" && vRavit && vRavit.carburant < 0.99) {
        const prix = Math.max(2900, Math.round((1 - vRavit.carburant) * 60) * 2900);
        A.push({ texte: `Faire le plein : ${TYPES[vRavit.type].nom} (${l.n})`, prix, faire: () => { if (payer(prix, "le plein")) { vRavit.carburant = 1; message(`Plein fait à « ${l.n} ».`, 3, "succes"); } } });
      }
      if ((cat === "station" || /repair|garage|automotive|mechanic/.test(k)) && vRavit && vRavit.sante < 100) {
        A.push({ texte: `Réparer : ${TYPES[vRavit.type].nom}`, prix: 20000, faire: () => { if (payer(20000, "la réparation")) { vRavit.reparer(); message("Véhicule réparé (état 100 %).", 3, "succes"); } } });
      }
      if (etat.mode === "pied") {
        if (cat === "pharmacie" && joueur.sante < 100) A.push({ texte: `Acheter des médicaments (+40 santé) — ${l.n}`, prix: 3000, faire: () => { if (payer(3000, "les médicaments")) { joueur.soigner(40); message("Santé +40.", 3, "succes"); } } });
        if (cat === "hopital" && joueur.sante < 100) A.push({ texte: `Se faire soigner (santé 100 %) — ${l.n}`, prix: 10000, faire: () => { if (payer(10000, "les soins")) { joueur.soigner(100); message("Soigné(e) : santé 100 %.", 3, "succes"); } } });
        if (cat === "banque") {
          if (etat.banque >= 20000) A.push({ texte: `Distributeur : retirer ${fc(20000)} — ${l.n}`, faire: () => { etat.banque -= 20000; etat.argent += 20000; message(`Retrait de ${fc(20000)}. Solde : ${fc(etat.banque)}.`, 3, "succes"); } });
          if (etat.argent > 0) A.push({ texte: `Déposer tout l'argent liquide (${fc(etat.argent)})`, faire: () => { etat.banque += etat.argent; message(`Dépôt de ${fc(etat.argent)}. Solde : ${fc(etat.banque)}.`, 3, "succes"); etat.argent = 0; } });
        }
        if (cat === "manger") A.push({ texte: `Manger un plat (+15 santé, endurance au maximum) — ${l.n}`, prix: 5000, faire: () => { if (payer(5000, "le repas")) { joueur.soigner(15); joueur.endurance = 100; joueur.geste("Interact"); message("Poulet à la moambe : santé +15, endurance 100 %.", 3, "succes"); } } });
        if (cat === "commerce") A.push({ texte: `Acheter de l'eau et des arachides (endurance au maximum) — ${l.n}`, prix: 2000, faire: () => { if (payer(2000, "l'eau")) { joueur.endurance = 100; joueur.geste("Interact"); message("Endurance 100 %.", 3, "succes"); } } });
      }
    }
    if (etat.mode === "pied") {
      for (const a of sim.arrets.values()) if (Math.hypot(a.x - p.x, a.z - p.z) < 25) { A.push({ texte: `Horaires de l'arrêt « ${a.nom} »`, faire: () => menu.ouvrir("transports") }); break; }
    }
    // Bâtiment remarquable tout proche : fiche et vue du bâtiment.
    const rq = remarquables.plusProche(p.x, p.z, 30);
    if (rq && etat.mode !== "passager") {
      A.push({ texte: `Fiche : ${rq.b.nom_courant}`, faire: () => menu.ouvrir("lieux", rq.b.id) });
      A.push({ texte: `Regarder le bâtiment (${rq.b.nom_courant})`, faire: () => regarderBatiment(rq.b) });
    }
    return A.slice(0, 5);
  }

  /** Vue cinématique : la caméra tourne autour du bâtiment ; un mouvement rend la main. */
  let cinematique = null;
  function regarderBatiment(b) {
    const bx = remarquables.boite(b);
    const p = positionJoueur();
    cinematique = { b, bx, t: 0, duree: 14, y: monde.hauteur(bx.x, bx.z), a0: Math.atan2(p.z - bx.z, p.x - bx.x) };
    message(`${b.nom_courant} — bougez pour reprendre la main.`, 4, "info");
  }

  function interagir() {
    const a = hud.actionChoisie();
    if (a) { a.faire(); hud._cle = null; return; }
    message("Rien à proximité. Approchez-vous d'un véhicule, d'un arrêt, d'une station, d'une banque, d'une pharmacie…", 3);
  }

  /** Action propre au type de véhicule conduit. */
  function actionVehicule() {
    const v = etat.vehicule;
    if (!v) return;
    if (v.type === "police" || v.type === "ambulance") { v.basculerSirene(); message(v.sirene ? "Sirène et gyrophares allumés." : "Sirène éteinte."); return; }
    const type = { taxi: "taxi", minibus: "taxi", moto: "taxi", camion: "livraison", livraison: "livraison" }[v.type];
    if (!type) { message("Pas d'action particulière pour ce véhicule.", 2); return; }
    if (missions.active) { message("Une mission est déjà en cours (menu pause > Missions).", 3); return; }
    const p = v.position();
    const offre = missions.proposer(p.x, p.z, v.type).find((o) => o.type === type);
    if (offre) demarrerMission(offre); else message("Aucun client pour l'instant dans les environs.", 3);
  }

  function demarrerMission(offre) {
    const ok = missions.possible(offre, etat.vehicule?.type ?? null);
    if (!ok.ok) { message(ok.raison, 4, "alerte"); return; }
    const e = missions.demarrer(offre);
    guiderMission();
    message(`Mission : ${offre.titre} — ${fc(offre.recompense)} · ${Math.floor(offre.delai / 60)} min`, 5, "info");
    if (e.client) placerClient(e);
  }
  function guiderMission() { const e = missions.etapeCourante(); if (e) gps.definir(e.l[0], e.l[1], e.l[2]); }
  function abandonnerMission() { missions.abandonner(); retirerClient(); gps.effacer(); message("Mission abandonnée.", 3, "alerte"); }

  /** Client (ou malade) visible devant le lieu de prise en charge. */
  function placerClient(etape) {
    retirerClient();
    const [x, z] = etape.l;
    clientPnj = creerPersonnage(apparenceAleatoire(Math.round(x * 7 + z * 13)));
    clientPnj.objet.position.set(x, monde.hauteur(x, z), z);
    clientPnj.jouer("Idle", 0.2);
    scene.add(clientPnj.objet);
  }
  function retirerClient() { if (clientPnj) { scene.remove(clientPnj.objet); clientPnj.liberer?.(); clientPnj = null; } }

  /** Dépanneuse : le véhicule est livré près du joueur après 90 s de jeu (payant). */
  function remorquer(v) {
    if (!payer(15000, "la dépanneuse")) return;
    remorquages.push({ v, t: 90 });
    message(`Dépanneuse commandée : ${TYPES[v.type].nom} livré(e) dans 1 min 30 près de vous.`, 4, "info");
  }
  function livrerRemorquage(r) {
    const p = positionJoueur();
    const route = pointRoute(monde.reseau, p.x, p.z, ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]);
    const cote = route.largeur / 2 - TYPES[r.v.type].w / 2 - 0.3;
    const x = route.x + route.nx * cote, z = route.z + route.nz * cote;
    const ang = Math.atan2(route.nz, -route.nx) || 0;
    r.v.corps.setTranslation({ x, y: monde.hauteur(x, z) + 0.8, z }, true);
    r.v.corps.setRotation(quatY(ang), true);
    r.v.corps.setLinvel({ x: 0, y: 0, z: 0 }, true);
    r.v.corps.setAngvel({ x: 0, y: 0, z: 0 }, true);
    r.v.freinAMain = true;
    message(`${TYPES[r.v.type].nom} livré(e) par la dépanneuse, garé(e) à côté de vous.`, 4, "succes");
  }

  /** Perte de connaissance : évacuation vers l'hôpital réel le plus proche (soins payants). */
  function evacuer() {
    if (etat.mode === "conduite") { etat.vehicule.freinAMain = true; entrerSortir(true); }
    if (etat.mode === "passager") descendreTransport();
    const p = joueur.position();
    const h = hopitaux.slice().sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.z) - Math.hypot(b[0] - p.x, b[1] - p.z))[0];
    const cible = h ? { x: h[0], z: h[1] } : { ...CONFIG.depart };
    const route = pointRoute(monde.reseau, cible.x, cible.z, ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]);
    const x = route.x + route.nx * (route.largeur / 2 + 2.2), z = route.z + route.nz * (route.largeur / 2 + 2.2);
    joueur.teleporter(x, monde.hauteur(x, z) + 1.2, z);
    joueur.sante = 100; joueur.endurance = 100;
    const frais = Math.min(etat.argent, 15000);
    etat.argent -= frais;
    if (missions.active) { missions.abandonner(); retirerClient(); }
    message(`Vous avez perdu connaissance. Évacué(e) ${h ? `à « ${h[2]} »` : "au point de départ"} — soins : ${fc(frais)}.`, 7, "alerte");
  }

  function sauvegarder(silencieux) {
    const p = etat.vehicule ? etat.vehicule.position() : joueur.position();
    const ok = Sauvegarde.enregistrer({
      zone: ZONE, joueur: { x: p.x, y: p.y, z: p.z }, conduit: etat.vehicule ? flotte.indexOf(etat.vehicule) : -1,
      vehicules: flotte.map((v) => v.etat()), heure: env.heure, meteo: env.meteo, argent: etat.argent, niveau: sim.niveau,
      banque: etat.banque, sante: Math.max(1, joueur.sante), stats: etat.stats, missions: missions.stats,
    });
    if (!silencieux) message(ok ? "Partie sauvegardée." : "Sauvegarde impossible (stockage du navigateur indisponible).");
  }

  if (sauv && sauv.conduit >= 0 && flotte[sauv.conduit]) {
    const q = flotte[sauv.conduit].position();
    joueur.teleporter(q.x + 3, q.y + 0.5, q.z);
    entrerSortir();
  }

  // --- Caméras ----------------------------------------------------------------------
  const tableau = new THREE.Group();
  const mTab = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.8 });
  const planche = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.5), mTab);
  planche.position.set(0.25, -0.55, -0.75);
  const volant = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), mTab);
  volant.position.set(0, -0.36, -0.55);
  volant.rotation.x = -0.35;
  const montantG = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), mTab);
  montantG.position.set(-0.62, 0, -0.75); montantG.rotation.z = 0.25;
  const montantD = montantG.clone(); montantD.position.x = 1.15; montantD.rotation.z = -0.25;
  const toit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.2), mTab);
  toit.position.set(0.25, 0.42, -0.4);
  tableau.add(planche, volant, montantG, montantD, toit);
  tableau.visible = false;
  camera.add(tableau);
  const cible = new THREE.Vector3(), voulue = new THREE.Vector3();
  const R = physique.R;
  const libre = { pos: new THREE.Vector3(), init: false };
  const Y = new THREE.Vector3(0, 1, 0);

  function sansMur(exclu) {
    const dir = voulue.clone().sub(cible);
    const lg = dir.length();
    dir.normalize();
    const hit = physique.monde.castRay(new R.Ray(cible, dir), lg, true, undefined, undefined, undefined, exclu);
    if (hit) voulue.copy(cible).addScaledVector(dir, Math.max(0.6, hit.timeOfImpact - 0.3));
  }

  function placerCamera(dt, ax) {
    if (cinematique) {
      const c = cinematique;
      c.t += dt;
      const r = c.bx.r * 1.15 + 45, a = c.a0 + c.t * 0.18;
      camera.position.set(c.bx.x + Math.cos(a) * r, c.y + 18 + r * 0.22, c.bx.z + Math.sin(a) * r);
      camera.lookAt(c.bx.x, c.y + 8, c.bx.z);
      if (c.t > c.duree || Math.hypot(ax.x, ax.y) > 0.15) cinematique = null;
      return;
    }
    tableau.visible = false;
    joueur.objet.visible = true;
    if (etat.mode !== "pied") {
      // Véhicule conduit (physique) ou véhicule simulé (passager).
      let p, a, t;
      if (etat.mode === "conduite") { p = etat.vehicule.position(); a = etat.vehicule.angle(); t = TYPES[etat.vehicule.type]; }
      else { const v = etat.simV; p = { x: v.x, y: monde.hauteur(v.x, v.z), z: v.z }; a = -v.cap; t = TYPES[v.type]; }
      const objet = etat.mode === "conduite" ? etat.vehicule.objet : rendu.objetVehicule(etat.simV.id);
      const vue = CAMERAS_VEHICULE[etat.camVeh];
      if (objet) objet.visible = vue !== "intérieure";
      if (vue === "intérieure") {
        joueur.objet.visible = false;
        tableau.visible = etat.mode === "conduite";
        const off = new THREE.Vector3(etat.mode === "conduite" ? -t.w * 0.22 : 0, t.h * 0.78, -t.l * 0.08).applyAxisAngle(Y, a);
        camera.position.set(p.x + off.x, p.y + off.y, p.z + off.z);
        const reg = new THREE.Vector3(Math.sin(ctl.lacet) * 0.6, -0.05 - ctl.tangage * 0.2, -1).applyAxisAngle(Y, a);
        camera.lookAt(camera.position.clone().add(reg));
        return;
      }
      if (vue === "aérienne") {
        cible.set(p.x, p.y, p.z);
        voulue.set(p.x, p.y + 70, p.z + 35);
        camera.position.lerp(voulue, Math.min(1, dt * 3));
        camera.lookAt(cible);
        return;
      }
      const dist = Math.max(6, t.l * 1.25), haut = t.h + 1.4;
      ctl.lacet *= 1 - Math.min(1, dt * 1.5);
      const ang = a + ctl.lacet;
      cible.set(p.x, p.y + t.h * 0.7, p.z);
      voulue.set(p.x + Math.sin(ang) * dist, p.y + haut + ctl.tangage * 3, p.z + Math.cos(ang) * dist);
      sansMur(etat.mode === "conduite" ? etat.vehicule.corps : undefined);
      camera.position.lerp(voulue, Math.min(1, dt * 6));
      camera.lookAt(cible);
      return;
    }
    const p = joueur.position();
    const vue = CAMERAS_PIED[etat.camPied];
    if (vue === "1re personne") {
      joueur.objet.visible = false;
      camera.position.set(p.x, p.y + (joueur.accroupi ? 1.0 : 1.62), p.z);
      const dir = new THREE.Vector3(-Math.sin(ctl.lacet) * Math.cos(ctl.tangage), -Math.sin(ctl.tangage), -Math.cos(ctl.lacet) * Math.cos(ctl.tangage));
      camera.lookAt(camera.position.clone().add(dir));
      return;
    }
    if (vue === "aérienne") {
      voulue.set(p.x, p.y + 80, p.z + 40);
      camera.position.lerp(voulue, Math.min(1, dt * 3));
      camera.lookAt(p.x, p.y, p.z);
      return;
    }
    if (vue === "libre") {
      if (!libre.init) { libre.pos.copy(camera.position); libre.init = true; }
      const v = ctl.courir() ? 40 : 14;
      const avant = new THREE.Vector3(-Math.sin(ctl.lacet), 0, -Math.cos(ctl.lacet));
      const droite = new THREE.Vector3(-avant.z, 0, avant.x);
      libre.pos.addScaledVector(avant, ax.y * v * dt).addScaledVector(droite, ax.x * v * dt);
      if (ctl.bas("Space")) libre.pos.y += v * dt;
      if (ctl.bas("ControlLeft", "KeyX")) libre.pos.y -= v * dt;
      libre.pos.y = Math.max(monde.hauteur(libre.pos.x, libre.pos.z) + 1, libre.pos.y);
      camera.position.copy(libre.pos);
      const dir = new THREE.Vector3(-Math.sin(ctl.lacet) * Math.cos(ctl.tangage), -Math.sin(ctl.tangage), -Math.cos(ctl.lacet) * Math.cos(ctl.tangage));
      camera.lookAt(camera.position.clone().add(dir));
      return;
    }
    libre.init = false;
    cible.set(p.x, p.y + (joueur.accroupi ? 1.1 : 1.6), p.z);
    const dist = 4.2;
    voulue.set(p.x + Math.sin(ctl.lacet) * Math.cos(ctl.tangage) * dist, cible.y + Math.sin(ctl.tangage) * dist,
      p.z + Math.cos(ctl.lacet) * Math.cos(ctl.tangage) * dist);
    sansMur(joueur.corps);
    camera.position.lerp(voulue, Math.min(1, dt * 14));
    camera.lookAt(cible);
  }

  // --- Interface : HUD, menu pause, commandes tactiles -------------------------------
  hud = new HUD({
    carte, mobile,
    onAction: (a) => { if (a) { a.faire(); hud._cle = null; } },
    onZoom: (s) => hud.zoom(s),
    onCarte: () => menu.ouvrir("carte"),
    onMenu: () => (menu.ouvert() ? menu.fermer() : menu.ouvrir()),
  });
  const ombres = (on) => {
    if (on === undefined) return renderer.shadowMap.enabled && env.soleil.castShadow;
    renderer.shadowMap.enabled = on && QUALITE !== "basse";
    env.soleil.castShadow = on && QUALITE !== "basse";
    scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    return on;
  };
  const menu = creerMenu({
    etat, env, sim, gps, carte, missions, joueur, flotte, ctl, camera, audio, TYPES, PLACES, mobile, reglages, remorquages,
    zone: ZONE, zoneNom: CONFIG.nom, qualite: QUALITE, stats: etat.stats,
    peutOuvrir: () => !ctl.edition,
    pause: (on) => { etat.pause = on; if (on) hud.vehicule(null); },
    notifier: (t, o) => hud.notifier(t, o),
    positionJoueur, capJoueur,
    cibleMission: () => { const e = missions.etapeCourante(); return e ? { x: e.l[0], z: e.l[1] } : null; },
    monterEditeur: (hote) => editeurPersonnage(hote, appliquerApparence).ouvrir(),
    monterTransports: (hote) => panneauTransports(hote, sim, CONFIG.court).ouvrir(),
    monterZones: (hote) => panneauZones(hote, ZONES, ZONE, () => sauvegarder(true)).ouvrir(),
    demarrerMission, abandonnerMission, guiderMission, remorquer, sauvegarder,
    effacerSauvegarde: () => Sauvegarde.effacer(ZONE),
    derniereSauvegarde: () => Sauvegarde.charger(ZONE)?.date || null,
    ombres, enregistrerReglages,
    appliquerAudio: () => audio.regler(reglages.volume, reglages.ambiance),
    appliquerTactile: () => appliquerTactile(reglages),
    editerTactile: () => editerTactile(ctl, reglages, enregistrerReglages, (t, o) => hud.notifier(t, o)),
    remarquables, registre,
    regarderBatiment: (b) => { menu.fermer(); regarderBatiment(b); },
    allerVers: (b) => {
      if (b.zone === ZONE) { const r = remarquables.liste.find((x) => x.id === b.id); gps.definir(r.entreeZone.x, r.entreeZone.z, b.nom_courant); hud.notifier(`GPS : ${b.nom_courant}`, { type: "info" }); return; }
      sauvegarder(true);
      location.href = `?zone=${encodeURIComponent(b.zone)}&lieu=${encodeURIComponent(b.id)}`;
    },
    lienCarte: () => { const p = positionJoueur(), g = proj.versGeo(p.x, p.z); return `../index.html#18/${g.lat.toFixed(5)}/${g.lon.toFixed(5)}/0/60`; },
  });
  ctl.enPause = () => etat.pause;
  appliquerTactile(reglages);
  addEventListener("resize", () => appliquerTactile(reglages));

  // --- Boucle ------------------------------------------------------------------------
  const horloge = new THREE.Clock();
  let tMonde = 0, tSauve = 0, tHud = 0, tCarte = 0, images = 0, ips = 0, tIps = 0, pharesNuit = null, accCourant = 0;
  const dirCam = new THREE.Vector3();
  let precedent = null;
  // Préparation graphique pendant l'écran de chargement : reflets du ciel et compilation des
  // shaders des matériaux (sinon les premières secondes de jeu sont saccadées).
  progression("Préparation de l'affichage…", 0.9);
  env.mettreAJour(0, joueur.position(), camera, monde.lampadaires);
  try { await renderer.compileAsync(scene, camera); } catch { /* navigateur sans compilation asynchrone */ }
  // Qualité haute (PC à carte graphique) : occlusion ambiante, halo des lumières, anticrénelage.
  post = QUALITE === "haute" && params.get("post") !== "0" ? await creerPostTraitement(renderer, scene, camera) : null;
  renderer.render(scene, camera);
  $("chargement").hidden = true;
  message(mobile
    ? `Bienvenue à ${CONFIG.court} ! Joystick : marcher · glisser l'écran : regarder · ☰ : menu · ⛶ : plein écran à l'horizontale`
    : `Bienvenue à ${CONFIG.court} ! Z/W Q/A S D : marcher · Maj : courir · E : interagir · F : véhicule · C : caméra · M : carte · Échap : menu`, 8, "info");
  const unGeste = () => { audio.demarrer(); audio.regler(reglages.volume, reglages.ambiance); removeEventListener("pointerdown", unGeste); removeEventListener("keydown", unGeste); };
  addEventListener("pointerdown", unGeste);
  addEventListener("keydown", unGeste);

  window.__jeu = { etat, joueur, flotte, env, monde, camera, sim, rendu, entrerSortir, sauvegarder, prendreTransport, interagir, monuments, ctl, renderer, scene,
    hud, menu, gps, missions, carte, reglages, actionsDisponibles, evacuer, actionVehicule, remorquages,
    remarquables, regarderBatiment, cinematique: () => cinematique };

  function boucle() {
    requestAnimationFrame(boucle);
    const dtReel = Math.min(0.1, horloge.getDelta());
    ctl.lireManette();
    // Menu pause : Échap / Start ouvre et ferme ; B / Retour arrière ferme. Le jeu est figé.
    if (ctl.declenche("pause") && !ctl.edition) { if (menu.ouvert()) menu.fermer(); else menu.ouvrir(); }
    else if (ctl.declenche("retour") && menu.ouvert()) menu.fermer();
    if (etat.pause) {
      ctl.finImage();
      if (post) post.rendre(env.estNuit()); else renderer.render(scene, camera);
      return;
    }
    const dt = dtReel;
    etat.stats.temps += dt;
    const ax = ctl.axes();
    // Actions (clavier configurable, manette, boutons tactiles).
    if (ctl.declenche("vehicule")) entrerSortir();
    if (ctl.declenche("interagir") && etat.mode !== "conduite") interagir();
    if (ctl.declenche("actionVehicule") && etat.mode === "conduite") actionVehicule();
    else if (ctl.declenche("interagir") && etat.mode === "conduite") { const a = hud.actionChoisie(); if (a) a.faire(); }
    for (let k = 1; k <= 5; k++) if (ctl.appui("Digit" + k) && hud.actions[k - 1]) { hud.actions[k - 1].faire(); hud._cle = null; }
    if (ctl.manette.boutons[15] && !ctl.manette.avant[15]) hud.choisirSuivant(1);
    if (ctl.manette.boutons[14] && !ctl.manette.avant[14]) hud.choisirSuivant(-1);
    if (ctl.declenche("camera")) {
      if (etat.mode === "pied") { etat.camPied = (etat.camPied + 1) % CAMERAS_PIED.length; message("Caméra : " + CAMERAS_PIED[etat.camPied], 1.5); }
      else { etat.camVeh = (etat.camVeh + 1) % CAMERAS_VEHICULE.length; message("Caméra : " + CAMERAS_VEHICULE[etat.camVeh], 1.5); }
    }
    if (ctl.declenche("accroupir") && etat.mode === "pied" && CAMERAS_PIED[etat.camPied] !== "libre") joueur.accroupi = !joueur.accroupi;
    if (ctl.declenche("meteo")) { env.meteo = (env.meteo + 1) % 3; message("Météo : " + METEOS[env.meteo], 2); }
    if (ctl.declenche("heure")) { env.heure = (env.heure + 3) % 24; message("Heure : " + env.heureTexte(), 2); }
    if (ctl.declenche("klaxon")) audio.klaxon(5);
    if (ctl.declenche("sauvegarder")) sauvegarder();
    if (ctl.declenche("lignes")) menu.ouvrir("transports");
    if (ctl.declenche("personnage")) menu.ouvrir("personnage");
    if (ctl.declenche("zone")) menu.ouvrir("zones");
    if (ctl.declenche("carte")) menu.ouvrir("carte");
    if (ctl.declenche("zoomPlus")) hud.zoom(1);
    if (ctl.declenche("zoomMoins")) hud.zoom(-1);
    if (ctl.declenche("phares") && etat.vehicule) etat.vehicule.allumerPhares(!etat.vehicule.phares);
    if (ctl.declenche("trafic")) { sim.niveau = (sim.niveau + 1) % 3; message(`Circulation : ${NIVEAUX[sim.niveau]} (simulée)`, 2); }
    if (ctl.declenche("accident")) {
      const p = joueur.position();
      const v = sim.provoquerAccident(p.x, p.z, 120);
      message(v ? "Accident simulé : une voie est bloquée pendant 2 minutes. Observez la circulation." : "Aucun véhicule à proximité.", 4);
    }
    if (ctl.actionsTactiles.has("pleinEcran")) pleinEcranHorizontal();

    // Joueur ou véhicule.
    if (etat.mode === "pied") {
      const libreCam = CAMERAS_PIED[etat.camPied] === "libre";
      const c = Math.cos(ctl.lacet), s = Math.sin(ctl.lacet);
      const dx = libreCam ? 0 : ax.x * c - ax.y * s, dz = libreCam ? 0 : -ax.x * s - ax.y * c;
      joueur.mettreAJour(dt, dx, dz, { courir: ctl.courir(), lent: ctl.actif("lent"), sauter: ctl.declenche("sauter") && !libreCam });
    } else joueur.mettreAJour(dt, 0, 0);
    const sousPas = Math.min(6, Math.max(1, Math.round(dt * 60)));
    const h = dt / sousPas;
    for (let k = 0; k < sousPas; k++) {
      if (etat.mode === "conduite") {
        const v = etat.vehicule;
        const vit = v.vitesse();
        const ped = ctl.pedales();
        let acc = Math.max(ax.y, ped.gaz) - (ped.frein > 0 && vit < 1 ? ped.frein : 0);
        let frein = ctl.actif("sauter") ? 1 : 0;                       // frein à main (Espace / A)
        if (acc < 0 && vit > 1) { frein = Math.max(frein, -acc); acc = 0; }
        if (ped.frein > 0 && vit > 1) frein = Math.max(frein, ped.frein);
        accCourant = acc;
        v.commander(acc, -ax.x, frein, h);
      }
      for (const v of flotte) v.mettreAJour(h);
      physique.pas(h);
    }
    if (etat.mode === "conduite") {
      const v = etat.vehicule, p = v.position();
      joueur.teleporter(p.x, p.y, p.z);
      // Chocs : le conducteur est blessé au-delà d'un choc à ~15 km/h.
      for (const c of v.chocs.splice(0)) {
        if (c.dv > 4) { joueur.degats((c.dv - 4) * 4, "accident"); message(`Choc ! Véhicule endommagé (état ${Math.round(v.sante)} %).`, 2.5, "alerte"); }
      }
      if (v.sante <= 0 && !v._panneSignalee) { v._panneSignalee = true; message("Moteur en panne : faites réparer le véhicule dans une station ou un garage.", 5, "alerte"); }
      if (v.sante > 0) v._panneSignalee = false;
    }
    for (const v of flotte) if (v !== etat.vehicule) v.chocs.length = 0;
    // Évènements du joueur (chute, essoufflement) et perte de connaissance.
    for (const e of joueur.evenements.splice(0)) {
      if (e.type === "degats" && e.cause === "chute") message(`Chute : santé −${e.n}.`, 2.5, "alerte");
      if (e.type === "essouffle") message("Essoufflé(e) : reprenez votre souffle avant de courir.", 2.5);
    }
    if (joueur.sante <= 0) evacuer();

    // Simulation urbaine.
    sim.heure = env.heure;
    const pj = positionJoueur();
    if (precedent) {
      const d = Math.hypot(pj.x - precedent.x, pj.z - precedent.z);
      if (d < 30) etat.stats[etat.mode === "pied" ? "pied" : "vehicule"] += d;
    }
    precedent = { x: pj.x, z: pj.z };
    sim.definirJoueur(pj.x, pj.z, etat.mode === "conduite");
    sim.pas(dt);
    if (etat.mode === "passager") {
      const v = etat.simV;
      joueur.teleporter(v.x, monde.hauteur(v.x, v.z) + 0.5, v.z);
      const arretBus = v.role === "ligne" && v.etat === "arret" && v.arretActuel && etat.descendreAuProchain;
      if (arretBus || v.arriveeJoueur || (v.role !== "ligne" && v.v < 0.5 && v.iRoute >= v.route.length - 1)) descendreTransport();
    }
    // Dépanneuse.
    for (const r of remorquages.slice()) {
      r.t -= dt;
      if (r.t <= 0) { remorquages.splice(remorquages.indexOf(r), 1); if (etat.vehicule !== r.v) livrerRemorquage(r); }
    }
    // Missions et GPS.
    const vitesse = etat.mode === "conduite" ? etat.vehicule.vitesse() : etat.mode === "passager" ? etat.simV.v : joueur.vitesseH;
    const em = missions.mettreAJour(dt, { x: pj.x, z: pj.z, vitesse, typeVehicule: etat.mode === "conduite" ? etat.vehicule.type : null });
    if (em?.etape) {
      if (em.precedente?.client) { retirerClient(); message(`${em.precedente.client} est monté(e) à bord.`, 3, "info"); }
      guiderMission();
      message(em.etape.texte, 4, "info");
      if (em.etape.client && em.etape.cond === "arret" && !em.precedente?.client) placerClient(em.etape);
    } else if (em?.reussie) {
      etat.argent += em.recompense;
      retirerClient();
      gps.effacer();
      message(`Mission réussie : ${em.titre} — +${fc(em.recompense)}`, 6, "succes");
      sauvegarder(true);
    } else if (em?.echec) {
      retirerClient();
      gps.effacer();
      message(`Mission échouée : ${em.raison}.`, 5, "alerte");
    }
    if (clientPnj) clientPnj.mettreAJour(dt);
    const g = gps.mettreAJour(dt, pj.x, pj.z, etat.mode === "conduite");
    if (g?.arrivee && !missions.active) message(`Vous êtes arrivé(e) : ${g.arrivee.nom}.`, 4, "succes");

    const centre = new THREE.Vector3(pj.x, monde.hauteur(pj.x, pj.z), pj.z);
    tMonde -= dt;
    if (tMonde <= 0) { monde.mettreAJour(pj.x, pj.z); tMonde = 0.5; }
    placerCamera(dt, ax);
    const { nuit } = env.mettreAJour(dt, centre, camera, monde.lampadaires);
    rendu.mettreAJour(dt, pj.x, pj.z, nuit);
    if (pharesNuit !== nuit > 0.5) { pharesNuit = nuit > 0.5; rendu.phares(pharesNuit); }
    if (monde.uNuit) monde.uNuit.value = nuit;
    if (materiaux) {
      materiaux.uniformes.uNuit.value = nuit;
      // Sol mouillé : monte avec la pluie, sèche lentement ensuite.
      const u = materiaux.uniformes.uMouille;
      u.value += ((env.pluie01 > 0.2 ? 1 : 0) - u.value) * Math.min(1, dt * (env.pluie01 > 0.2 ? 0.2 : 0.02));
    }
    monde.lampeMat.emissiveIntensity = nuit > 0.3 ? 3 * nuit : 0;
    if (etat.vehicule && nuit > 0.5 && !etat.vehicule.phares && !etat._pharesAuto) { etat.vehicule.allumerPhares(true); etat._pharesAuto = true; }
    if (nuit < 0.3) etat._pharesAuto = false;
    // Sons : moteur, pluie, sirènes (circulation et véhicule du joueur), klaxons des véhicules bloqués.
    let sirene = etat.vehicule?.sirene ? 0.7 : 0;
    for (const v of sim.vehicules) {
      const d = Math.hypot(v.x - pj.x, v.z - pj.z);
      if (d > 90) continue;
      if (v.sirene) sirene = Math.max(sirene, 1 - d / 90);
      if (d < 35 && v.bloqueDepuis > 5 && Math.random() < dt * 0.08) audio.klaxon(d + 5);
    }
    audio.sirene(sirene);
    audio.mettreAJour(dt, { enVoiture: etat.mode !== "pied", regime: etat.vehicule ? Math.min(1, Math.abs(etat.vehicule.vitesse()) / 25) : 0, pluie: env.pluie01, nuit });

    // Mini-carte (~12 fois par seconde), orientée comme la caméra.
    tCarte -= dt;
    if (tCarte <= 0) {
      tCarte = 0.08;
      camera.getWorldDirection(dirCam);
      hud.dessinerCarte({ cx: pj.x, cz: pj.z, angle: Math.atan2(-dirCam.x, -dirCam.z), joueur: { x: pj.x, z: pj.z, cap: capJoueur() },
        gps, flotte, destination: gps.dest, mission: missions.etapeCourante() ? { x: missions.etapeCourante().l[0], z: missions.etapeCourante().l[1] } : null }, Math.abs(vitesse));
    }
    // Interface (4 fois par seconde).
    tHud -= dt;
    if (tHud <= 0) {
      tHud = 0.25;
      let proche = null, dmin = 14;
      for (const l of monde.lieux) {
        const d = Math.hypot(l.x - pj.x, l.z - pj.z);
        if (d < dmin) { dmin = d; proche = l; }
      }
      etat.lieuProche = proche;
      hud.interactions(actionsDisponibles(), nomTouche(ctl.carte.interagir[0] || "KeyE"));
      hud.etat({ sante: joueur.sante, endurance: joueur.endurance, essouffle: joueur.essouffle, argent: etat.argent, heure: env.heureTexte(), meteo: METEOS[env.meteo],
        rue: carte.rueProche(pj.x, pj.z), zone: CONFIG.court, trafic: `Trafic ${NIVEAUX[sim.niveau]} (simulé) · ${ips} i/s` });
      hud.gps(gps);
      const annonce = remarquables.approche(pj.x, pj.z);
      if (annonce) hud.lieu(annonce);
      hud.mission(missions.active, missions.etapeCourante());
      const v = etat.vehicule;
      if (v) {
        const act = { police: "R : sirène et gyrophares", ambulance: "R : sirène et gyrophares", taxi: "R : chercher un client", minibus: "R : chercher un client",
          moto: "R : chercher un client (moto-taxi)", camion: "R : livraison", livraison: "R : livraison" }[v.type] || "";
        hud.vehicule(v, { vitesse: v.vitesse(), rapport: v.rapport(accCourant), nom: TYPES[v.type].nom, carburant: v.carburant, etatMeca: v.sante, odometre: v.odometre,
          voyants: { phares: v.phares, frein: v.freinAMain, carbu: v.carburant < 0.15, moteur: v.sante < 30, sirene: v.sirene },
          action: act ? act.replace("R", nomTouche(ctl.carte.actionVehicule[0] || "KeyR")) : "" });
      } else if (etat.mode === "passager") {
        hud.vehicule(etat.simV, { vitesse: etat.simV.v, nom: "Passager — " + TYPES[etat.simV.type].nom, passager: true, odometre: null, voyants: {} });
      } else hud.vehicule(null);
      menu.rafraichir();
    }
    tSauve += dt;
    if (tSauve > 15) { tSauve = 0; sauvegarder(true); }
    images++; tIps += dtReel;
    if (tIps >= 1) { ips = images; images = 0; tIps = 0; }
    ctl.finImage();
    if (post) post.rendre(env.estNuit()); else renderer.render(scene, camera);
  }
  boucle();
}

/** Point le plus proche sur le réseau routier réel (+ normale vers le trottoir). */
function pointRoute(reseau, x, z, classes) {
  const LARG = { motorway: 14, trunk: 14, primary: 12, secondary: 9, tertiary: 7.5, unclassified: 6, residential: 5.5 };
  let best = null, dmin = Infinity;
  for (const r of reseau) {
    if (!classes.includes(r.k)) continue;
    const p = r.p;
    let acc = 0;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
      const qx = ax + lx * t, qz = az + lz * t, d = Math.hypot(qx - x, qz - z);
      const lg = Math.sqrt(l2);
      if (d < dmin) {
        dmin = d;
        best = { x: qx, z: qz, nx: -lz / lg, nz: lx / lg, route: r, d: acc + lg * t, largeur: LARG[r.k] || 6 };
      }
      acc += lg;
    }
  }
  return best;
}

demarrer().catch((e) => {
  console.error(e);
  $("chargement-texte").textContent = "Erreur de chargement : " + e.message;
});

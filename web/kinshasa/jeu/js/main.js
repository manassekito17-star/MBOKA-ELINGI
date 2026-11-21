// Kinshasa 3D — mode jeu (« GTA ») : point d'entrée.
// Zone jouable réelle chargée par tuiles ; simulation urbaine (circulation,
// transports publics, piétons) ; personnage personnalisable ; véhicules
// physiques ; caméras ; cycle jour/nuit ; météo ; son ; sauvegarde.
import * as THREE from "three";
import { Physique } from "./physique.js";
import { Monde } from "./monde.js";
import { Joueur } from "./joueur.js";
import { Vehicule, TYPES, PLACES } from "./vehicules.js";
import { Environnement, METEOS } from "./environnement.js";
import { Audio } from "./audio.js";
import { Controles } from "./controles.js";
import { chargerPersonnages } from "./personnages.js";
import { tourEchangeur } from "./monuments.js";
import { Projection, Trajet } from "./geo.js";
import { Circulation, NIVEAUX, profilHoraire } from "./simulation/circulation.js";
import { RenduCirculation } from "./simulation/rendu.js";
import { editeurPersonnage, panneauTransports, panneauZones, chargerApparence } from "./interface.js";
import * as Sauvegarde from "./sauvegarde.js";
import { ZONES, ZONE_DEFAUT } from "./zones.js";

const params = new URLSearchParams(location.search);
const mobile = matchMedia("(pointer: coarse)").matches;
const QUALITE = params.get("qualite") || (mobile ? "basse" : "moyenne");
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
  argent: 20000, msgT: 0, lieuProche: null,
};

function message(t, duree = 3.5) {
  etat.msgT = duree;
  $("message").textContent = t;
  $("message").hidden = false;
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
  renderer.shadowMap.enabled = QUALITE !== "basse";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $("jeu").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.15, 5000);
  scene.add(camera);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  $("chargement-zone").textContent = `Zone jouable : ${CONFIG.nom} (${CONFIG.description}, données réelles)`;
  document.title = `Kinshasa 3D — ${CONFIG.court}`;
  progression(`Carte réelle de ${CONFIG.court}…`, 0.15);
  const monde = new Monde(scene, physique, `zones/${ZONE}/`, QUALITE);
  const manifest = await monde.charger();
  const transports = await (await fetch(`zones/${ZONE}/transports.json`)).json().catch(() => null);
  const proj = new Projection(manifest.origine[0], manifest.origine[1]);
  $("attribution").textContent = manifest.attribution + " · Transports : " + (transports?.source || "—") + " · Personnages : Quaternius (CC0)";

  progression("Personnages et animations…", 0.3);
  await chargerPersonnages();

  const env = new Environnement(scene, renderer, QUALITE);
  const audio = new Audio();
  const ctl = new Controles(renderer.domElement);
  if (CONFIG.monument === "echangeur") tourEchangeur(scene, physique, monde.hauteur(0, 0));

  // --- Sauvegarde et point de départ.
  const sauv = params.has("nouveau") ? null : Sauvegarde.charger(ZONE);
  if (sauv) { env.heure = sauv.heure; env.meteo = sauv.meteo; etat.argent = sauv.argent; }
  let depart = { ...CONFIG.depart };
  if (params.has("lat") && params.has("lon")) depart = proj.versLocal(+params.get("lon"), +params.get("lat"));
  else if (sauv) depart = sauv.joueur;
  const limX = (manifest.demi_x ?? manifest.demi) - 20, limZ = (manifest.demi_z ?? manifest.demi) - 20;
  depart.x = Math.max(-limX, Math.min(limX, depart.x));
  depart.z = Math.max(-limZ, Math.min(limZ, depart.z));
  const surRoute = pointRoute(monde.reseau, depart.x, depart.z, ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]);
  const trottoir = surRoute.largeur / 2 + 2.2;
  if (!sauv || params.has("lat")) depart = { x: surRoute.x + surRoute.nx * trottoir, z: surRoute.z + surRoute.nz * trottoir };

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

  // --- Véhicules du joueur (stationnés le long de la rue, ou restaurés).
  const flotte = [];
  if (sauv && sauv.vehicules.length) {
    for (const v of sauv.vehicules) if (TYPES[v.type]) {
      const ve = new Vehicule(physique, scene, v.type, v.x, v.y, v.z, v.a, v.couleur);
      ve.carburant = Number.isFinite(v.c) ? v.c : 1;
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
  const editeur = editeurPersonnage($("panneau-perso"), (ap) => { joueur.changerApparence(ap); message("Personnage mis à jour."); });
  const transportsUI = panneauTransports($("panneau-transports"), sim, CONFIG.court);
  $("btn-perso").addEventListener("click", () => editeur.ouvrir());
  $("btn-bus").addEventListener("click", () => transportsUI.ouvrir());
  const zonesUI = panneauZones($("panneau-zones"), ZONES, ZONE, () => sauvegarder(true));
  $("btn-zone").addEventListener("click", () => zonesUI.ouvrir());

  // --- Véhicules du joueur : monter / descendre (F).
  function entrerSortir() {
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
      message(`${TYPES[meilleur.type].nom} — Z/W accélérer, S freiner/reculer, Q/A D tourner, F descendre, C ou V caméra`);
    } else {
      const v = etat.vehicule;
      if (Math.abs(v.vitesse()) > 3) return message("Ralentissez pour descendre.");
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

  function interagir() {
    if (etat.mode === "passager") {
      const v = etat.simV;
      if (v.role === "ligne") { etat.descendreAuProchain = true; message("Vous descendrez au prochain arrêt."); }
      else if (v.v < 1.5) descendreTransport();
      else message("Le chauffeur s'arrête dès que possible…");
      if (v.role !== "ligne") { v.route = v.route.slice(0, v.iRoute + 1); }
      return;
    }
    if (etat.mode === "pied" && prendreTransport()) return;
    const l = etat.lieuProche;
    if (!l) return message("Rien à proximité. Approchez-vous d'un arrêt de bus, d'une moto-taxi, d'un commerce ou d'une station.");
    joueur.geste("Interact");
    const k = l.k || "";
    let action = "";
    if (/gas_station|fuel/.test(k)) {
      const v = etat.vehicule || flotte.find((v) => { const q = v.position(); return Math.hypot(q.x - l.x, q.z - l.z) < 25; });
      if (v) {
        const prix = Math.round((1 - v.carburant) * 60) * 2900;
        if (prix > etat.argent) action = "Pas assez d'argent pour faire le plein.";
        else { etat.argent -= prix; v.carburant = 1; action = `Plein fait : ${prix.toLocaleString("fr-FR")} FC.`; }
      } else action = "Venez avec un véhicule pour faire le plein.";
    } else if (/restaurant|bar|eatery|food|cafe|lounge/.test(k)) {
      if (etat.argent >= 5000) { etat.argent -= 5000; action = "Vous mangez un plat de poulet à la moambe : 5 000 FC."; }
    } else if (/pharmac|hospital|health|clinic|doctor/.test(k)) {
      action = "Établissement de santé. Intérieur non modélisé dans cette version.";
    } else if (/store|shop|market|mall/.test(k)) {
      if (etat.argent >= 2000) { etat.argent -= 2000; action = "Achat : une bouteille d'eau et des arachides, 2 000 FC."; }
    } else action = "Établissement sans interaction pour l'instant.";
    message(`${l.n} — ${action}  (simulation de jeu : prix et services fictifs)`, 6);
  }

  function sauvegarder(silencieux) {
    const p = etat.vehicule ? etat.vehicule.position() : joueur.position();
    const ok = Sauvegarde.enregistrer({
      zone: ZONE, joueur: { x: p.x, y: p.y, z: p.z }, conduit: etat.vehicule ? flotte.indexOf(etat.vehicule) : -1,
      vehicules: flotte.map((v) => v.etat()), heure: env.heure, meteo: env.meteo, argent: etat.argent, niveau: sim.niveau,
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

  // --- Boucle ------------------------------------------------------------------------
  const horloge = new THREE.Clock();
  let tMonde = 0, tSauve = 0, tHud = 0, images = 0, ips = 0, tIps = 0, pharesNuit = null;
  $("chargement").hidden = true;
  message(`Bienvenue à ${CONFIG.court} ! Z/W Q/A S D : marcher · Maj : courir · Alt : marcher lentement · Ctrl : s'accroupir · F : vos véhicules · E : bus, moto-taxi, interagir · V : caméra · Échap : aide`, 8);
  const unGeste = () => { audio.demarrer(); removeEventListener("pointerdown", unGeste); removeEventListener("keydown", unGeste); };
  addEventListener("pointerdown", unGeste);
  addEventListener("keydown", unGeste);

  window.__jeu = { etat, joueur, flotte, env, monde, camera, sim, rendu, entrerSortir, sauvegarder, prendreTransport, interagir };

  function boucle() {
    requestAnimationFrame(boucle);
    // Temps réel conservé jusqu'à 10 images/s ; la physique avance par pas fixes de 1/60 s.
    const dt = Math.min(0.1, horloge.getDelta());
    const ax = ctl.axes();
    const panneauOuvert = !$("panneau-perso").hidden || !$("panneau-transports").hidden;
    if (!panneauOuvert) {
      if (ctl.appui("KeyF")) entrerSortir();
      if (ctl.appui("KeyE")) interagir();
      if (ctl.appui("KeyV")) {
        if (etat.mode === "pied") { etat.camPied = (etat.camPied + 1) % CAMERAS_PIED.length; message("Caméra : " + CAMERAS_PIED[etat.camPied]); }
        else { etat.camVeh = (etat.camVeh + 1) % CAMERAS_VEHICULE.length; message("Caméra : " + CAMERAS_VEHICULE[etat.camVeh]); }
      }
      if (ctl.appui("KeyC") && etat.mode !== "pied") etat.camVeh = etat.camVeh === 1 ? 0 : 1;
      if (ctl.appui("ControlLeft", "KeyX") && etat.mode === "pied" && CAMERAS_PIED[etat.camPied] !== "libre") joueur.accroupi = !joueur.accroupi;
      if (ctl.appui("KeyT")) { env.meteo = (env.meteo + 1) % 3; message("Météo : " + METEOS[env.meteo]); }
      if (ctl.appui("KeyN")) { env.heure = (env.heure + 3) % 24; message("Heure : " + env.heureTexte()); }
      if (ctl.appui("KeyH")) audio.klaxon(5);
      if (ctl.appui("KeyM")) audio.basculer();
      if (ctl.appui("KeyP")) sauvegarder();
      if (ctl.appui("KeyB")) transportsUI.ouvrir();
      if (ctl.appui("KeyU")) editeur.ouvrir();
      if (ctl.appui("KeyJ")) zonesUI.ouvrir();
      if (ctl.appui("KeyL") && etat.vehicule) etat.vehicule.allumerPhares(!etat.vehicule.phares);
      if (ctl.appui("KeyG")) { sim.niveau = (sim.niveau + 1) % 3; message(`Circulation : ${NIVEAUX[sim.niveau]} (simulée)`); }
      if (ctl.appui("KeyK")) {
        const p = joueur.position();
        const v = sim.provoquerAccident(p.x, p.z, 120);
        message(v ? "Accident simulé : une voie est bloquée pendant 2 minutes. Observez la circulation." : "Aucun véhicule à proximité.");
      }
    }
    if (ctl.appui("Escape")) $("aide").hidden = !$("aide").hidden;

    // Joueur ou véhicule.
    if (etat.mode === "pied") {
      const libreCam = CAMERAS_PIED[etat.camPied] === "libre";
      const c = Math.cos(ctl.lacet), s = Math.sin(ctl.lacet);
      const dx = libreCam || panneauOuvert ? 0 : ax.x * c - ax.y * s, dz = libreCam || panneauOuvert ? 0 : -ax.x * s - ax.y * c;
      joueur.mettreAJour(dt, dx, dz, { courir: ctl.courir(), lent: ctl.bas("AltLeft", "AltRight"), sauter: ctl.appui("Space") && !libreCam });
    } else joueur.mettreAJour(dt, 0, 0);
    const sousPas = Math.min(6, Math.max(1, Math.round(dt * 60)));
    const h = dt / sousPas;
    for (let k = 0; k < sousPas; k++) {
      if (etat.mode === "conduite") {
        const v = etat.vehicule;
        const vit = v.vitesse();
        let acc = panneauOuvert ? 0 : ax.y, frein = ctl.frein() ? 1 : 0;
        if (ax.y < 0 && vit > 1) { acc = 0; frein = Math.max(frein, -ax.y); }
        v.commander(acc, panneauOuvert ? 0 : -ax.x, frein, h);
      }
      for (const v of flotte) v.mettreAJour(h);
      physique.pas(h);
    }
    if (etat.mode === "conduite") {
      const p = etat.vehicule.position();
      joueur.teleporter(p.x, p.y, p.z);
    }

    // Simulation urbaine.
    sim.heure = env.heure;
    const pj = etat.mode === "conduite" ? etat.vehicule.position() : etat.mode === "passager" ? { x: etat.simV.x, y: 0, z: etat.simV.z } : joueur.position();
    sim.definirJoueur(pj.x, pj.z, etat.mode === "conduite");
    sim.pas(dt);
    if (etat.mode === "passager") {
      const v = etat.simV;
      joueur.teleporter(v.x, monde.hauteur(v.x, v.z) + 0.5, v.z);
      const arretBus = v.role === "ligne" && v.etat === "arret" && v.arretActuel && etat.descendreAuProchain;
      if (arretBus || v.arriveeJoueur || (v.role !== "ligne" && v.v < 0.5 && v.iRoute >= v.route.length - 1)) descendreTransport();
    }
    const nuitAvant = env.estNuit();
    const centre = new THREE.Vector3(pj.x, monde.hauteur(pj.x, pj.z), pj.z);

    tMonde -= dt;
    if (tMonde <= 0) { monde.mettreAJour(pj.x, pj.z); tMonde = 0.5; }
    placerCamera(dt, ax);
    const { nuit } = env.mettreAJour(dt, centre, camera, monde.lampadaires);
    rendu.mettreAJour(dt, pj.x, pj.z, nuit);
    if (pharesNuit !== nuit > 0.5) { pharesNuit = nuit > 0.5; rendu.phares(pharesNuit); }
    if (monde.uNuit) monde.uNuit.value = nuit;
    monde.lampeMat.emissiveIntensity = nuit > 0.3 ? 3 * nuit : 0;
    if (etat.vehicule && nuit > 0.5 && !etat.vehicule.phares && !etat._pharesAuto) { etat.vehicule.allumerPhares(true); etat._pharesAuto = true; }
    if (nuit < 0.3) etat._pharesAuto = false;
    // Sons : moteur, pluie, sirènes, klaxons des véhicules bloqués près du joueur.
    let sirene = 0;
    for (const v of sim.vehicules) {
      const d = Math.hypot(v.x - pj.x, v.z - pj.z);
      if (d > 90) continue;
      if (v.sirene) sirene = Math.max(sirene, 1 - d / 90);
      if (d < 35 && v.bloqueDepuis > 5 && Math.random() < dt * 0.08) audio.klaxon(d + 5);
    }
    audio.sirene(sirene);
    audio.mettreAJour(dt, { enVoiture: etat.mode !== "pied", regime: etat.vehicule ? Math.min(1, Math.abs(etat.vehicule.vitesse()) / 25) : 0, pluie: env.pluie01, nuit });

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
      // Indication contextuelle : transport disponible ou lieu proche.
      let indice = proche ? `E : ${proche.n}` : "";
      if (etat.mode === "pied") {
        for (const v of sim.vehicules) {
          const d = Math.hypot(v.x - pj.x, v.z - pj.z);
          if (v.role === "ligne" && v.etat === "arret" && d < 9) { const l = sim.lignes.find((x) => x.id === v.ligne); indice = `E : monter dans le ${v.type} ligne ${l.ref} (500 FC)`; break; }
          if (["moto", "taxi"].includes(v.type) && v.v < 3 && !v.client && v.passagers.length < v.capacite && d < 5.5) { indice = `E : prendre ${v.type === "moto" ? "la moto-taxi" : "le taxi"}`; break; }
        }
        for (const a of sim.arrets.values()) if (Math.hypot(a.x - pj.x, a.z - pj.z) < 25) { indice = indice || `Arrêt « ${a.nom} » — attendez un bus (B : horaires)`; break; }
      } else if (etat.mode === "passager") {
        const v = etat.simV;
        if (v.role === "ligne") {
          const st = v.arretsAVenir?.[0];
          indice = `À bord — prochain arrêt : ${st ? sim.arrets.get(st.id)?.nom : "terminus"}${etat.descendreAuProchain ? " (vous descendez)" : " · E : descendre au prochain arrêt"}`;
        } else indice = "Passager — E : demander l'arrêt";
      }
      $("lieu").hidden = !indice;
      $("lieu").textContent = indice;
      const g = proj.versGeo(pj.x, pj.z);
      const st = sim.statistiques();
      const ph = profilHoraire(env.heure);
      $("hud-heure").textContent = env.heureTexte() + " · " + METEOS[env.meteo];
      $("hud-argent").textContent = etat.argent.toLocaleString("fr-FR") + " FC";
      $("hud-trafic").textContent = `Trafic ${NIVEAUX[sim.niveau]}${ph >= 1.3 ? " · heure de pointe" : ph < 0.5 ? " · nuit" : ""} (simulé) · ${st.vehicules} véh. · ${Math.round(st.vitesseAxes * 3.6)} km/h`;
      $("hud-pos").textContent = `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} · ${ips} i/s`;
      $("hud-carte").href = `../index.html#18/${g.lat.toFixed(5)}/${g.lon.toFixed(5)}/0/60`;
      const v = etat.vehicule;
      $("hud-vitesse").hidden = !v && etat.mode !== "passager";
      if (v) {
        $("vitesse").textContent = Math.round(Math.abs(v.vitesse()) * 3.6);
        $("carburant").style.width = `${v.carburant * 100}%`;
        $("vehicule-nom").textContent = TYPES[v.type].nom;
      } else if (etat.mode === "passager") {
        $("vitesse").textContent = Math.round(etat.simV.v * 3.6);
        $("carburant").style.width = "0%";
        $("vehicule-nom").textContent = "Passager — " + TYPES[etat.simV.type].nom;
      }
    }
    if (etat.msgT > 0) { etat.msgT -= dt; if (etat.msgT <= 0) $("message").hidden = true; }
    tSauve += dt;
    if (tSauve > 15) { tSauve = 0; sauvegarder(true); }
    images++; tIps += dt;
    if (tIps >= 1) { ips = images; images = 0; tIps = 0; }
    ctl.finImage();
    renderer.render(scene, camera);
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

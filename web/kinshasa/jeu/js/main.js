// Kinshasa 3D — mode jeu (« GTA ») : point d'entrée.
// Zone jouable réelle chargée par tuiles, personnage, véhicules physiques,
// circulation simulée, cycle jour/nuit, météo, son, sauvegarde.
import * as THREE from "three";
import { Physique } from "./physique.js";
import { Monde } from "./monde.js";
import { Joueur } from "./joueur.js";
import { Vehicule, TYPES } from "./vehicules.js";
import { Trafic } from "./trafic.js";
import { Environnement, METEOS } from "./environnement.js";
import { Audio } from "./audio.js";
import { Controles } from "./controles.js";
import { chargerPersonnages } from "./personnages.js";
import { tourEchangeur } from "./monuments.js";
import { Projection, Trajet } from "./geo.js";
import * as Sauvegarde from "./sauvegarde.js";

const params = new URLSearchParams(location.search);
const mobile = matchMedia("(pointer: coarse)").matches;
const QUALITE = params.get("qualite") || (mobile ? "basse" : "moyenne");
const ZONE = "limete";
const $ = (id) => document.getElementById(id);

const etat = { mode: "pied", vehicule: null, cameraInterieure: false, argent: 20000, message: "", msgT: 0, lieuProche: null };

function message(t, duree = 3.5) {
  etat.message = t;
  etat.msgT = duree;
  $("message").textContent = t;
  $("message").hidden = false;
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
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.2, 5000);
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  progression("Carte réelle de Limete…", 0.15);
  const monde = new Monde(scene, physique, `zones/${ZONE}/`, QUALITE);
  const manifest = await monde.charger();
  const proj = new Projection(manifest.origine[0], manifest.origine[1]);
  $("attribution").textContent = manifest.attribution + " · Personnages : Quaternius (CC0)";

  progression("Personnages et animations…", 0.35);
  await chargerPersonnages();

  const env = new Environnement(scene, renderer, QUALITE);
  const audio = new Audio();
  const ctl = new Controles(renderer.domElement);
  tourEchangeur(scene, physique, monde.hauteur(0, 0));

  // --- Point de départ : sauvegarde, lien depuis la carte (?lat&lon) ou près de la Tour.
  const sauv = params.has("nouveau") ? null : Sauvegarde.charger();
  if (sauv) { env.heure = sauv.heure; env.meteo = sauv.meteo; etat.argent = sauv.argent; }
  let depart = { x: -38, z: -128 };
  if (params.has("lat") && params.has("lon")) {
    depart = proj.versLocal(+params.get("lon"), +params.get("lat"));
  } else if (sauv) depart = sauv.joueur;
  const lim = manifest.demi - 20;
  depart.x = Math.max(-lim, Math.min(lim, depart.x));
  depart.z = Math.max(-lim, Math.min(lim, depart.z));
  const surRoute = pointRoute(monde.reseau, depart.x, depart.z, ["trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]);
  if (!sauv || params.has("lat")) depart = { x: surRoute.x + surRoute.nx * 5, z: surRoute.z + surRoute.nz * 5 };

  progression("Chargement des quartiers autour de vous…", 0.5);
  monde.mettreAJour(depart.x, depart.z);
  for (let i = 0; i < 100 && monde.enCours.size; i++) await new Promise((r) => setTimeout(r, 50));
  physique.pas(1 / 60);
  const yDepart = (physique.solSous(depart.x, 300, depart.z) ?? monde.hauteur(depart.x, depart.z)) + 0.1;
  const joueur = new Joueur(physique, scene, depart.x, yDepart, depart.z);

  // --- Véhicules du joueur : stationnés le long de la rue (un de chaque type) ou restaurés.
  const flotte = [];
  if (sauv && sauv.vehicules.length) {
    for (const v of sauv.vehicules) if (TYPES[v.type]) {
      const ve = new Vehicule(physique, scene, v.type, v.x, v.y, v.z, v.a, v.couleur);
      ve.carburant = Number.isFinite(v.c) ? v.c : 1;
      flotte.push(ve);
    }
  } else {
    const route = new Trajet(surRoute.route.p);
    let d = Math.max(0, surRoute.d - 30);
    for (const type of ["taxi", "voiture", "moto", "minibus", "camion", "bus"]) {
      const p = route.point(Math.min(route.longueur, d));
      const ang = Math.atan2(-p.dx, -p.dz);
      const cote = (surRoute.largeur / 2) - TYPES[type].w / 2 - 0.3;
      const x = p.x - p.dz * cote, z = p.z + p.dx * cote;
      flotte.push(new Vehicule(physique, scene, type, x, monde.hauteur(x, z), z, ang));
      d += TYPES[type].l + 4;
    }
  }
  const trafic = new Trafic(scene, physique, monde);

  // --- Commandes ponctuelles ---------------------------------------------------
  function entrerSortir() {
    if (etat.mode === "pied") {
      const p = joueur.position();
      let meilleur = null, dmin = 4.5;
      for (const v of flotte) {
        const q = v.position();
        const d = Math.hypot(q.x - p.x, q.z - p.z) - TYPES[v.type].l / 4;
        if (d < dmin) { dmin = d; meilleur = v; }
      }
      if (!meilleur) return message("Aucun véhicule à proximité (approchez-vous à moins de 4 m).");
      etat.mode = "conduite";
      etat.vehicule = meilleur;
      meilleur.freinAMain = false;
      joueur.monter();
      ctl.lacet = 0;
      message(`${TYPES[meilleur.type].nom} — Z/W accélérer, S freiner/reculer, Q/A D tourner, F descendre, C caméra intérieure`);
    } else {
      const v = etat.vehicule;
      if (Math.abs(v.vitesse()) > 3) return message("Ralentissez pour descendre.");
      const p = v.position(), a = v.angle();
      const cote = TYPES[v.type].w / 2 + 0.8;
      const x = p.x - Math.cos(a) * cote, z = p.z + Math.sin(a) * cote;
      v.freinAMain = true;
      joueur.descendre(x, p.y + 0.3, z, a);
      etat.mode = "pied";
      etat.vehicule = null;
      etat.cameraInterieure = false;
      v.objet.visible = true;
      tableau.visible = false;
      message("Véhicule stationné (frein à main serré). Il restera ici, même après sauvegarde.");
    }
  }

  function interagir() {
    const l = etat.lieuProche;
    if (!l) return message("Rien à proximité. Approchez-vous d'un commerce, d'une station ou d'un établissement.");
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
      action = "Établissement de santé. Accueil fermé dans cette version (pas d'intérieur modélisé).";
    } else if (/store|shop|market|mall/.test(k)) {
      if (etat.argent >= 2000) { etat.argent -= 2000; action = "Achat : une bouteille d'eau et des arachides, 2 000 FC."; }
    } else action = "Établissement sans interaction pour l'instant.";
    message(`${l.n} — ${action}  (simulation de jeu : prix et services fictifs)`, 6);
  }

  function sauvegarder(silencieux) {
    const p = etat.vehicule ? etat.vehicule.position() : joueur.position();
    const ok = Sauvegarde.enregistrer({
      zone: ZONE, joueur: { x: p.x, y: p.y, z: p.z }, conduit: etat.vehicule ? flotte.indexOf(etat.vehicule) : -1,
      vehicules: flotte.map((v) => v.etat()), heure: env.heure, meteo: env.meteo, argent: etat.argent,
    });
    if (!silencieux) message(ok ? "Partie sauvegardée." : "Sauvegarde impossible (stockage du navigateur indisponible).");
  }

  if (sauv && sauv.conduit >= 0 && flotte[sauv.conduit]) {
    const v = flotte[sauv.conduit];
    const q = v.position();
    joueur.teleporter(q.x + 3, q.y + 0.5, q.z);
    entrerSortir();
  }

  // --- Caméra -----------------------------------------------------------------------
  // Tableau de bord affiché en caméra intérieure (attaché à la caméra).
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
  scene.add(camera);
  const cible = new THREE.Vector3();
  const voulue = new THREE.Vector3();
  const R = physique.R;
  function placerCamera(dt) {
    if (etat.mode === "conduite") {
      const v = etat.vehicule, p = v.position(), a = v.angle(), t = TYPES[v.type];
      v.objet.visible = !etat.cameraInterieure;
      tableau.visible = etat.cameraInterieure;
      if (etat.cameraInterieure) {
        const off = new THREE.Vector3(-t.w * 0.22, t.h * 0.78, -t.l * 0.08).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        camera.position.set(p.x + off.x, p.y + off.y, p.z + off.z);
        const reg = new THREE.Vector3(Math.sin(ctl.lacet) * 0.6, -0.05 - ctl.tangage * 0.2, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        camera.lookAt(camera.position.clone().add(reg));
        return;
      }
      const dist = Math.max(6, t.l * 1.25), haut = t.h + 1.4;
      ctl.lacet *= 1 - Math.min(1, dt * 1.5);   // la caméra revient derrière le véhicule
      const ang = a + ctl.lacet;
      cible.set(p.x, p.y + t.h * 0.7, p.z);
      voulue.set(p.x + Math.sin(ang) * dist, p.y + haut + ctl.tangage * 3, p.z + Math.cos(ang) * dist);
    } else {
      const p = joueur.position();
      cible.set(p.x, p.y + 1.6, p.z);
      const dist = 4.2;
      voulue.set(p.x + Math.sin(ctl.lacet) * Math.cos(ctl.tangage) * dist, p.y + 1.6 + Math.sin(ctl.tangage) * dist,
        p.z + Math.cos(ctl.lacet) * Math.cos(ctl.tangage) * dist);
    }
    // La caméra ne traverse pas les murs.
    const dir = voulue.clone().sub(cible);
    const lg = dir.length();
    dir.normalize();
    const hit = physique.monde.castRay(new R.Ray(cible, dir), lg, true, undefined, undefined, undefined,
      etat.vehicule ? etat.vehicule.corps : joueur.corps);
    if (hit) voulue.copy(cible).addScaledVector(dir, Math.max(0.6, hit.timeOfImpact - 0.3));
    camera.position.lerp(voulue, Math.min(1, dt * (etat.mode === "conduite" ? 6 : 14)));
    camera.lookAt(cible);
  }

  // --- Boucle ------------------------------------------------------------------------
  const horloge = new THREE.Clock();
  let tMonde = 0, tSauve = 0, tHud = 0, images = 0, ips = 0, tIps = 0;
  $("chargement").hidden = true;
  message("Bienvenue à Limete ! Z/W Q/A S D : marcher · Maj : courir · F : monter dans un véhicule · E : interagir · Échap : aide");
  const unGeste = () => { audio.demarrer(); removeEventListener("pointerdown", unGeste); removeEventListener("keydown", unGeste); };
  addEventListener("pointerdown", unGeste);
  addEventListener("keydown", unGeste);

  window.__jeu = { etat, joueur, flotte, trafic, env, monde, camera, entrerSortir, sauvegarder };

  function boucle() {
    requestAnimationFrame(boucle);
    // Temps réel conservé jusqu'à 10 images/s ; la physique avance par pas fixes de 1/60 s.
    const dt = Math.min(0.1, horloge.getDelta());
    const ax = ctl.axes();
    if (ctl.appui("KeyF")) entrerSortir();
    if (ctl.appui("KeyE")) interagir();
    if (ctl.appui("KeyC") && etat.mode === "conduite") etat.cameraInterieure = !etat.cameraInterieure;
    if (ctl.appui("KeyT")) { env.meteo = (env.meteo + 1) % 3; message("Météo : " + METEOS[env.meteo]); }
    if (ctl.appui("KeyN")) { env.heure = (env.heure + 3) % 24; message("Heure : " + env.heureTexte()); }
    if (ctl.appui("KeyH")) audio.klaxon(5);
    if (ctl.appui("KeyM")) audio.basculer();
    if (ctl.appui("KeyP")) sauvegarder();
    if (ctl.appui("KeyL") && etat.vehicule) etat.vehicule.allumerPhares(!etat.vehicule.phares);
    if (ctl.appui("Escape")) $("aide").hidden = !$("aide").hidden;
    if (ctl.appui("KeyG")) trafic.densite = (trafic.densite + 1) % 3, message("Circulation : " + ["faible", "normale", "forte"][trafic.densite]);

    // Joueur ou véhicule.
    if (etat.mode === "pied") {
      const c = Math.cos(ctl.lacet), s = Math.sin(ctl.lacet);
      const dx = ax.x * c - ax.y * s, dz = -ax.x * s - ax.y * c;
      joueur.mettreAJour(dt, dx, dz, ctl.courir(), ctl.appui("Space"));
    }
    const sousPas = Math.min(6, Math.max(1, Math.round(dt * 60)));
    const h = dt / sousPas;
    for (let k = 0; k < sousPas; k++) {
      if (etat.mode === "conduite") {
        const v = etat.vehicule;
        const vit = v.vitesse();
        let acc = ax.y, frein = ctl.frein() ? 1 : 0;
        if (ax.y < 0 && vit > 1) { acc = 0; frein = Math.max(frein, -ax.y); }   // S = frein tant qu'on avance
        v.commander(acc, -ax.x, frein, h);
      }
      for (const v of flotte) v.mettreAJour(h);
      physique.pas(h);
    }
    if (etat.mode === "conduite") {
      const p = etat.vehicule.position();
      joueur.teleporter(p.x, p.y, p.z);
    }

    // Monde, circulation, environnement.
    const pj = etat.vehicule ? etat.vehicule.position() : joueur.position();
    tMonde -= dt;
    if (tMonde <= 0) { monde.mettreAJour(pj.x, pj.z); tMonde = 0.5; }
    trafic.mettreAJour(dt, pj, flotte.map((v) => v.position()));
    placerCamera(dt);
    const { nuit, couvert } = env.mettreAJour(dt, new THREE.Vector3(pj.x, pj.y, pj.z), camera, monde.lampadaires);
    if (monde.uNuit) monde.uNuit.value = nuit;
    monde.lampeMat.emissiveIntensity = nuit > 0.3 ? 3 * nuit : 0;
    trafic.eclairage(nuit > 0.5);
    if (etat.vehicule && nuit > 0.5 && !etat.vehicule.phares && !etat._pharesAuto) { etat.vehicule.allumerPhares(true); etat._pharesAuto = true; }
    if (nuit < 0.3) etat._pharesAuto = false;
    audio.mettreAJour(dt, { enVoiture: !!etat.vehicule, regime: etat.vehicule ? Math.min(1, Math.abs(etat.vehicule.vitesse()) / 25) : 0, pluie: env.pluie01, nuit });

    // Lieu proche (interactions).
    tHud -= dt;
    if (tHud <= 0) {
      tHud = 0.25;
      let proche = null, dmin = 14;
      for (const l of monde.lieux) {
        const d = Math.hypot(l.x - pj.x, l.z - pj.z);
        if (d < dmin) { dmin = d; proche = l; }
      }
      etat.lieuProche = proche;
      $("lieu").hidden = !proche;
      if (proche) $("lieu").textContent = `E : ${proche.n}`;
      const g = proj.versGeo(pj.x, pj.z);
      $("hud-heure").textContent = env.heureTexte() + " · " + METEOS[env.meteo];
      $("hud-argent").textContent = etat.argent.toLocaleString("fr-FR") + " FC";
      $("hud-pos").textContent = `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} · ${ips} i/s`;
      $("hud-carte").href = `../index.html#18/${g.lat.toFixed(5)}/${g.lon.toFixed(5)}/0/60`;
      const v = etat.vehicule;
      $("hud-vitesse").hidden = !v;
      if (v) {
        $("vitesse").textContent = Math.round(Math.abs(v.vitesse()) * 3.6);
        $("carburant").style.width = `${v.carburant * 100}%`;
        $("vehicule-nom").textContent = TYPES[v.type].nom;
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

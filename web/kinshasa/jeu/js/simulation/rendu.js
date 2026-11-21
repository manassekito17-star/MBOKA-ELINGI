// Affichage de la simulation urbaine AUTOUR DU JOUEUR uniquement (niveaux de détail) :
//  - véhicules < 220 m : modèle 3D (réservoir d'objets réutilisés), roues qui tournent,
//    inclinaison des motos, feux stop, phares la nuit, gyrophares ;
//  - conducteurs et passagers animés < 70 m ;
//  - piétons animés < 110 m (réservoir), animations variées et désynchronisées ;
//  - feux tricolores, abribus et passages piétons < 260 m ;
//  - collisions physiques (Rapier) pour les véhicules < 45 m seulement.
// Au-delà, la simulation continue (circulation simplifiée, sans physique ni rendu).
import * as THREE from "three";
import { modele, TYPES, PLACES } from "../vehicules.js";
import { creerPersonnage, apparenceAleatoire } from "../personnages.js";
import { RAPIER } from "../physique.js";

const R_VEH = 220, R_CONDUCTEUR = 70, R_PIETON = 110, R_DECOR = 260, R_PHYS = 45;

export class RenduCirculation {
  constructor(scene, physique, sim, monde, qualite) {
    this.scene = scene;
    this.physique = physique;
    this.sim = sim;
    this.monde = monde;
    this.basse = qualite === "basse";
    this.reservoirs = new Map();       // type -> [modèles libres]
    this.actifs = new Map();           // id véhicule -> {objet, type, conducteur, passager, yaw}
    this.persoLibres = [];
    this.pietonsActifs = new Map();    // id piéton -> perso
    this.maxPietons = this.basse ? 18 : 40;
    this.maxConducteurs = this.basse ? 6 : 16;
    this.decors = new Map();           // clé -> Object3D (feux, abribus, passages)
    this.feuxMats = [];                // {arc, rouge, orange, vert}
    this.nuit = 0;
    this.t = 0;
    // Collisions physiques : réservoir de corps cinématiques.
    this.corps = [];
    for (let i = 0; i < (this.basse ? 10 : 24); i++) {
      const c = physique.monde.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0));
      const col = physique.monde.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.8, 2.3).setTranslation(0, 0.9, 0), c);
      this.corps.push({ c, col, id: null, type: null });
    }
    for (let i = 0; i < this.maxPietons + this.maxConducteurs; i++) {
      const p = creerPersonnage(apparenceAleatoire(i * 7919 + 13));
      p.objet.visible = false;
      scene.add(p.objet);
      this.persoLibres.push(p);
    }
    this.persoTotal = this.persoLibres.length;
  }

  _prendreModele(type) {
    const l = this.reservoirs.get(type);
    if (l && l.length) { const o = l.pop(); o.visible = true; return o; }
    const t = TYPES[type];
    const o = modele(type, t.couleurs[Math.floor(Math.random() * t.couleurs.length)]);
    this.scene.add(o);
    return o;
  }

  _rendreModele(type, o) {
    o.visible = false;
    if (!this.reservoirs.has(type)) this.reservoirs.set(type, []);
    this.reservoirs.get(type).push(o);
  }

  _prendrePerso() { return this.persoLibres.pop() || null; }
  _rendrePerso(p) {
    if (!p) return;
    p.objet.parent?.remove(p.objet);
    this.scene.add(p.objet);
    p.objet.visible = false;
    this.persoLibres.push(p);
  }

  mettreAJour(dt, cx, cz, nuit) {
    this.t += dt;
    this.nuit = nuit;
    const sim = this.sim;
    const hauteur = (x, z) => this.monde.hauteur(x, z);
    // ---------------------------------------------------------- véhicules
    const vus = new Set();
    const proches = [];
    for (const v of sim.vehicules) {
      const d = Math.hypot(v.x - cx, v.z - cz);
      if (d > R_VEH) continue;
      vus.add(v.id);
      proches.push([v, d]);
      let a = this.actifs.get(v.id);
      if (!a) {
        a = { objet: this._prendreModele(v.type), type: v.type, yaw: -v.cap, dist: v.distance, conducteur: null, passager: null };
        this.actifs.set(v.id, a);
        for (const p of a.objet.userData.phares) p.material.emissiveIntensity = nuit > 0.5 ? 2.5 : 0;
      }
      const o = a.objet;
      const y = hauteur(v.x, v.z);
      o.position.set(v.x, y, v.z);
      const cible = -v.cap;
      const dyaw = Math.atan2(Math.sin(cible - a.yaw), Math.cos(cible - a.yaw));
      a.yaw += dyaw * Math.min(1, dt * 8);
      o.rotation.set(0, a.yaw, 0);
      if (v.type === "moto") o.rotateZ(Math.max(-0.45, Math.min(0.45, -dyaw * v.v * 0.6)));
      const t = TYPES[v.type];
      const dd = v.distance - a.dist;
      a.dist = v.distance;
      for (const r of o.userData.roues) r.roue.rotation.x -= dd / t.r;
      for (const m of o.userData.arriere) m.material.emissiveIntensity = v.freine ? 2.5 : nuit > 0.5 ? 0.8 : 0.25;
      if (o.userData.gyro.length) {
        const f = Math.floor(this.t * 4) % 2;
        o.userData.gyro.forEach((m, i) => { m.emissiveIntensity = v.sirene ? (i === f ? 3 : 0.2) : 0; });
      }
      if (v.etat === "accident") for (const m of o.userData.arriere) m.material.emissiveIntensity = Math.floor(this.t * 2) % 2 ? 3 : 0;
    }
    for (const [id, a] of this.actifs) {
      if (vus.has(id)) continue;
      this._rendrePerso(a.conducteur); this._rendrePerso(a.passager);
      this._rendreModele(a.type, a.objet);
      this.actifs.delete(id);
    }
    // Conducteurs et passagers visibles (les plus proches seulement).
    proches.sort((x, y) => x[1] - y[1]);
    let nbConducteurs = 0;
    for (const [v, d] of proches) {
      const a = this.actifs.get(v.id);
      const voulu = d < R_CONDUCTEUR && nbConducteurs < this.maxConducteurs && !v.joueurABord;
      if (voulu && !a.conducteur) {
        a.conducteur = this._prendrePerso();
        if (a.conducteur) {
          const [x, y, z] = PLACES[v.type][0];
          a.conducteur.objet.position.set(x, y, z);
          a.conducteur.objet.rotation.set(0, 0, 0);
          a.conducteur.objet.visible = true;
          a.objet.add(a.conducteur.objet);
          a.conducteur.jouer("Driving", 0, 1, v.id * 0.37);
        }
      } else if (!voulu && a.conducteur) { this._rendrePerso(a.conducteur); a.conducteur = null; }
      if (a.conducteur) { nbConducteurs++; if (d < 40) a.conducteur.mettreAJour(dt); }
      // Passager de moto-taxi visible derrière le conducteur.
      const passager = v.type === "moto" && v.passagers.length > 0 && voulu;
      if (passager && !a.passager) {
        a.passager = this._prendrePerso();
        if (a.passager) {
          const [x, y, z] = PLACES.moto[1];
          a.passager.objet.position.set(x, y, z);
          a.passager.objet.visible = true;
          a.objet.add(a.passager.objet);
          a.passager.jouer("Sitting_Idle", 0);
        }
      } else if (!passager && a.passager) { this._rendrePerso(a.passager); a.passager = null; }
      if (a.passager && d < 40) a.passager.mettreAJour(dt);
    }
    // Collisions physiques pour les véhicules les plus proches.
    const physiques = proches.filter(([, d]) => d < R_PHYS).slice(0, this.corps.length);
    this.corps.forEach((c, i) => {
      const e = physiques[i];
      if (!e) { if (c.id !== null) { c.c.setNextKinematicTranslation({ x: 0, y: -500, z: 0 }); c.id = null; } return; }
      const [v] = e;
      if (c.type !== v.type) {
        const t = TYPES[v.type];
        c.col.setHalfExtents({ x: t.w / 2, y: t.h * 0.4, z: t.l / 2 });
        c.type = v.type;
      }
      c.id = v.id;
      const a = this.actifs.get(v.id);
      c.c.setNextKinematicTranslation({ x: v.x, y: hauteur(v.x, v.z), z: v.z });
      c.c.setNextKinematicRotation({ x: 0, y: Math.sin(a.yaw / 2), z: 0, w: Math.cos(a.yaw / 2) });
    });
    // ------------------------------------------------------------- piétons
    const candidats = [];
    for (const p of sim.pietons) {
      if (p.etat === "aBord") continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < R_PIETON) candidats.push([p, d]);
    }
    candidats.sort((x, y) => x[1] - y[1]);
    const garder = new Set(candidats.slice(0, this.maxPietons).map(([p]) => p.id));
    for (const [id, perso] of this.pietonsActifs) {
      if (!garder.has(id)) { this._rendrePerso(perso); this.pietonsActifs.delete(id); }
    }
    for (const [p, d] of candidats.slice(0, this.maxPietons)) {
      let perso = this.pietonsActifs.get(p.id);
      if (!perso) {
        perso = this._prendrePerso();
        if (!perso) break;
        perso.objet.visible = true;
        this.pietonsActifs.set(p.id, perso);
      }
      perso.objet.position.set(p.x, hauteur(p.x, p.z), p.z);
      perso.objet.rotation.y = -p.cap;
      const dec = (p.variante % 97) / 10;
      if (p.etat === "marche") perso.jouer("Walk", 0.3, p.v / 1.3, dec);
      else if (p.etat === "traverse") perso.jouer(p.v > 1.3 ? "Jog_Fwd" : "Walk", 0.2, 1.1, dec);
      else perso.jouer(p.variante % 3 === 0 ? "Idle_Talking" : "Idle", 0.4, 0.8 + (p.variante % 5) * 0.08, dec);
      if (d < 70 || Math.floor(this.t * 10) % 3 === 0) perso.mettreAJour(d < 70 ? dt : dt * 3);
    }
    // ---------------------------------------------------- décor routier proche
    this._decor(cx, cz);
    for (const f of this.feuxMats) {
      const e = sim.etatFeu(f.arc);
      f.rouge.emissiveIntensity = e === "rouge" ? 3 : 0.05;
      f.orange.emissiveIntensity = e === "orange" ? 3 : 0.05;
      f.vert.emissiveIntensity = e === "vert" ? 3 : 0.05;
    }
  }

  /** Phares des véhicules (nuit). */
  phares(on) {
    for (const a of this.actifs.values()) for (const p of a.objet.userData.phares) p.material.emissiveIntensity = on ? 2.5 : 0;
  }

  _decor(cx, cz) {
    const sim = this.sim, R = sim.R;
    const voulus = new Set();
    // Feux tricolores (simulés : aucun feu n'est cartographié dans la zone).
    for (const c of sim.controleurs) {
      if (Math.hypot(c.x - cx, c.z - cz) > R_DECOR) continue;
      const k = "feu" + c.id;
      voulus.add(k);
      if (this.decors.has(k)) continue;
      const g = new THREE.Group();
      const mats = [];
      for (const nid of c.noeuds) {
        for (const e of R.noeuds[nid].entrants) {
          const a = R.arcs[e];
          if (a.rang < 2 || R.noeuds[a.de].grappe === R.noeuds[a.vers].grappe) continue;
          const p = R.point(e, Math.max(0, a.long - 9), a.largeur / 2 + 0.8);
          const y = this.monde.hauteur(p.x, p.z);
          const feu = this._feuTricolore();
          feu.groupe.position.set(p.x, y, p.z);
          feu.groupe.rotation.y = Math.atan2(p.dx, p.dz);   // face aux véhicules qui arrivent
          g.add(feu.groupe);
          mats.push({ arc: e, ...feu.mats, k });
        }
      }
      this.feuxMats.push(...mats);
      this.scene.add(g);
      this.decors.set(k, g);
    }
    // Abribus (arrêts réels et simulés).
    for (const a of sim.arrets.values()) {
      if (Math.hypot(a.x - cx, a.z - cz) > R_DECOR) continue;
      const k = "arret" + a.id;
      voulus.add(k);
      if (this.decors.has(k)) continue;
      const q = R.arcProche(a.x, a.z);
      const arc = R.arcs[q.arc];
      const p = R.point(q.arc, q.s, arc.largeur / 2 + 2.6);
      const g = this._abribus(a);
      g.position.set(p.x, this.monde.hauteur(p.x, p.z), p.z);
      g.rotation.y = Math.atan2(-p.dx, -p.dz) + Math.PI / 2;
      this.scene.add(g);
      this.decors.set(k, g);
    }
    // Passages piétons (zébras).
    for (const c of sim.passages) {
      if (Math.hypot(c.x - cx, c.z - cz) > R_DECOR) continue;
      const k = "pp" + c.id;
      voulus.add(k);
      if (this.decors.has(k)) continue;
      const arc = R.arcs[c.arcs[0].arc];
      const g = new THREE.Group();
      const n = Math.max(3, Math.floor(arc.largeur / 1.0));
      const mat = new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.8 });
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 3), mat);
        b.position.set(-arc.largeur / 2 + (i + 0.5) * (arc.largeur / n), 0, 0);
        b.receiveShadow = true;
        g.add(b);
      }
      g.position.set(c.x, this.monde.hauteur(c.x, c.z) + 0.12, c.z);
      g.rotation.y = Math.atan2(c.dx, c.dz);
      this.scene.add(g);
      this.decors.set(k, g);
    }
    for (const [k, o] of this.decors) {
      if (voulus.has(k)) continue;
      this.scene.remove(o);
      o.traverse((x) => x.geometry?.dispose());
      this.decors.delete(k);
      this.feuxMats = this.feuxMats.filter((f) => f.k !== k);
    }
  }

  _feuTricolore() {
    const g = new THREE.Group();
    const gris = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.4 });
    const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6), gris);
    poteau.position.y = 1.8;
    const boitier = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.26), gris);
    boitier.position.y = 3.6;
    g.add(poteau, boitier);
    const mats = {};
    for (const [nom, c, y] of [["rouge", 0xff2a1a, 3.92], ["orange", 0xffa000, 3.6], ["vert", 0x22dd55, 3.28]]) {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05 });
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), m);
      l.position.set(0, y, 0.135);
      g.add(l);
      mats[nom] = m;
    }
    return { groupe: g, mats };
  }

  _abribus(arret) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x5f6b75, metalness: 0.6, roughness: 0.4 });
    const toit = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.8), new THREE.MeshStandardMaterial({ color: arret.reel ? 0x1565c0 : 0x8d8d8d }));
    toit.position.y = 2.6;
    toit.castShadow = true;
    g.add(toit);
    for (const x of [-1.9, 1.9]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), metal);
      p.position.set(x, 1.3, -0.7);
      g.add(p);
    }
    const banc = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.45), metal);
    banc.position.set(0, 0.5, -0.5);
    g.add(banc);
    // Panneau : nom de l'arrêt (et mention « simulé » le cas échéant).
    const toile = document.createElement("canvas");
    toile.width = 512; toile.height = 128;
    const ctx = toile.getContext("2d");
    ctx.fillStyle = arret.reel ? "#0d47a1" : "#555";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 44px sans-serif";
    ctx.fillText("ARRÊT", 16, 52);
    ctx.font = "30px sans-serif";
    ctx.fillText((arret.nom || "").slice(0, 30), 16, 100);
    const tex = new THREE.CanvasTexture(toile);
    tex.colorSpace = THREE.SRGBColorSpace;
    const panneau = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    panneau.position.set(2.3, 2.2, 0.2);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), metal);
    mat.position.set(2.3, 1.2, 0.2);
    g.add(panneau, mat);
    return g;
  }

  /** Objet 3D du véhicule simulé (pour suivre un bus ou une moto avec la caméra). */
  objetVehicule(id) {
    return this.actifs.get(id)?.objet || null;
  }
}

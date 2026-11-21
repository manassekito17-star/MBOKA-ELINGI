// Circulation et piétons SIMULÉS sur les vraies routes de la zone.
// Ce n'est pas le trafic réel : densité réglable (faible / normale / forte),
// véhicules cinématiques qui suivent les routes, ralentissent et s'arrêtent
// devant le joueur ou un autre véhicule. Seuls les agents proches existent.
import * as THREE from "three";
import { Trajet, aleatoire } from "./geo.js";
import { modele, TYPES } from "./vehicules.js";
import { creerPersonnage } from "./personnages.js";
import { RAPIER } from "./physique.js";

const VITESSE = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 6 };
const MELANGE = [["taxi", 0.3], ["minibus", 0.25], ["voiture", 0.25], ["moto", 0.12], ["bus", 0.04], ["camion", 0.04]];

export class Trafic {
  constructor(scene, physique, monde) {
    this.scene = scene;
    this.physique = physique;
    this.monde = monde;
    this.vehicules = [];
    this.pietons = [];
    this.densite = 1;     // 0 = faible, 1 = normale, 2 = forte
    this.rnd = aleatoire(2026);
    this.routes = monde.reseau.map((r) => ({ t: new Trajet(r.p), k: r.k })).filter((r) => r.t.longueur > 30);
    this.grands = this.routes.filter((r) => ["trunk", "primary", "secondary", "tertiary"].includes(r.k));
    this.rues = this.routes.filter((r) => ["residential", "unclassified", "tertiary"].includes(r.k));
  }

  cibles() {
    const f = [0.5, 1, 1.8][this.densite];
    return { v: Math.round(28 * f), p: Math.round(22 * f) };
  }

  /** Routes ayant au moins un point à moins de `rayon` m du joueur (mis en cache 2 s). */
  _proches(liste, x, z, rayon) {
    const cle = liste === this.grands ? "g" : "r";
    this._cache ??= {};
    const c = this._cache[cle];
    if (c && Math.hypot(c.x - x, c.z - z) < 40 && performance.now() - c.t < 2000) return c.l;
    const l = liste.filter((r) => r.t.pts.some(([px, pz]) => Math.abs(px - x) < rayon && Math.abs(pz - z) < rayon));
    this._cache[cle] = { x, z, t: performance.now(), l };
    return l;
  }

  _choisir(listeComplete, x, z, rmin, rmax) {
    const liste = this._proches(listeComplete, x, z, rmax);
    if (!liste.length) return null;
    for (let essai = 0; essai < 30; essai++) {
      const r = liste[Math.floor(this.rnd() * liste.length)];
      const d = this.rnd() * r.t.longueur;
      const p = r.t.point(d);
      const dist = Math.hypot(p.x - x, p.z - z);
      if (dist > rmin && dist < rmax) return { r, d };
    }
    return null;
  }

  _type() {
    let u = this.rnd();
    for (const [t, p] of MELANGE) { if ((u -= p) <= 0) return t; }
    return "voiture";
  }

  mettreAJour(dt, joueur, autresObstacles) {
    const { x, z } = joueur;
    const c = this.cibles();
    // Apparition hors du champ proche, disparition au-delà de 260 m.
    while (this.vehicules.length < c.v && this.grands.length) {
      const pos = this._choisir(this.rnd() < 0.7 ? this.grands : this.rues, x, z, 70, 240);
      if (!pos) break;
      this._ajouterVehicule(pos);
    }
    while (this.pietons.length < c.p && this.rues.length) {
      const pos = this._choisir(this.rues, x, z, 25, 140);
      if (!pos) break;
      this._ajouterPieton(pos);
    }
    const obstacles = [{ x, z }, ...autresObstacles];
    for (const v of this.vehicules) {
      const p = v.r.t.point(v.d);
      const avant = v.r.t.point(v.d + v.sens * 9);
      let libre = true;
      for (const o of obstacles) if (Math.hypot(o.x - avant.x, o.z - avant.z) < 4.5) libre = false;
      for (const w of this.vehicules) {
        if (w !== v && w.r === v.r && w.sens === v.sens && (w.d - v.d) * v.sens > 0 && (w.d - v.d) * v.sens < 12) libre = false;
      }
      v.v += ((libre ? v.vmax : 0) - v.v) * Math.min(1, dt * (libre ? 0.8 : 4));
      v.d += v.v * v.sens * dt;
      if (v.d <= 0 || v.d >= v.r.t.longueur) { v.sens *= -1; v.d = Math.max(0, Math.min(v.r.t.longueur, v.d)); }
      const dx = p.dx * v.sens, dz = p.dz * v.sens;
      const cote = v.voie;   // circulation à droite
      const px = p.x - dz * cote, pz = p.z + dx * cote;
      const py = this.monde.hauteur(px, pz);
      const ang = Math.atan2(-dx, -dz);
      v.objet.position.set(px, py, pz);
      v.objet.rotation.y += Math.atan2(Math.sin(ang - v.objet.rotation.y), Math.cos(ang - v.objet.rotation.y)) * Math.min(1, dt * 6);
      v.corps.setNextKinematicTranslation({ x: px, y: py + 0.8, z: pz });
      v.corps.setNextKinematicRotation({ x: 0, y: Math.sin(v.objet.rotation.y / 2), z: 0, w: Math.cos(v.objet.rotation.y / 2) });
      for (const r of v.objet.userData.roues) r.roue.rotation.x -= (v.v * dt) / TYPES[v.type].r;
      if (v.pilote) v.pilote.mettreAJour(dt);
      v.loin = Math.hypot(px - x, pz - z) > 260;
    }
    for (const p of this.pietons) {
      const q = p.r.t.point(p.d);
      p.d += p.vit * p.sens * dt;
      if (p.d <= 0 || p.d >= p.r.t.longueur) p.sens *= -1;
      const dx = q.dx * p.sens, dz = q.dz * p.sens;
      const px = q.x - dz * p.cote, pz = q.z + dx * p.cote;
      p.perso.objet.position.set(px, this.monde.hauteur(px, pz), pz);
      p.perso.objet.rotation.y = Math.atan2(-dx, -dz);
      const d = Math.hypot(px - x, pz - z);
      p.perso.objet.visible = d < 120;
      if (d < 90) p.perso.mettreAJour(dt);
      p.loin = d > 160;
    }
    for (const v of this.vehicules.filter((v) => v.loin)) this._retirerVehicule(v);
    for (const p of this.pietons.filter((p) => p.loin)) this._retirerPieton(p);
  }

  _ajouterVehicule({ r, d }) {
    const type = r.k === "residential" ? (this.rnd() < 0.5 ? "moto" : "voiture") : this._type();
    const t = TYPES[type];
    const objet = modele(type, t.couleurs[Math.floor(this.rnd() * t.couleurs.length)]);
    this.scene.add(objet);
    const corps = this.physique.monde.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.physique.monde.createCollider(RAPIER.ColliderDesc.cuboid(t.w / 2, t.h * 0.4, t.l / 2).setTranslation(0, t.h * 0.1, 0), corps);
    const largeur = r.k === "residential" ? 1.4 : 2.2;
    const v = { r, d, type, objet, corps, sens: this.rnd() < 0.5 ? 1 : -1, v: 0,
      vmax: (VITESSE[r.k] || 8) * (0.8 + this.rnd() * 0.4), voie: largeur };
    if (type === "moto") {
      v.pilote = creerPersonnage({ femme: false });
      v.pilote.objet.position.set(0, 0.25, 0.25);
      v.pilote.jouer("Sitting_Idle", 0);
      objet.add(v.pilote.objet);
    }
    if (this.nuit) for (const p of objet.userData.phares) p.material.emissiveIntensity = 2.5;
    this.vehicules.push(v);
  }

  _retirerVehicule(v) {
    this.scene.remove(v.objet);
    this.physique.monde.removeRigidBody(v.corps);
    this.vehicules.splice(this.vehicules.indexOf(v), 1);
  }

  _ajouterPieton({ r, d }) {
    const perso = creerPersonnage({ femme: this.rnd() < 0.5 });
    perso.jouer("Walk", 0, 0.9 + this.rnd() * 0.2);
    this.scene.add(perso.objet);
    this.pietons.push({ r, d, perso, sens: this.rnd() < 0.5 ? 1 : -1, vit: 1.1 + this.rnd() * 0.4,
      cote: (r.k === "residential" ? 3.2 : 5.5) * (this.rnd() < 0.5 ? 1 : -1) });
  }

  _retirerPieton(p) {
    this.scene.remove(p.perso.objet);
    this.pietons.splice(this.pietons.indexOf(p), 1);
  }

  /** Phares des véhicules la nuit. */
  eclairage(nuit) {
    if (this.nuit === nuit) return;
    this.nuit = nuit;
    for (const v of this.vehicules) for (const p of v.objet.userData.phares) p.material.emissiveIntensity = nuit ? 2.5 : 0;
  }
}

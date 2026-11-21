// Joueur à pied : contrôleur de personnage Rapier (collisions avec bâtiments,
// véhicules, marches et pentes) et animations :
// immobile, marche lente, marche, course, sprint (course prolongée), saut,
// accroupi (immobile et en marche), interaction, monter / descendre d'un véhicule,
// conduire, assis (passager), attente.
import * as THREE from "three";
import { RAPIER } from "./physique.js";
import { creerPersonnage } from "./personnages.js";

const LENTE = 0.9, MARCHE = 1.6, COURSE = 3.8, SPRINT = 6.4, ACCROUPI = 1.0, SAUT = 5.0;

export class Joueur {
  constructor(physique, scene, x, y, z, apparence) {
    this.physique = physique;
    this.scene = scene;
    this.perso = creerPersonnage(apparence);
    this.objet = this.perso.objet;
    scene.add(this.objet);
    const W = physique.monde;
    this.corps = W.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 1, z));
    this.collider = W.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(0, 0.85, 0), this.corps);
    this.ctrl = W.createCharacterController(0.02);
    this.ctrl.enableAutostep(0.45, 0.25, true);
    this.ctrl.enableSnapToGround(0.5);
    this.ctrl.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.ctrl.setApplyImpulsesToDynamicBodies(true);
    this.vy = 0;
    this.auSol = false;
    this.cap = 0;
    this.vitesseH = 0;
    this.actif = true;       // false quand le joueur est dans un véhicule
    this.accroupi = false;
    this.tempsCourse = 0;    // la course devient un sprint après 1,5 s
    this.immobile = 0;
    this.verrou = 0;         // animation ponctuelle en cours (interaction…)
  }

  /** Change l'apparence (éditeur de personnage). */
  changerApparence(apparence) {
    const visible = this.objet.visible, parent = this.objet.parent;
    const pos = this.objet.position.clone(), rot = this.objet.rotation.clone();
    parent?.remove(this.objet);
    this.perso.liberer();
    this.perso = creerPersonnage(apparence);
    this.objet = this.perso.objet;
    this.objet.position.copy(pos);
    this.objet.rotation.copy(rot);
    this.objet.visible = visible;
    (parent || this.scene).add(this.objet);
  }

  /** dirX, dirZ : direction voulue dans le monde (déjà tournée selon la caméra). */
  mettreAJour(dt, dirX, dirZ, { courir = false, lent = false, sauter = false } = {}) {
    if (!this.actif) { this.perso.mettreAJour(dt); return; }
    this.verrou = Math.max(0, this.verrou - dt);
    const n = this.verrou > 0 ? 0 : Math.hypot(dirX, dirZ);
    this.tempsCourse = courir && n > 0.05 ? this.tempsCourse + dt : 0;
    let cibleV = 0;
    if (n > 0.05) {
      if (this.accroupi) cibleV = ACCROUPI;
      else if (courir) cibleV = this.tempsCourse > 1.5 ? SPRINT : COURSE;
      else cibleV = lent ? LENTE : MARCHE;
      cibleV *= Math.min(1, n);
    }
    this.vitesseH += (cibleV - this.vitesseH) * Math.min(1, dt * 6);
    if (n > 0.05) {
      const cible = Math.atan2(-dirX, -dirZ);
      let d = cible - this.cap;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.cap += d * Math.min(1, dt * 10);
    }
    if (this.auSol && sauter && !this.accroupi && this.verrou === 0) this.vy = SAUT;
    this.vy = this.auSol && this.vy < 0 ? -1 : this.vy - 9.81 * dt;
    const mouv = { x: -Math.sin(this.cap) * this.vitesseH * dt, y: this.vy * dt, z: -Math.cos(this.cap) * this.vitesseH * dt };
    this.ctrl.computeColliderMovement(this.collider, mouv);
    const m = this.ctrl.computedMovement();
    this.auSol = this.ctrl.computedGrounded();
    const p = this.corps.translation();
    this.corps.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    this.objet.position.set(p.x + m.x, p.y + m.y, p.z + m.z);
    this.objet.rotation.y = this.cap;
    // Animation selon la vitesse réellement obtenue (un mur arrête aussi l'animation).
    const vr = Math.hypot(m.x, m.z) / Math.max(dt, 1e-3);
    this.immobile = vr < 0.2 ? this.immobile + dt : 0;
    if (this.verrou === 0) {
      if (!this.auSol && this.vy > 0.5) this.perso.jouer("Jump", 0.1);
      else if (this.accroupi) this.perso.jouer(vr < 0.2 ? "Crouch_Idle" : "Crouch_Fwd", 0.25, Math.max(0.6, vr / 1.0));
      else if (vr < 0.2) this.perso.jouer(this.immobile > 8 ? "Idle_Talking" : "Idle", 0.35);
      else if (vr < 1.2) this.perso.jouer("Walk", 0.3, vr / 1.25);
      else if (vr < 2.4) this.perso.jouer("Walk", 0.25, vr / 1.5);
      else if (vr < 5) this.perso.jouer("Jog_Fwd", 0.25, vr / 3.6);
      else this.perso.jouer("Sprint", 0.25, vr / 6.5);
    }
    this.perso.mettreAJour(dt);
  }

  /** Animation ponctuelle (interaction, monter en voiture…) : bloque le déplacement un instant. */
  geste(nom = "Interact", vitesse = 1.4) {
    const d = this.perso.unique(nom, "Idle", vitesse);
    this.verrou = d;
    return d;
  }

  position() { return this.corps.translation(); }

  teleporter(x, y, z) {
    this.corps.setTranslation({ x, y, z }, true);
    this.corps.setNextKinematicTranslation({ x, y, z });
    if (this.actif) this.objet.position.set(x, y, z);
    this.vy = 0;
  }

  /**
   * Monte dans un véhicule : le personnage est assis à la place `place`
   * de l'objet 3D `parent` (conducteur : animation de conduite).
   */
  monter(parent, place, conducteur = true) {
    this.actif = false;
    this.collider.setEnabled(false);
    this.accroupi = false;
    if (parent && place) {
      parent.add(this.objet);
      this.objet.position.set(place[0], place[1], place[2]);
      this.objet.rotation.set(0, 0, 0);
      this.objet.visible = true;
      this.perso.jouer(conducteur ? "Driving" : "Sitting_Idle", 0.2);
    } else {
      this.objet.visible = false;
    }
  }

  descendre(x, y, z, cap) {
    this.objet.parent?.remove(this.objet);
    this.scene.add(this.objet);
    this.objet.visible = true;
    this.actif = true;
    this.collider.setEnabled(true);
    this.teleporter(x, y, z);
    this.objet.position.set(x, y, z);
    this.cap = cap;
    this.objet.rotation.set(0, cap, 0);
    this.geste("Interact", 1.8);
  }
}

// Joueur à pied : contrôleur de personnage Rapier (collisions avec bâtiments,
// véhicules, marches et pentes), marche / course / saut, animations.
import * as THREE from "three";
import { RAPIER } from "./physique.js";
import { creerPersonnage } from "./personnages.js";

const MARCHE = 1.6, COURSE = 5.8, SAUT = 5.0;

export class Joueur {
  constructor(physique, scene, x, y, z) {
    this.physique = physique;
    this.perso = creerPersonnage({ peau: 0x45291a, haut: 0xd9822b, bas: 0x2c3e66, chaussures: 0xeeeeea, motifWax: true });
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
    this.cap = 0;            // orientation du personnage (radians)
    this.vitesseH = 0;
    this.actif = true;       // false quand le joueur conduit
  }

  /** dirX, dirZ : direction voulue dans le monde (déjà tournée selon la caméra). */
  mettreAJour(dt, dirX, dirZ, courir, sauter) {
    if (!this.actif) return;
    const n = Math.hypot(dirX, dirZ);
    const v = n > 0.05 ? (courir ? COURSE : MARCHE * 1.4) * Math.min(1, n) : 0;
    this.vitesseH += (v - this.vitesseH) * Math.min(1, dt * 10);
    if (n > 0.05) {
      const cible = Math.atan2(-dirX, -dirZ);
      let d = cible - this.cap;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.cap += d * Math.min(1, dt * 12);
    }
    if (this.auSol && sauter) this.vy = SAUT;
    this.vy = this.auSol && this.vy < 0 ? -1 : this.vy - 9.81 * dt;
    const mouv = { x: -Math.sin(this.cap) * this.vitesseH * dt, y: this.vy * dt, z: -Math.cos(this.cap) * this.vitesseH * dt };
    this.ctrl.computeColliderMovement(this.collider, mouv);
    const m = this.ctrl.computedMovement();
    this.auSol = this.ctrl.computedGrounded();
    const p = this.corps.translation();
    this.corps.setNextKinematicTranslation({ x: p.x + m.x, y: p.y + m.y, z: p.z + m.z });
    this.objet.position.set(p.x + m.x, p.y + m.y, p.z + m.z);
    this.objet.rotation.y = this.cap;
    // Animation selon la vitesse réelle.
    const vr = Math.hypot(m.x, m.z) / Math.max(dt, 1e-3);
    if (!this.auSol && this.vy > 0.5) this.perso.jouer("Jump", 0.1);
    else if (vr < 0.3) this.perso.jouer("Idle", 0.3);
    else if (vr < 3.0) this.perso.jouer("Walk", 0.25, vr / 1.5);
    else this.perso.jouer("Sprint", 0.25, vr / 6.5);
    this.perso.mettreAJour(dt);
  }

  position() { return this.corps.translation(); }

  teleporter(x, y, z) {
    this.corps.setTranslation({ x, y, z }, true);
    this.corps.setNextKinematicTranslation({ x, y, z });
    this.objet.position.set(x, y, z);
    this.vy = 0;
  }

  /** Masque le personnage (il est dans un véhicule) et désactive ses collisions. */
  monter() {
    this.actif = false;
    this.objet.visible = false;
    this.collider.setEnabled(false);
  }

  descendre(x, y, z, cap) {
    this.teleporter(x, y, z);
    this.cap = cap;
    this.actif = true;
    this.objet.visible = true;
    this.collider.setEnabled(true);
  }

  posePilote(nom) {
    this.perso.jouer(nom, 0.1);
  }
}

// Véhicules conduisibles : voiture, taxi, minibus 207, bus, camion, moto.
// Physique : contrôleur de véhicule Rapier (suspensions, adhérence, freinage).
// Modèles 3D construits en code (créations originales, aucune marque réelle).
import * as THREE from "three";
import { RAPIER } from "./physique.js";

/** Caractéristiques : dimensions (m), masse (kg), puissance, empattement, voie. */
export const TYPES = {
  voiture: { nom: "Berline", l: 4.5, w: 1.8, h: 1.45, masse: 1250, force: 2600, vmax: 45, empat: 2.7, voie: 1.55, r: 0.33, couleurs: [0xf2f2f2, 0x1b1c1e, 0x8d9196, 0x7a1515, 0x1d3a6b] },
  taxi: { nom: "Taxi jaune", l: 4.3, w: 1.75, h: 1.45, masse: 1150, force: 2400, vmax: 42, empat: 2.6, voie: 1.5, r: 0.32, couleurs: [0xf6c21c] },
  minibus: { nom: "Minibus 207 « Esprit de mort »", l: 5.4, w: 2.0, h: 2.4, masse: 2600, force: 3600, vmax: 33, empat: 3.2, voie: 1.7, r: 0.36, couleurs: [0xf6c21c] },
  bus: { nom: "Bus urbain", l: 11.5, w: 2.5, h: 3.1, masse: 11000, force: 16000, vmax: 25, empat: 6.0, voie: 2.1, r: 0.5, couleurs: [0xeeeeee] },
  camion: { nom: "Camion", l: 8.5, w: 2.45, h: 3.2, masse: 9000, force: 14000, vmax: 24, empat: 4.8, voie: 2.0, r: 0.52, couleurs: [0xc0392b, 0x2c3e50, 0x27ae60] },
  moto: { nom: "Moto (wewa)", l: 2.0, w: 0.7, h: 1.15, masse: 180, force: 900, vmax: 30, empat: 1.35, voie: 0.34, r: 0.3, couleurs: [0x111111, 0xb71c1c, 0x1565c0] },
};

const mats = new Map();
function mat(c, opts = {}) {
  const k = c + JSON.stringify(opts);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.2, ...opts }));
  return mats.get(k);
}
function boite(g, sx, sy, sz, x, y, z, m) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  g.add(b);
  return b;
}

/** Modèle 3D : l'avant du véhicule est vers -Z. */
export function modele(type, couleur) {
  const t = TYPES[type];
  const g = new THREE.Group();
  const carros = mat(couleur, { metalness: 0.45, roughness: 0.35 });
  const vitre = mat(0x1d262e, { metalness: 0.6, roughness: 0.1 });
  const noir = mat(0x151515);
  const L = t.l, W = t.w, H = t.h;
  const phares = [];
  if (type === "moto") {
    boite(g, 0.25, 0.35, 1.5, 0, 0.6, 0, carros);
    boite(g, 0.3, 0.12, 0.7, 0, 0.82, 0.25, noir);   // selle
    boite(g, 0.6, 0.05, 0.05, 0, 1.05, -0.6, noir);  // guidon
    phares.push(boite(g, 0.16, 0.12, 0.05, 0, 0.85, -0.78, mat(0xfff6d5, { emissive: 0xfff2c0, emissiveIntensity: 0 })));
  } else {
    const bas = H * 0.5;
    boite(g, W, bas, L, 0, 0.35 + bas / 2, 0, carros);
    let cabL = L * 0.5, cabZ = 0.15, cabH = H - bas - 0.35;
    if (type === "minibus" || type === "bus") { cabL = L * 0.92; cabZ = 0.1; cabH = H - bas - 0.35; }
    if (type === "camion") { cabL = 2.2; cabZ = -L / 2 + 1.2; }
    boite(g, W * 0.94, cabH, cabL, 0, 0.35 + bas + cabH / 2, cabZ, carros);
    boite(g, W * 0.95, cabH * 0.62, cabL * 0.98, 0, 0.35 + bas + cabH * 0.5, cabZ, vitre);
    boite(g, W * 0.9, cabH * 0.62, 0.06, 0, 0.35 + bas + cabH * 0.5, cabZ - cabL / 2 - 0.01, vitre);
    if (type === "camion") boite(g, W, H * 0.95, L - 2.6, 0, 0.35 + H * 0.5, 1.1, mat(0xd8d4cc));
    if (type === "minibus") {
      boite(g, W + 0.02, 0.3, L + 0.02, 0, 0.55, 0, mat(0x1d4f9e));             // bande bleue
      boite(g, 0.05, cabH + bas * 0.6, 1.0, W / 2 + 0.01, 1.2, -0.3, noir);      // porte coulissante ouverte
    }
    if (type === "taxi") boite(g, W * 0.95, 0.06, cabL * 0.95, 0, 0.35 + H - 0.32, cabZ, mat(0x1d4f9e));
    if (type === "bus") boite(g, W + 0.02, 0.45, L + 0.02, 0, 0.75, 0, mat(0x1565c0));
    for (const s of [-1, 1]) {
      phares.push(boite(g, 0.32, 0.16, 0.05, s * (W / 2 - 0.3), 0.35 + bas * 0.7, -L / 2 - 0.01,
        mat(0xfff6d5, { emissive: 0xfff2c0, emissiveIntensity: 0 })));
      boite(g, 0.3, 0.14, 0.05, s * (W / 2 - 0.3), 0.35 + bas * 0.7, L / 2 + 0.01, mat(0x7a0000, { emissive: 0xff1a1a, emissiveIntensity: 0.3 }));
    }
  }
  // Roues (animées).
  const roues = [];
  const geoRoue = new THREE.CylinderGeometry(t.r, t.r, type === "moto" ? 0.12 : 0.24, 14);
  geoRoue.rotateZ(Math.PI / 2);
  const jante = mat(0x9aa0a6, { metalness: 0.8 });
  for (const p of positionsRoues(type)) {
    const pivot = new THREE.Group();
    pivot.position.set(p.x, t.r, p.z);
    const r = new THREE.Mesh(geoRoue, noir);
    r.castShadow = true;
    const j = new THREE.Mesh(new THREE.CylinderGeometry(t.r * 0.55, t.r * 0.55, 0.26, 8).rotateZ(Math.PI / 2), jante);
    r.add(j);
    pivot.add(r);
    if (type === "moto" && p.x !== 0) pivot.visible = false;
    g.add(pivot);
    roues.push({ pivot, roue: r });
  }
  g.userData = { type, roues, phares };
  return g;
}

/** Positions des roues (repère du véhicule, avant vers -Z). Moto : 4 rayons rapprochés, 2 roues visibles. */
export function positionsRoues(type) {
  const t = TYPES[type];
  const a = -t.empat / 2, b = t.empat / 2;
  if (type === "moto") return [{ x: -t.voie / 2, z: a, av: 1 }, { x: t.voie / 2, z: a, av: 1 }, { x: 0, z: b, av: 0 }, { x: 0.001, z: b, av: 0 }];
  return [{ x: -t.voie / 2, z: a, av: 1 }, { x: t.voie / 2, z: a, av: 1 }, { x: -t.voie / 2, z: b, av: 0 }, { x: t.voie / 2, z: b, av: 0 }];
}

/** Véhicule physique conduisible (ou stationné). */
export class Vehicule {
  constructor(physique, scene, type, x, y, z, angle, couleur) {
    this.type = type;
    this.t = TYPES[type];
    this.couleur = couleur ?? this.t.couleurs[Math.floor(Math.random() * this.t.couleurs.length)];
    this.objet = modele(type, this.couleur);
    scene.add(this.objet);
    this.scene = scene;
    this.physique = physique;
    const W = physique.monde;
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y + 0.6, z)
      .setRotation(quatY(angle)).setLinearDamping(0.05).setAngularDamping(type === "moto" ? 3 : 0.6)
      .setCanSleep(true);
    this.corps = W.createRigidBody(desc);
    if (type === "moto") this.corps.setEnabledRotations(false, true, false, true);   // pas de chute : inclinaison visuelle seulement
    const t = this.t;
    W.createCollider(RAPIER.ColliderDesc.cuboid(t.w / 2, t.h * 0.3, t.l / 2)
      .setTranslation(0, t.r + t.h * 0.3, 0).setMass(t.masse).setFriction(0.4).setRestitution(0.05), this.corps);
    this.ctrl = W.createVehicleController(this.corps);
    // Avant du véhicule = axe Z. (Rapier 0.14 expose « setIndexForwardAxis »
    // comme un accesseur et non comme une fonction : on gère les deux cas.)
    this.ctrl.indexUpAxis = 1;
    if (typeof this.ctrl.setIndexForwardAxis === "function") this.ctrl.setIndexForwardAxis(2);
    else this.ctrl.setIndexForwardAxis = 2;
    for (const p of positionsRoues(type)) {
      this.ctrl.addWheel({ x: p.x, y: t.r + 0.25, z: p.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.3, t.r);
    }
    for (let i = 0; i < 4; i++) {
      this.ctrl.setWheelSuspensionStiffness(i, type === "bus" || type === "camion" ? 40 : 28);
      this.ctrl.setWheelFrictionSlip(i, type === "moto" ? 2.2 : 1.6);
      this.ctrl.setWheelMaxSuspensionForce(i, t.masse * 25);
      this.ctrl.setWheelSuspensionCompression(i, 4.4);
      this.ctrl.setWheelSuspensionRelaxation(i, 2.3);
    }
    this.direction = 0;
    this.carburant = 1.0;          // plein (0..1), simulation de jeu
    this.freinAMain = true;
    this.phares = false;
    this.lumiere = null;
    this.inclinaison = 0;
  }

  /** Commandes : acc (-1..1), dir (-1..1), frein (0..1). */
  commander(acc, dir, frein, dt) {
    const t = this.t;
    const v = this.vitesse();
    const braquageMax = this.type === "bus" || this.type === "camion" ? 0.45 : 0.6;
    this.direction += (dir * braquageMax - this.direction) * Math.min(1, dt * 6);
    const steer = this.direction * (1 - Math.min(0.6, Math.abs(v) / (t.vmax * 1.4)));
    let force = 0;
    if (this.carburant > 0) {
      if (acc > 0 && v < t.vmax) force = -t.force * acc;          // avant = -Z
      if (acc < 0 && v > -8) force = -t.force * acc * 0.6;        // marche arrière
    }
    const roues = positionsRoues(this.type);
    for (let i = 0; i < 4; i++) {
      if (roues[i].av) this.ctrl.setWheelSteering(i, steer);
      this.ctrl.setWheelEngineForce(i, roues[i].av ? 0 : force);
    }
    // Freinage appliqué au châssis : le frein des roues de Rapier 0.14 est sans effet.
    // Décélération max ~7 m/s² (frein de service), frein à main ~4 m/s² + immobilisation.
    const decel = frein * 7 + (this.freinAMain ? 4 : 0) + (acc === 0 ? 0.35 : 0);   // + frottement de roulement
    if (decel > 0) {
      const lv = this.corps.linvel();
      const vh = Math.hypot(lv.x, lv.z);
      if (vh > 1e-3) {
        const dv = Math.min(vh, decel * dt);
        const m = this.corps.mass();
        this.corps.applyImpulse({ x: (-lv.x / vh) * dv * m, y: 0, z: (-lv.z / vh) * dv * m }, true);
      }
    }
    if (acc !== 0) {
      this.freinAMain = false;
      this.corps.wakeUp();
      this.carburant = Math.max(0, this.carburant - Math.abs(acc) * dt * 0.0008);
    }
  }

  mettreAJour(dt) {
    this.ctrl.updateVehicle(dt);
    const p = this.corps.translation();
    const q = this.corps.rotation();
    this.objet.position.set(p.x, p.y, p.z);
    this.objet.quaternion.set(q.x, q.y, q.z, q.w);
    const { roues } = this.objet.userData;
    const pos = positionsRoues(this.type);
    for (let i = 0; i < roues.length; i++) {
      const susp = this.ctrl.wheelSuspensionLength(i) ?? 0.3;
      roues[i].pivot.position.y = this.t.r + 0.25 - susp;
      roues[i].pivot.rotation.y = pos[i].av ? this.direction : 0;
      roues[i].roue.rotation.x = -(this.ctrl.wheelRotation(i) ?? 0);
    }
    if (this.type === "moto") {
      this.inclinaison += (-this.direction * Math.min(1, Math.abs(this.vitesse()) / 12) * 0.5 - this.inclinaison) * Math.min(1, dt * 5);
      this.objet.rotateZ(this.inclinaison);
    }
  }

  /** Vitesse le long de l'axe avant (m/s, positive en marche avant). */
  vitesse() {
    const v = this.corps.linvel();
    const q = this.corps.rotation();
    const avant = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return v.x * avant.x + v.y * avant.y + v.z * avant.z;
  }

  position() { return this.corps.translation(); }

  angle() {
    const q = this.corps.rotation();
    return new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), "YXZ").y;
  }

  allumerPhares(on, scene) {
    this.phares = on;
    for (const p of this.objet.userData.phares) p.material.emissiveIntensity = on ? 2.5 : 0;
    if (on && !this.lumiere) {
      this.lumiere = new THREE.SpotLight(0xfff1cf, 60, 60, 0.5, 0.5, 1.6);
      this.lumiere.position.set(0, 0.9, -this.t.l / 2);
      this.lumiere.target.position.set(0, 0, -this.t.l / 2 - 12);
      this.objet.add(this.lumiere, this.lumiere.target);
    }
    if (this.lumiere) this.lumiere.visible = on;
  }

  supprimer() {
    this.scene.remove(this.objet);
    this.physique.monde.removeVehicleController?.(this.ctrl);
    this.physique.monde.removeRigidBody(this.corps);
  }

  etat() {
    const p = this.position();
    return { type: this.type, couleur: this.couleur, x: p.x, y: p.y, z: p.z, a: this.angle(), c: this.carburant };
  }
}

export function quatY(a) {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}

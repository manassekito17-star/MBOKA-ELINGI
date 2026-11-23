// Véhicules conduisibles : voiture, taxi, minibus 207, bus, camion, moto.
// Physique : contrôleur de véhicule Rapier (suspensions, adhérence, freinage).
// Modèles 3D construits en code (créations originales, aucune marque réelle).
import * as THREE from "three";
import { RAPIER } from "./physique.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Caractéristiques : dimensions (m), masse (kg), puissance, empattement, voie. */
export const TYPES = {
  voiture: { nom: "Berline", l: 4.5, w: 1.8, h: 1.45, masse: 1250, force: 2600, vmax: 45, empat: 2.7, voie: 1.55, r: 0.33, couleurs: [0xf2f2f2, 0x1b1c1e, 0x8d9196, 0x7a1515, 0x1d3a6b] },
  taxi: { nom: "Taxi jaune", l: 4.3, w: 1.75, h: 1.45, masse: 1150, force: 2400, vmax: 42, empat: 2.6, voie: 1.5, r: 0.32, couleurs: [0xf6c21c] },
  minibus: { nom: "Minibus 207 « Esprit de mort »", l: 5.4, w: 2.0, h: 2.4, masse: 2600, force: 3600, vmax: 33, empat: 3.2, voie: 1.7, r: 0.36, couleurs: [0xf6c21c] },
  bus: { nom: "Bus urbain (Transco)", l: 11.5, w: 2.5, h: 3.1, masse: 11000, force: 16000, vmax: 25, empat: 6.0, voie: 2.1, r: 0.5, couleurs: [0xeeeeee] },
  camion: { nom: "Camion", l: 8.5, w: 2.45, h: 3.2, masse: 9000, force: 14000, vmax: 24, empat: 4.8, voie: 2.0, r: 0.52, couleurs: [0xc0392b, 0x2c3e50, 0x27ae60] },
  livraison: { nom: "Camionnette de livraison", l: 5.2, w: 2.0, h: 2.3, masse: 2300, force: 3400, vmax: 32, empat: 3.1, voie: 1.7, r: 0.36, couleurs: [0xf4f4f2, 0xd84315] },
  ambulance: { nom: "Ambulance", l: 5.4, w: 2.0, h: 2.5, masse: 2700, force: 4000, vmax: 38, empat: 3.2, voie: 1.7, r: 0.36, couleurs: [0xf7f7f7] },
  police: { nom: "Police", l: 4.6, w: 1.8, h: 1.5, masse: 1300, force: 2800, vmax: 45, empat: 2.7, voie: 1.55, r: 0.33, couleurs: [0x1a3a7a] },
  moto: { nom: "Moto (wewa)", l: 2.0, w: 0.7, h: 1.15, masse: 180, force: 900, vmax: 30, empat: 1.35, voie: 0.34, r: 0.3, couleurs: [0x111111, 0xb71c1c, 0x1565c0] },
};

/** Places assises (repère du véhicule) : conducteur puis passagers. */
export const PLACES = {
  voiture: [[-0.38, 0.32, 0.15], [0.38, 0.32, 0.15], [-0.38, 0.32, 1.1], [0.38, 0.32, 1.1]],
  taxi: [[-0.38, 0.32, 0.15], [0.38, 0.32, 0.15], [-0.38, 0.32, 1.05], [0.38, 0.32, 1.05]],
  police: [[-0.38, 0.32, 0.15], [0.38, 0.32, 0.15]],
  minibus: [[-0.5, 0.65, -1.5], [0.5, 0.65, -1.5], [-0.5, 0.65, 0.2], [0.5, 0.65, 0.2], [-0.5, 0.65, 1.3], [0.5, 0.65, 1.3]],
  livraison: [[-0.5, 0.65, -1.5], [0.5, 0.65, -1.5]],
  ambulance: [[-0.5, 0.65, -1.6], [0.5, 0.65, -1.6]],
  bus: [[-0.8, 0.8, -4.8], [-0.7, 0.8, -2.5], [0.7, 0.8, -2.5], [-0.7, 0.8, 0], [0.7, 0.8, 0], [-0.7, 0.8, 2.5], [0.7, 0.8, 2.5]],
  camion: [[-0.6, 1.0, -3.3], [0.6, 1.0, -3.3]],
  moto: [[0, 0.28, 0.12], [0, 0.36, 0.62]],
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

/** Plaque d'immatriculation (numéro fictif, format générique). */
let texPlaque = null;
function plaque() {
  if (texPlaque || typeof document === "undefined") return texPlaque;   // (tests Node : pas de canevas)
  const c = document.createElement("canvas");
  c.width = 256; c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#f4f4ef"; x.fillRect(0, 0, 256, 64);
  x.fillStyle = "#1d4fa0"; x.fillRect(0, 0, 34, 64);
  x.fillStyle = "#f7d618"; x.font = "bold 18px sans-serif"; x.fillText("CD", 4, 40);
  x.fillStyle = "#111"; x.font = "bold 40px sans-serif"; x.textBaseline = "middle"; x.fillText("0000 KN", 44, 34);
  texPlaque = new THREE.CanvasTexture(c);
  texPlaque.colorSpace = THREE.SRGBColorSpace;
  return texPlaque;
}

/** Profil latéral (z, y) extrudé sur la largeur, arêtes arrondies (biseau). Avant vers -Z. */
function profil(points, largeur, biseau = 0.07) {
  const sh = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, largeur - 2 * biseau), bevelEnabled: true, bevelThickness: biseau,
    bevelSize: biseau, bevelSegments: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2).translate((largeur - 2 * biseau) / 2, 0, 0);
  return g;
}

/** Silhouettes (côté) par famille de véhicule : [bas de caisse], [vitrage], hauteur du toit. */
function silhouettes(type, L, H) {
  const a = -L / 2, b = L / 2;
  if (["voiture", "taxi", "police"].includes(type)) {
    const ceinture = 0.95, toit = H;
    return {
      caisse: [[a, 0.32], [a, 0.62], [a + 0.12, 0.78], [a + 1.0, 0.86], [a + 1.35, ceinture], [b - 0.95, ceinture], [b - 0.2, 0.9], [b, 0.78], [b, 0.36], [b - 0.25, 0.3], [a + 0.25, 0.3]],
      vitre: [[a + 1.35, ceinture - 0.02], [a + 2.05, toit - 0.04], [b - 1.45, toit - 0.04], [b - 0.95, ceinture - 0.02]],
      toit: [a + 2.0, b - 1.45, toit],
      montants: [a + 1.7, b - 1.2, (a + 2.05 + b - 1.45) / 2],
    };
  }
  if (["minibus", "livraison", "ambulance"].includes(type)) {
    const ceinture = 1.25;
    return {
      caisse: [[a, 0.32], [a, 0.75], [a + 0.3, 1.05], [a + 0.75, ceinture], [b, ceinture], [b, 0.36], [b - 0.25, 0.3], [a + 0.25, 0.3]],
      vitre: [[a + 0.75, ceinture - 0.02], [a + 1.25, H - 0.08], [b - 0.05, H - 0.08], [b - 0.05, ceinture - 0.02]],
      toit: [a + 1.2, b, H],
      montants: [a + 1.45, a + 2.6, b - 1.2],
    };
  }
  if (type === "bus") {
    return {
      caisse: [[a, 0.35], [a, 1.25], [b, 1.25], [b, 0.35], [b - 0.3, 0.3], [a + 0.3, 0.3]],
      vitre: [[a + 0.05, 1.23], [a + 0.12, H - 0.25], [b - 0.05, H - 0.25], [b - 0.05, 1.23]],
      toit: [a + 0.05, b - 0.02, H],
      montants: Array.from({ length: 8 }, (_, i) => a + 1.2 + i * (L - 2) / 8),
    };
  }
  // Camion : cabine avant (la caisse arrière est ajoutée à part).
  return {
    caisse: [[a, 0.4], [a, 1.35], [a + 2.2, 1.35], [a + 2.2, 0.4]],
    vitre: [[a + 0.05, 1.33], [a + 0.25, H - 0.4], [a + 2.15, H - 0.4], [a + 2.15, 1.33]],
    toit: [a + 0.2, a + 2.2, H - 0.25],
    montants: [a + 1.4],
  };
}

/** Modèle 3D détaillé : l'avant du véhicule est vers -Z. Créations originales (aucune marque). */
export function modele(type, couleur) {
  const t = TYPES[type];
  const g = new THREE.Group();
  const carros = mat(couleur, { metalness: 0.55, roughness: 0.28, envMapIntensity: 1.2 });
  const vitre = mat(0x101820, { metalness: 0.9, roughness: 0.05, envMapIntensity: 1.5 });
  const noir = mat(0x141414, { roughness: 0.7, metalness: 0.1 });
  const chrome = mat(0xc9ccd0, { metalness: 0.95, roughness: 0.18 });
  const L = t.l, W = t.w, H = t.h;
  const phares = [], arriere = [], gyro = [];
  const matPhare = () => new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff2c0, emissiveIntensity: 0, metalness: 0.3, roughness: 0.1 });
  const matStop = () => new THREE.MeshStandardMaterial({ color: 0x7a0000, emissive: 0xff1a1a, emissiveIntensity: 0.3, roughness: 0.2 });
  const piece = (geo, m, x = 0, y = 0, z = 0, ombre = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z); o.castShadow = ombre; o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const box = (sx, sy, sz, x, y, z, m, ombre = true) => piece(new THREE.BoxGeometry(sx, sy, sz), m, x, y, z, ombre);
  if (type === "moto") {
    // Moto : cadre, réservoir galbé, selle, fourche, guidon, phare rond, pot d'échappement.
    piece(new THREE.CapsuleGeometry(0.16, 0.35, 4, 10).rotateX(Math.PI / 2).scale(1, 0.85, 1), carros, 0, 0.92, -0.15);
    piece(new THREE.CapsuleGeometry(0.13, 0.5, 4, 8).rotateX(Math.PI / 2).scale(1.1, 0.5, 1), noir, 0, 0.95, 0.35);
    box(0.06, 0.06, 1.1, 0, 0.62, 0.05, noir);
    for (const s of [-1, 1]) piece(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6).rotateX(-0.35), chrome, s * 0.08, 0.68, -0.6);
    piece(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6).rotateZ(Math.PI / 2), chrome, 0, 1.08, -0.62);
    piece(new THREE.CylinderGeometry(0.045, 0.06, 0.6, 8).rotateX(Math.PI / 2), chrome, 0.16, 0.42, 0.45);
    box(0.32, 0.22, 0.5, 0, 0.45, 0.0, mat(0x2b2b2b, { metalness: 0.6, roughness: 0.4 }));   // moteur
    phares.push(piece(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14).rotateX(Math.PI / 2), matPhare(), 0, 0.95, -0.82));
    arriere.push(box(0.14, 0.07, 0.04, 0, 0.92, 0.72, matStop()));
    box(0.18, 0.1, 0.01, 0, 0.78, 0.78, new THREE.MeshStandardMaterial({ map: plaque(), roughness: 0.5 }), false);
  } else {
    const S = silhouettes(type, type === "camion" ? L : L, H);
    piece(profil(S.caisse, W, 0.08), carros);
    piece(profil(S.vitre, W - 0.06, 0.04), vitre);
    // Toit (au-dessus du vitrage) et montants de caisse.
    const [t0, t1, ty] = S.toit;
    piece(new THREE.BoxGeometry(W - 0.08, 0.07, t1 - t0).translate(0, 0, 0), carros, 0, ty - 0.04, (t0 + t1) / 2);
    for (const z of S.montants) for (const s of [-1, 1]) box(0.03, ty - 1.0, 0.09, s * (W / 2 - 0.02), (ty + 1.0) / 2 - 0.05, z, type === "bus" ? carros : noir, false);
    // Pare-chocs, calandre, bas de caisse, passages de roue.
    for (const z of [-L / 2 - 0.02, L / 2 + 0.02]) box(W * 0.98, 0.18, 0.12, 0, 0.42, z, type === "taxi" || type === "voiture" || type === "police" ? noir : mat(0x2a2a2a), false);
    box(W * 0.45, 0.16, 0.04, 0, 0.62, -L / 2 - 0.035, noir, false);
    for (const s of [-1, 1]) box(0.03, 0.08, L * 0.7, s * (W / 2 + 0.005), 0.4, 0, noir, false);
    // Rétroviseurs.
    const zr = S.vitre[0][0] + 0.15;
    for (const s of [-1, 1]) {
      box(0.04, 0.04, 0.16, s * (W / 2 + 0.06), S.vitre[0][1] + 0.02, zr, noir, false);
      box(0.06, 0.13, 0.18, s * (W / 2 + 0.14), S.vitre[0][1] + 0.08, zr, carros, false);
    }
    // Poignées et lignes de portes.
    if (type !== "bus") for (const s of [-1, 1]) for (const z of S.montants.slice(0, 2).map((m) => m + 0.1)) {   // (camion : un seul montant)
      box(0.01, 0.55, 0.012, s * (W / 2 + 0.002), 0.68, z - 0.05, noir, false);
      box(0.025, 0.03, 0.12, s * (W / 2 + 0.01), 0.86, z + 0.25, chrome, false);
    }
    // Phares, feux arrière, clignotants, plaques.
    for (const s of [-1, 1]) {
      phares.push(box(0.36, 0.13, 0.05, s * (W / 2 - 0.3), type === "bus" ? 0.75 : 0.7, -L / 2 - 0.035, matPhare(), false));
      arriere.push(box(0.28, 0.16, 0.05, s * (W / 2 - 0.25), type === "bus" ? 0.95 : 0.82, L / 2 + 0.035, matStop(), false));
      box(0.1, 0.06, 0.05, s * (W / 2 - 0.08), 0.58, -L / 2 - 0.035, mat(0xffa000, { emissive: 0x552200 }), false);
    }
    const mPlaque = new THREE.MeshStandardMaterial({ map: plaque(), roughness: 0.45 });
    for (const z of [-L / 2 - 0.09, L / 2 + 0.09]) {
      const p = piece(new THREE.PlaneGeometry(0.52, 0.12), mPlaque, 0, 0.5, z, false);
      if (z < 0) p.rotation.y = Math.PI;
    }
    // Spécificités kinoises et de service.
    if (type === "camion") {
      box(W, H * 0.92, L - 2.6, 0, 0.45 + H * 0.46, 1.1, mat(0xd8d4cc, { roughness: 0.6 }));
      box(W * 0.9, 0.25, L - 2.4, 0, 0.55, 1.0, noir, false);
    }
    if (type === "minibus") {
      box(W + 0.02, 0.22, L * 0.98, 0, 0.62, 0, mat(0x1d4f9e), false);                    // bande bleue
      box(0.05, 1.5, 0.95, W / 2 + 0.03, 1.15, -0.35, noir, false);                       // porte coulissante ouverte
      box(W * 0.8, 0.12, 1.4, 0, H + 0.08, 0.8, noir, false);                             // galerie de toit
    }
    if (type === "taxi") {
      box(W + 0.01, 0.1, L * 0.96, 0, 0.75, 0, mat(0x1d4f9e), false);
      const enseigne = new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: 0x332200, roughness: 0.4 });
      box(0.55, 0.14, 0.22, 0, H + 0.06, (t0 + t1) / 2, enseigne, false);
    }
    if (type === "bus") {
      box(W + 0.02, 0.4, L * 0.98, 0, 0.85, 0, mat(0x1565c0), false);
      box(W * 0.85, 0.25, 0.04, 0, H - 0.4, -L / 2 - 0.02, mat(0x111111, { emissive: 0xff8800, emissiveIntensity: 0.4 }), false);  // girouette
    }
    if (type === "ambulance") {
      box(W + 0.02, 0.25, L * 0.98, 0, 1.0, 0, mat(0xd32f2f), false);
      for (const s of [-1, 1]) { box(0.02, 0.5, 0.15, s * (W / 2 + 0.02), 1.65, 0.6, mat(0xd32f2f), false); box(0.02, 0.15, 0.5, s * (W / 2 + 0.02), 1.65, 0.6, mat(0xd32f2f), false); }
    }
    if (type === "police") for (const s of [-1, 1]) box(0.015, 0.18, L * 0.55, s * (W / 2 + 0.005), 0.8, 0.1, mat(0xf2f2f2), false);
    if (type === "livraison") for (const s of [-1, 1]) box(0.02, 0.8, 2.2, s * (W / 2 + 0.01), 1.5, 0.9, mat(0xd84315), false);
    if (type === "ambulance" || type === "police") {
      for (const [sx, c] of [[-0.3, 0x1e5bff], [0.3, 0xff2a2a]]) {
        const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, roughness: 0.2 });
        gyro.push(m);
        box(0.45, 0.13, 0.25, sx, ty + 0.06, (t0 + t1) / 2 - 0.3, m, false);
      }
    }
  }
  // Roues : pneu arrondi (tore + bande de roulement), jante à 5 rayons, enjoliveur.
  const roues = [];
  const R = t.r, lgP = type === "moto" ? 0.11 : 0.22;
  const { pneu, jante: geoJante } = geometriesRoue(R, lgP);
  const jante = mat(0xa7acb2, { metalness: 0.85, roughness: 0.25 });
  for (const p of positionsRoues(type)) {
    const pivot = new THREE.Group();
    pivot.position.set(p.x, R, p.z);
    const r = new THREE.Mesh(pneu, noir);
    r.castShadow = true;
    r.add(new THREE.Mesh(geoJante, jante));
    pivot.add(r);
    // Moto : 4 points d'appui physiques, mais 2 roues affichées (avant et arrière, dans l'axe).
    if (type === "moto") {
      if (p.av && p.x < 0) pivot.position.x = 0;
      else if (p.x !== 0) pivot.visible = false;
    }
    g.add(pivot);
    roues.push({ pivot, roue: r });
  }
  fusionnerParMateriau(g, new Set([...phares, ...arriere]), gyro);
  g.userData = { type, roues, phares, arriere, gyro, carros };
  return g;
}

const ROUES = new Map();
/** Roue (géométries partagées) : pneu avec flancs arrondis ; jante à 5 rayons. */
function geometriesRoue(R, lgP) {
  const k = R + "_" + lgP;
  if (ROUES.has(k)) return ROUES.get(k);
  const ni = (g) => (g.index ? g.toNonIndexed() : g);
  const pneu = mergeGeometries([ni(new THREE.CylinderGeometry(R, R, lgP, 20).rotateZ(Math.PI / 2)),
    ...[-1, 1].map((s) => ni(new THREE.TorusGeometry(R - 0.05, 0.05, 6, 20).rotateY(Math.PI / 2).translate((s * lgP) / 2, 0, 0)))], false);
  const jante = mergeGeometries([ni(new THREE.CylinderGeometry(R * 0.6, R * 0.6, lgP + 0.02, 14).rotateZ(Math.PI / 2)),
    ...[0, 1, 2, 3, 4].map((i) => ni(new THREE.BoxGeometry(lgP + 0.04, R * 0.08, R * 1.05).rotateX((i / 5) * Math.PI)))], false);
  const r = { pneu, jante };
  ROUES.set(k, r);
  return r;
}

/** Regroupe les pièces fixes de même matériau en un seul maillage (beaucoup moins d'appels de dessin). */
function fusionnerParMateriau(g, garder, gyro) {
  const groupes = new Map();
  for (const o of [...g.children]) {
    if (!o.isMesh || garder.has(o) || gyro.includes(o.material)) continue;
    o.updateMatrix();
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrix);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!groupes.has(o.material)) groupes.set(o.material, { geos: [], ombre: false });
    const e = groupes.get(o.material);
    e.geos.push(geo); e.ombre ||= o.castShadow;
    g.remove(o);
  }
  for (const [m, e] of groupes) {
    const fus = mergeGeometries(e.geos, false);
    if (!fus) continue;
    const mesh = new THREE.Mesh(fus, m);
    mesh.castShadow = e.ombre; mesh.receiveShadow = true;
    g.add(mesh);
  }
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
    // Systèmes réels du véhicule (affichés par l'interface) :
    this.odometre = 0;             // distance parcourue (m), sauvegardée
    this.sante = 100;              // état mécanique (chocs) : < 30 moteur affaibli, 0 en panne
    this.sirene = false;           // police, ambulance : sirène et gyrophares
    this.vPrec = 0;
    this.chocs = [];               // chocs récents { dv } (lus par le jeu pour blesser le conducteur)
    this.tGyro = 0;
  }

  /** Rapport affiché (boîte automatique) : P (frein à main), R, N, D — d'après le mouvement réel. */
  rapport(acc = 0) {
    const v = this.vitesse();
    if (this.freinAMain && Math.abs(v) < 0.5) return "P";
    if (v < -0.3 || (acc < 0 && Math.abs(v) < 0.5)) return "R";
    if (Math.abs(v) < 0.3 && acc === 0) return "N";
    return "D";
  }

  /** Répare (garage, station) : état mécanique à 100 %. */
  reparer() { this.sante = 100; }

  /** Repeint la carrosserie (nouveau matériau, les autres véhicules gardent le leur). */
  repeindre(couleur) {
    const ancien = this.objet.userData.carros;
    if (!ancien) return;
    const neuf = ancien.clone();
    neuf.color.setHex(couleur);
    this.objet.traverse((o) => { if (o.isMesh && o.material === ancien) o.material = neuf; });
    this.objet.userData.carros = neuf;
    this.couleur = couleur;
  }

  /** Sirène et gyrophares (police, ambulance uniquement). */
  basculerSirene() {
    if (!this.objet.userData.gyro.length) return false;
    this.sirene = !this.sirene;
    if (!this.sirene) for (const m of this.objet.userData.gyro) m.emissiveIntensity = 0;
    return true;
  }

  /** Commandes : acc (-1..1), dir (-1..1), frein (0..1). */
  commander(acc, dir, frein, dt) {
    const t = this.t;
    const v = this.vitesse();
    const braquageMax = this.type === "bus" || this.type === "camion" ? 0.45 : 0.6;
    this.direction += (dir * braquageMax - this.direction) * Math.min(1, dt * 6);
    const steer = this.direction * (1 - Math.min(0.6, Math.abs(v) / (t.vmax * 1.4)));
    let force = 0;
    // Moteur endommagé : puissance réduite (< 30 %), panne à 0 %.
    const puissance = this.sante <= 0 ? 0 : this.sante < 30 ? 0.55 : 1;
    if (this.carburant > 0 && puissance > 0) {
      if (acc > 0 && v < t.vmax * (puissance < 1 ? 0.7 : 1)) force = -t.force * acc * puissance;   // avant = -Z
      if (acc < 0 && v > -8) force = -t.force * acc * 0.6 * puissance;                        // marche arrière
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
    // Compteur kilométrique et détection des chocs (variation brutale de vitesse).
    const lv = this.corps.linvel();
    const vh = Math.hypot(lv.x, lv.z);
    this.odometre += vh * dt;
    const dv = Math.abs(vh - this.vPrec);
    if (dt > 0 && dv / dt > 30 && dv > 2.5) {       // > 3 g : au-delà de tout freinage possible
      this.sante = Math.max(0, this.sante - (dv - 2) * 7);
      this.chocs.push({ dv });
    }
    this.vPrec = vh;
    if (this.sirene) {
      this.tGyro += dt;
      const f = Math.floor(this.tGyro * 4) % 2;
      this.objet.userData.gyro.forEach((m, i) => { m.emissiveIntensity = i === f ? 3 : 0.2; });
    }
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
    return { type: this.type, couleur: this.couleur, x: p.x, y: p.y, z: p.z, a: this.angle(), c: this.carburant,
      odo: Math.round(this.odometre), s: Math.round(this.sante) };
  }
}

export function quatY(a) {
  return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) };
}

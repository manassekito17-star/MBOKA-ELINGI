// Bâtiments remarquables : modèles individuels (GLB, 3 niveaux de détail), posés à leur vraie position GPS,
// et reconnaissance en jeu (nom affiché à l'approche, fiche, destination GPS, vue du bâtiment).
// Registre : donnees/batiments.json (sources, références photo, niveau de fidélité de chaque élément).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Projection } from "./geo.js";

export async function chargerRegistre() {
  try { return await (await fetch("donnees/batiments.json")).json(); } catch { return { batiments: [], photos: [] }; }
}

function dansPoly(x, z, p) {
  let c = false;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function distPoly(x, z, p) {
  if (dansPoly(x, z, p)) return 0;
  let d = Infinity;
  for (let i = 0, j = p.length / 2 - 1; i < p.length / 2; j = i++) {
    const ax = p[2 * j], az = p[2 * j + 1], bx = p[2 * i], bz = p[2 * i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return d;
}

/**
 * Terrassement : le relief est mis à niveau sous chaque site modélisé (moyenne des hauteurs du site),
 * avec un raccord progressif sur `marge` mètres — comme une vraie plateforme de chantier.
 * Doit être appelé AVANT la construction du sol et de la physique (Monde.charger).
 */
export function aplanirRelief(relief, emprises, marge = 40) {
  const { n, nz, pas, demi, demiZ, d } = relief;
  for (const e of emprises) {
    let somme = 0, nb = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < n; i++) {
      if (dansPoly(i * pas - demi, j * pas - demiZ, e)) { somme += d[j * n + i]; nb++; }
    }
    if (!nb) { for (let k = 0; k < e.length; k += 2) { somme += relief.hauteur(e[k], e[k + 1]); nb++; } }
    const cible = somme / nb;
    for (let j = 0; j < nz; j++) for (let i = 0; i < n; i++) {
      const x = i * pas - demi, z = j * pas - demiZ;
      const dd = distPoly(x, z, e);
      if (dd >= marge) continue;
      const t = dd / marge, s = t * t * (3 - 2 * t);
      d[j * n + i] = cible * (1 - s) + d[j * n + i] * s;
    }
  }
}

export class BatimentsRemarquables {
  /** registre : donnees/batiments.json ; zone : identifiant ; manifest : manifeste de la zone. */
  constructor(registre, zone, manifest) {
    this.registre = registre;
    this.proj = new Projection(manifest.origine[0], manifest.origine[1]);
    this.tous = registre.batiments;
    this.photos = new Map((registre.photos || []).map((p) => [p.id, p]));
    this.liste = registre.batiments.filter((b) => b.zone === manifest.id || b.zone === zone).map((b) => {
      const a = this.proj.versLocal(b.gps.lon, b.gps.lat);
      const emprises = (b.emprise || []).map((poly) => poly.flatMap(([x, z]) => [x + a.x, z + a.z]));
      const entree = b.entree ? { x: b.entree[0] + a.x, z: b.entree[1] + a.z } : { x: a.x, z: a.z };
      return { ...b, x: a.x, z: a.z, emprises, entreeZone: entree, objet: null };
    });
    this.annonce = new Map();      // id -> déjà annoncé (réinitialisé quand on s'éloigne)
  }

  /** Emprises des sites modélisés, pour le terrassement du relief. */
  aplanissements() { return this.liste.filter((b) => b.modele && b.aplanir !== false).flatMap((b) => b.emprises); }

  /** Emprises (repère de la zone) où les bâtiments génériques des tuiles sont retirés. */
  exclusions() { return this.liste.filter((b) => b.modele).flatMap((b) => b.emprises); }

  /** Charge les modèles GLB et les pose sur le relief ; ajoute leurs volumes de collision. */
  async construire(scene, physique, monde, qualite) {
    const chargeur = new GLTFLoader();
    await Promise.all(this.liste.filter((b) => b.modele).map(async (b) => {
      try {
        const g = await chargeur.loadAsync(`${b.modele}?v=${b.version || 1}`);
        const y = monde.hauteur(b.x, b.z);
        const lod = new THREE.LOD();
        lod.name = "batiment_" + b.id;
        lod.position.set(b.x, y, b.z);
        const [d1, d2] = b.lod || [170, 520];
        const niveaux = qualite === "basse" ? [["LOD1", 0], ["LOD2", d2 * 0.7]] : [["LOD0", 0], ["LOD1", d1], ["LOD2", d2]];
        for (const [nom, dist] of niveaux) {
          const o = g.scene.getObjectByName(nom);
          if (!o) continue;
          o.traverse((m) => {
            if (!m.isMesh) return;
            m.castShadow = nom !== "LOD2";
            m.receiveShadow = true;
            const mt = m.material;
            if (mt?.map) { mt.map.anisotropy = 4; mt.map.colorSpace = THREE.SRGBColorSpace; }
          });
          lod.addLevel(o, dist);
        }
        scene.add(lod);
        b.objet = lod;
        // Collisions : volumes simples du nœud COLLISION, en coordonnées du monde.
        const col = g.scene.getObjectByName("COLLISION");
        if (col) {
          g.scene.position.set(b.x, y, b.z);
          g.scene.updateMatrixWorld(true);
          const tri = [];
          const v = new THREE.Vector3();
          col.traverse((m) => {
            if (!m.isMesh) return;
            const geo = m.geometry, pos = geo.attributes.position, idx = geo.index;
            const n = idx ? idx.count : pos.count;
            for (let i = 0; i < n; i++) {
              v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
              tri.push(v.x, v.y, v.z);
            }
          });
          if (tri.length) physique.ajouterMaillageFixe(new Float32Array(tri));
        }
      } catch (e) {
        console.warn("Modèle introuvable", b.id, e);
      }
    }));
  }

  /** Bâtiment le plus proche du joueur (distance à l'emprise, 0 à l'intérieur). */
  plusProche(x, z, max = 60) {
    let meilleur = null, dm = max;
    for (const b of this.liste) {
      const d = b.emprises.length ? Math.min(...b.emprises.map((e) => distPoly(x, z, e))) : Math.hypot(b.x - x, b.z - z) - 40;
      if (d <= dm) { dm = d; meilleur = b; }
    }
    return meilleur ? { b: meilleur, d: dm } : null;
  }

  /** À appeler régulièrement : renvoie le bâtiment à annoncer (une fois par approche). */
  approche(x, z) {
    const r = this.plusProche(x, z, 45);
    for (const b of this.liste) {
      const loin = !r || r.b !== b;
      if (loin && this.annonce.get(b.id) && this.plusProche(x, z, 160)?.b !== b) this.annonce.delete(b.id);
    }
    if (r && !this.annonce.get(r.b.id)) { this.annonce.set(r.b.id, true); return r.b; }
    return null;
  }

  /** Centre et rayon approximatifs (vue cinématique, carte). */
  boite(b) {
    const pts = b.emprises.flat();
    if (!pts.length) return { x: b.x, z: b.z, r: 60 };
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]); }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(x1 - x0, z1 - z0) / 2 };
  }
}

export { dansPoly };

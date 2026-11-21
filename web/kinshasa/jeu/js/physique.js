// Moteur physique : Rapier (WebAssembly, fonctionne sur ordinateur et téléphone).
// Sol (relief réel), bâtiments (maillages fixes), personnage (contrôleur
// cinématique) et véhicules (contrôleur à rayons « raycast vehicle »).
import RAPIER from "@dimforge/rapier3d-compat";

export const GROUPE = { DECOR: 0x0001, JOUEUR: 0x0002, VEHICULE: 0x0004, IA: 0x0008 };

export class Physique {
  static async creer() {
    await RAPIER.init();
    return new Physique();
  }

  constructor() {
    this.R = RAPIER;
    this.monde = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.monde.timestep = 1 / 60;
  }

  /** Terrain : grille de hauteurs n×n (Float32), côté `taille` m, centrée sur l'origine. */
  /** Sol en maillage : grille n (est-ouest) × nz (nord-sud), largeur `taille` en x. */
  ajouterRelief(h, n, taille, nz = n) {
    const pas = taille / (n - 1);
    const demi = taille / 2, demiZ = ((nz - 1) * pas) / 2;
    const v = new Float32Array(n * nz * 3);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        v[k] = -demi + i * pas; v[k + 1] = h[j * n + i] - 0.05; v[k + 2] = -demiZ + j * pas;
      }
    }
    const idx = new Uint32Array((n - 1) * (nz - 1) * 6);
    let k = 0;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.set([a, c, b, b, c, d], k);
        k += 6;
      }
    }
    const corps = this.monde.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.monde.createCollider(RAPIER.ColliderDesc.trimesh(v, idx).setFriction(0.9), corps);
    return corps;
  }

  /** Bâtiments d'une tuile : triangles (x,y,z…) non indexés. */
  ajouterMaillageFixe(tri) {
    const idx = new Uint32Array(tri.length / 3);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    const corps = this.monde.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.monde.createCollider(RAPIER.ColliderDesc.trimesh(tri, idx).setFriction(0.6), corps);
    return corps;
  }

  retirer(corps) {
    if (corps && this.monde.getRigidBody(corps.handle)) this.monde.removeRigidBody(corps);
  }

  pas(dt) {
    this.monde.timestep = Math.min(dt, 1 / 30);
    this.monde.step();
  }

  /** Lancer de rayon vers le bas (hauteur du sol ou d'un toit). */
  solSous(x, y, z, exclure) {
    const ray = new RAPIER.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
    const hit = this.monde.castRay(ray, 200, true, undefined, undefined, exclure);
    return hit ? y - hit.timeOfImpact : null;
  }
}

export { RAPIER };

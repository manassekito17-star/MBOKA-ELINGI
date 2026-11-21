// Monuments modélisés à la main (positions réelles, formes d'après photos).
// Tour de l'Échangeur de Limete : ~210 m, 4 colonnes de béton, nacelles dorées
// empilées sur chaque face, mât en treillis et flèche jaune, esplanade en étoile.
// Les proportions sont estimées à partir de photos et vidéos (à affiner).
import * as THREE from "three";
import { RAPIER } from "./physique.js";

export function tourEchangeur(scene, physique, y0 = 0) {
  const g = new THREE.Group();
  g.position.y = y0;
  const beton = new THREE.MeshStandardMaterial({ color: 0xa39d92, roughness: 0.9 });
  const or = new THREE.MeshStandardMaterial({ color: 0xdba33d, roughness: 0.35, metalness: 0.6 });
  const verre = new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.1, metalness: 0.4 });
  const acier = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.5, metalness: 0.7 });
  const jaune = new THREE.MeshStandardMaterial({ color: 0xeebd33, roughness: 0.4 });
  const pave = new THREE.MeshStandardMaterial({ color: 0x5a5a5c, roughness: 0.95 });
  const clair = new THREE.MeshStandardMaterial({ color: 0xc9c5bd, roughness: 0.9 });
  const ajout = (geo, m, x, y, z, ombre = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = ombre;
    o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const H = 158, O = 6.8, R = 3.1;
  ajout(new THREE.CylinderGeometry(36, 36, 0.3, 48), pave, 0, 0.15, 0, false);
  ajout(new THREE.CylinderGeometry(14, 14, 0.5, 32), clair, 0, 0.25, 0, false);
  for (let i = 0; i < 4; i++) {
    const b = ajout(new THREE.BoxGeometry(4, 0.32, 34), clair, 0, 0.18, 0, false);
    b.rotation.y = Math.PI / 4 + (i * Math.PI) / 2;
    b.position.set(Math.sin(b.rotation.y) * -17, 0.18, Math.cos(b.rotation.y) * -17);
  }
  for (const [x, z] of [[-O, -O], [O, -O], [O, O], [-O, O]]) ajout(new THREE.CylinderGeometry(R * 0.92, R, H, 20), beton, x, H / 2, z);
  ajout(new THREE.BoxGeometry(6, H - 4, 6), beton, 0, (H - 4) / 2, 0);
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    const cx = Math.sin(a) * (O + 3.2), cz = Math.cos(a) * (O + 3.2);
    for (let t = 0; t < 4; t++) {
      const top = 154 - t * 7.2;
      ajout(new THREE.CylinderGeometry(5.6 - t * 0.25, 4.4 - t * 0.25, 4.2, 24), or, cx, top - 2.1, cz);
      ajout(new THREE.CylinderGeometry(4.3 - t * 0.25, 4.3 - t * 0.25, 2.6, 24), verre, cx, top - 5.5, cz);
    }
  }
  ajout(new THREE.BoxGeometry(2 * (O + R), 1.2, 2 * (O + R)), beton, 0, H - 1, 0);
  for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [2.4, 2.4], [-2.4, 2.4]]) ajout(new THREE.CylinderGeometry(0.18, 0.22, 26, 6), acier, x, H + 13, z);
  for (let y = H + 1.5; y < H + 26; y += 2.2) {
    for (let i = 0; i < 4; i++) {
      const b = ajout(new THREE.BoxGeometry(4.8, 0.15, 0.15), acier, 0, y, 0, false);
      b.rotation.y = (i * Math.PI) / 2;
      b.position.x = Math.sin(b.rotation.y) * 2.4; b.position.z = Math.cos(b.rotation.y) * 2.4;
    }
  }
  ajout(new THREE.CylinderGeometry(0.35, 1.3, 210 - H - 26, 10), jaune, 0, H + 26 + (210 - H - 26) / 2, 0);
  const balise = ajout(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 3 }), 0, 210.4, 0, false);
  scene.add(g);
  // Collisions : socle et colonnes.
  const corps = physique.monde.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, y0, 0));
  for (const [x, z] of [[-O, -O], [O, -O], [O, O], [-O, O]]) {
    physique.monde.createCollider(RAPIER.ColliderDesc.cylinder(H / 2, R).setTranslation(x, H / 2, z), corps);
  }
  physique.monde.createCollider(RAPIER.ColliderDesc.cuboid(3, (H - 4) / 2, 3).setTranslation(0, (H - 4) / 2, 0), corps);
  return { groupe: g, balise };
}

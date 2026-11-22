// Végétation de Kinshasa en vrais modèles 3D (instanciés) : manguiers (houppier
// dense et sombre), palmiers (stipe élancé, palmes), acacias / flamboyants
// (houppier en parasol). Les POSITIONS viennent des données (arbres OSM, ou zones
// arborées satellite : positions estimées) ; l'ESPÈCE est choisie par le jeu
// (aucune donnée d'espèce disponible) selon un tirage déterministe.
import * as THREE from "three";
import { aleatoire } from "./geo.js";

let MODELES = null;

/** Houppier irrégulier : plusieurs sphères déformées par un bruit, fusionnées, couleurs variées. */
function houppier(graine, blobs, rayon, aplati) {
  const rnd = aleatoire(graine);
  const pos = [], col = [];
  for (let b = 0; b < blobs; b++) {
    const g = new THREE.IcosahedronGeometry(rayon * (0.55 + rnd() * 0.35), 2).toNonIndexed();
    const a = (b / blobs) * Math.PI * 2 + rnd(), d = b === 0 ? 0 : rayon * (0.45 + rnd() * 0.25);
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = (rnd() - 0.3) * rayon * 0.5;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 3.1 + b) * Math.sin(y * 2.7) * Math.sin(z * 3.3 + b * 2);
      x *= n; y *= n * aplati; z *= n;
      pos.push(x + cx, y + cy, z + cz);
      const v = 0.75 + 0.25 * ((y + rayon) / (2 * rayon)) + (rnd() - 0.5) * 0.08;   // dessous plus sombre
      col.push(0.09 * v, 0.2 * v, 0.06 * v);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  // Normales « sphériques » : éclairage doux du feuillage (pas de facettes).
  const n = geo.attributes.normal, P = geo.attributes.position;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(P.getX(i), P.getY(i) * 1.4, P.getZ(i)).normalize();
    n.setXYZ(i, n.getX(i) * 0.4 + v.x * 0.6, n.getY(i) * 0.4 + v.y * 0.6, n.getZ(i) * 0.4 + v.z * 0.6);
  }
  return geo;
}

/** Texture d'une palme : nervure centrale et folioles (transparence). */
function texturePalme() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const x = c.getContext("2d");
  x.strokeStyle = "#3b5d1f"; x.lineWidth = 3;
  x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 256); x.stroke();
  for (let y = 6; y < 250; y += 5) {
    const l = 30 * Math.sin((y / 256) * Math.PI) + 4;
    x.strokeStyle = `rgb(${50 + (y % 3) * 8}, ${95 + (y % 7) * 4}, 35)`;
    x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(32, y); x.lineTo(32 - l, y + 9); x.stroke();
    x.beginPath(); x.moveTo(32, y); x.lineTo(32 + l, y + 9); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function modeles(M) {
  if (MODELES) return MODELES;
  const ecorce = new THREE.MeshStandardMaterial({ color: 0x5e4a3a, roughness: 0.95 });
  const feuillage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.4 });
  // Manguier : tronc court et épais, houppier dense et arrondi (~9 m).
  const troncM = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 8).translate(0, 1.6, 0);
  const houM = houppier(11, 7, 2.9, 0.75).translate(0, 5.2, 0);
  // Acacia / flamboyant : tronc plus haut, houppier large et plat (parasol).
  const troncA = new THREE.CylinderGeometry(0.16, 0.28, 4.2, 7).translate(0, 2.1, 0);
  const houA = houppier(23, 6, 2.6, 0.38).scale(1.45, 1, 1.45).translate(0, 5.4, 0);
  // Palmier : stipe élancé légèrement courbé (texture d'écorce réelle), 10 palmes.
  const stipe = new THREE.CylinderGeometry(0.16, 0.24, 9, 8, 12).translate(0, 4.5, 0);
  const sp = stipe.attributes.position, suv = stipe.attributes.uv;
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i);
    sp.setX(i, sp.getX(i) + 0.012 * y * y);
    suv.setY(i, y / 1.3);
  }
  stipe.computeVertexNormals();
  const palmes = [];
  for (let k = 0; k < 10; k++) {
    const g = new THREE.PlaneGeometry(1.1, 3.6, 1, 6).translate(0, 1.8, 0).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = -p.getZ(i) / 3.6;                    // 0 au cœur, 1 au bout
      p.setY(i, 0.9 * t - 1.6 * t * t * (0.8 + (k % 3) * 0.15));
    }
    g.rotateY((k / 10) * Math.PI * 2 + (k % 2) * 0.2).translate(0.97, 9, 0);
    palmes.push(g.toNonIndexed());
  }
  const n = palmes.reduce((s, g) => s + g.attributes.position.count, 0);
  const pp = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of palmes) { pp.set(g.attributes.position.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const couronne = new THREE.BufferGeometry();
  couronne.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  couronne.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  couronne.computeVertexNormals();
  const matPalme = new THREE.MeshStandardMaterial({ map: texturePalme(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 });
  MODELES = {
    manguier: [[troncM, ecorce], [houM, feuillage]],
    acacia: [[troncA, ecorce], [houA, feuillage]],
    palmier: [[stipe, M?.ecorce || ecorce], [couronne, matPalme]],
  };
  return MODELES;
}

/** Arbres d'une tuile : [x, y, z, estimé] -> groupe d'objets instanciés par espèce. */
export function construireArbres(liste, M, qualite) {
  const mod = modeles(M);
  const parEspece = { manguier: [], acacia: [], palmier: [] };
  for (const a of liste) {
    const h = Math.abs(Math.sin(a[0] * 12.9898 + a[2] * 78.233)) % 1;
    parEspece[h < 0.5 ? "manguier" : h < 0.78 ? "palmier" : "acacia"].push(a);
  }
  const groupe = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const [esp, l] of Object.entries(parEspece)) {
    if (!l.length) continue;
    const rnd = aleatoire(l.length * 97 + esp.length);
    const mats = l.map(([x, y, z]) => {
      const e = 0.75 + rnd() * 0.55;
      q.setFromAxisAngle(Y, rnd() * 6.28); s.set(e, e * (0.9 + rnd() * 0.25), e); p.set(x, y - 0.1, z);
      return m4.compose(p, q, s).clone();
    });
    for (const [geo, mat] of mod[esp]) {
      const im = new THREE.InstancedMesh(geo, mat, l.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = qualite !== "basse";
      im.receiveShadow = true;
      im.computeBoundingSphere();
      groupe.add(im);
    }
  }
  return groupe;
}

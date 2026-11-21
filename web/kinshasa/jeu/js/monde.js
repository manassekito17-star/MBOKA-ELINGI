// Chargement de la ville réelle PAR TUILES autour du joueur (streaming).
// Chaque tuile (200 m) contient bâtiments, routes, lieux, eau, sol et arbres.
// Les tuiles lointaines sont déchargées : géométrie, matériaux et collisions.
import * as THREE from "three";
import { Relief, aleatoire, dansPolygone } from "./geo.js";

/** Couleur sRGB (0–1) -> linéaire, pour les couleurs de sommets. */
function lin(r, g, b) {
  const c = new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
  return [c.r, c.g, c.b];
}
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3();
/** Remet dans le bon ordre les sommets d'un triangle pour que sa face avant regarde vers `n`. */
function orienter(t, n) {
  _ab.set(t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]);
  _ac.set(t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]);
  const cr = _ab.cross(_ac);
  return cr.x * n[0] + cr.y * n[1] + cr.z * n[2] < 0 ? [t[0], t[2], t[1]] : t;
}

const FACADES = [0xefe9dc, 0xf4f2ec, 0xe3d6bf, 0xd9d6d0, 0xecd3bd, 0xcfdbe3, 0xe8dcb0, 0xd7c4a8];
const TOITS = [0x9aa0a6, 0x8d5a3b, 0x6b7076, 0xa4512f, 0x5b6f86, 0xb7b2a8];

export class Monde {
  constructor(scene, physique, base, qualite) {
    this.scene = scene;
    this.physique = physique;
    this.base = base;              // URL du dossier de la zone
    this.qualite = qualite;
    this.tuiles = new Map();       // "i_j" -> {groupe, corps, donnees}
    this.enCours = new Set();
    this.lieux = [];               // lieux chargés (pour interactions)
    this.lampadaires = [];         // positions des lampadaires chargés
    this.rayon = qualite === "basse" ? 1 : 2;   // tuiles chargées autour du joueur
    this.matBat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this._ajouterFenetres(this.matBat);
    this.matRoute = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.matEau = new THREE.MeshStandardMaterial({ color: 0x3f6b7a, roughness: 0.15, metalness: 0.2 });
    this.matSol = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.lampeMat = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffd98a, emissiveIntensity: 0 });
  }

  async charger() {
    this.manifest = await (await fetch(this.base + "manifest.json")).json();
    const r = this.manifest.relief;
    const buf = await (await fetch(this.base + "relief.bin")).arrayBuffer();
    this.relief = new Relief(new Float32Array(buf), r.n, r.pas);
    this.reseau = await (await fetch(this.base + "reseau.json")).json();
    this.index = new Map(this.manifest.tuiles.map((t) => [`${t.i}_${t.j}`, t]));
    this._creerSol();
    return this.manifest;
  }

  hauteur(x, z) {
    return this.relief ? this.relief.hauteur(x, z) : 0;
  }

  /** Sol continu (relief réel lissé) + collision « heightfield ». */
  _creerSol() {
    const { n, pas } = this.manifest.relief;
    const taille = (n - 1) * pas;
    const geo = new THREE.PlaneGeometry(taille, taille, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const couleurs = new Float32Array(pos.count * 3);
    const rnd = aleatoire(7);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setY(k, this.relief.hauteur(x, z) - 0.05);
      const v = 0.92 + rnd() * 0.1;
      const [r, g, b] = lin(0.50 * v, 0.38 * v, 0.28 * v);   // terre battue
      couleurs[k * 3] = r; couleurs[k * 3 + 1] = g; couleurs[k * 3 + 2] = b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(couleurs, 3));
    geo.computeVertexNormals();
    const sol = new THREE.Mesh(geo, this.matSol);
    sol.receiveShadow = true;
    this.scene.add(sol);
    this.physique.ajouterRelief(this.relief.d, n, taille);
  }

  /** Charge/décharge les tuiles selon la position du joueur. */
  mettreAJour(x, z) {
    const { demi, tuile } = this.manifest;
    const ci = Math.floor((x + demi) / tuile);
    const cj = Math.floor((z + demi) / tuile);
    const voulu = new Set();
    for (let di = -this.rayon; di <= this.rayon; di++) {
      for (let dj = -this.rayon; dj <= this.rayon; dj++) {
        const k = `${ci + di}_${cj + dj}`;
        if (this.index.has(k)) voulu.add(k);
      }
    }
    for (const k of voulu) {
      if (!this.tuiles.has(k) && !this.enCours.has(k)) this._chargerTuile(k);
    }
    for (const [k, t] of this.tuiles) {
      const [i, j] = k.split("_").map(Number);
      if (Math.abs(i - ci) > this.rayon + 1 || Math.abs(j - cj) > this.rayon + 1) this._dechargerTuile(k, t);
    }
  }

  async _chargerTuile(k) {
    this.enCours.add(k);
    try {
      const d = await (await fetch(this.base + this.index.get(k).f)).json();
      const groupe = new THREE.Group();
      groupe.name = "tuile_" + k;
      const corps = [];
      if (d.s.length) groupe.add(this._sol(d.s));
      if (d.w.length) groupe.add(this._eau(d.w));
      if (d.r.length) groupe.add(this._routes(d.r));
      if (d.b.length) {
        const { mesh, triangles } = this._batiments(d.b);
        groupe.add(mesh);
        corps.push(this.physique.ajouterMaillageFixe(triangles));
      }
      if (d.t.length) groupe.add(this._arbres(d.t));
      const lamp = this._lampadaires(d.r, k);
      if (lamp) groupe.add(lamp);
      this.scene.add(groupe);
      for (const l of d.l) this.lieux.push({ ...l, tuile: k, y: this.hauteur(l.x, l.z) });
      this.tuiles.set(k, { groupe, corps, d });
    } catch (e) {
      console.warn("Tuile illisible", k, e);
    } finally {
      this.enCours.delete(k);
    }
  }

  _dechargerTuile(k, t) {
    this.scene.remove(t.groupe);
    t.groupe.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const c of t.corps) this.physique.retirer(c);
    this.lieux = this.lieux.filter((l) => l.tuile !== k);
    this.lampadaires = this.lampadaires.filter((l) => l.tuile !== k);
    this.tuiles.delete(k);
  }

  /** Bâtiments : extrusion des contours réels ; toits plats ou en tôle selon la hauteur. */
  _batiments(liste) {
    const pos = [], nor = [], col = [], uv = [], tri = [];
    const c = new THREE.Color();
    for (const b of liste) {
      const pts = [];
      for (let i = 0; i < b.p.length; i += 2) pts.push(new THREE.Vector2(b.p[i], b.p[i + 1]));
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const y0 = b.y - 1.5;                 // fondation enterrée (pas de vide sous les murs)
      const y1 = b.y + b.h;
      const haut = b.h >= 15;
      c.setHex(haut ? 0xc9c4ba : FACADES[b.v % 8]);
      const cr = c.r, cg = c.g, cb = c.b;
      let perim = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], d = pts[(i + 1) % pts.length];
        const lg = a.distanceTo(d);
        if (lg < 0.05) continue;
        const nx = (d.y - a.y) / lg, nz = -(d.x - a.x) / lg;
        const n = [nx, 0, nz];
        const quad = [...orienter([[a.x, y0, a.y, perim, y0 - b.y], [d.x, y0, d.y, perim + lg, y0 - b.y], [d.x, y1, d.y, perim + lg, b.h]], n),
          ...orienter([[a.x, y0, a.y, perim, y0 - b.y], [d.x, y1, d.y, perim + lg, b.h], [a.x, y1, a.y, perim, b.h]], n)];
        for (const [x, y, z, u, v] of quad) {
          pos.push(x, y, z); nor.push(nx, 0, nz); col.push(cr, cg, cb); uv.push(u, v);
          tri.push(x, y, z);
        }
        perim += lg;
      }
      // Toit.
      const idx = THREE.ShapeUtils.triangulateShape(pts, []);
      c.setHex(haut ? 0x9c9890 : TOITS[(b.v * 3) % TOITS.length]);
      for (const [i0, i1, i2] of idx) {
        const t = orienter([i0, i1, i2].map((i) => [pts[i].x, y1, pts[i].y]), [0, 1, 0]);
        for (const [x, y, z] of t) {
          pos.push(x, y, z); nor.push(0, 1, 0); col.push(c.r, c.g, c.b); uv.push(-1, -1);
          tri.push(x, y, z);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aFac", new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(g, this.matBat);
    mesh.castShadow = this.qualite !== "basse";
    mesh.receiveShadow = true;
    return { mesh, triangles: new Float32Array(tri) };
  }

  /** Fenêtres dessinées par le shader (aucune texture à télécharger). */
  _ajouterFenetres(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNuit = { value: 0 };
      this.uNuit = sh.uniforms.uNuit;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aFac;\nvarying vec2 vFac;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFac = aFac;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vFac;\nuniform float uNuit;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}")
        .replace("#include <color_fragment>", `#include <color_fragment>
          float fenetre = 0.0; float allume = 0.0;
          if (vFac.y > 0.0) {
            vec2 cel = vec2(vFac.x / 3.3, vFac.y / 3.1);
            vec2 f = fract(cel);
            fenetre = step(0.28, f.x) * step(f.x, 0.72) * step(0.35, f.y) * step(f.y, 0.80) * step(0.4, vFac.y);
            float r = h21(floor(cel) + floor(vFac.x * 0.01));
            allume = step(0.55, r);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.62, 1.0 - smoothstep(0.0, 0.5, vFac.y));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.16, 0.19), fenetre);
          }`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(1.0, 0.82, 0.55) * fenetre * allume * uNuit * 0.9;`);
    };
  }

  /** Routes drapées sur le relief : asphalte (axes) ou terre battue (rues de quartier). */
  _routes(liste) {
    const pos = [], col = [], nor = [];
    const ASPHALTE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
    const ORDRE = { motorway: 6, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
    for (const r of liste) {
      const p = r.p;
      const w = r.w / 2;
      const asph = ASPHALTE.has(r.k);
      const base = asph ? lin(0.30, 0.30, 0.31) : r.k === "footway" || r.k === "path" ? lin(0.62, 0.55, 0.45) : lin(0.55, 0.37, 0.25);
      const dy = 0.04 + (ORDRE[r.k] || 0) * 0.006;
      for (let i = 0; i + 5 < p.length; i += 3) {
        const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
        const lg = Math.hypot(bx - ax, bz - az) || 1;
        const ox = (-(bz - az) / lg) * w, oz = ((bx - ax) / lg) * w;
        const q = [[ax + ox, ay, az + oz], [ax - ox, ay, az - oz], [bx - ox, by, bz - oz],
          [ax + ox, ay, az + oz], [bx - ox, by, bz - oz], [bx + ox, by, bz + oz]];
        for (const [x, y, z] of [...orienter(q.slice(0, 3), [0, 1, 0]), ...orienter(q.slice(3), [0, 1, 0])]) {
          pos.push(x, y + dy, z); col.push(...base); nor.push(0, 1, 0);
        }
        // Marquage central discontinu sur les grands axes.
        if (asph && r.w >= 7 && (i / 3) % 2 === 0) {
          const mw = 0.08;
          const mx = (-(bz - az) / lg) * mw, mz = ((bx - ax) / lg) * mw;
          const m = [[ax + mx, ay, az + mz], [ax - mx, ay, az - mz], [bx - mx, by, bz - mz],
            [ax + mx, ay, az + mz], [bx - mx, by, bz - mz], [bx + mx, by, bz + mz]];
          const blanc = lin(0.92, 0.9, 0.82);
          for (const [x, y, z] of [...orienter(m.slice(0, 3), [0, 1, 0]), ...orienter(m.slice(3), [0, 1, 0])]) {
            pos.push(x, y + dy + 0.01, z); col.push(...blanc); nor.push(0, 1, 0);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, this.matRoute);
    m.receiveShadow = true;
    return m;
  }

  _polys(liste, couleurFn, dy) {
    const pos = [], col = [], nor = [];
    for (const s of liste) {
      const pts = [];
      for (let i = 0; i < s.p.length; i += 2) pts.push(new THREE.Vector2(s.p[i], s.p[i + 1]));
      if (pts.length < 3) continue;
      const idx = THREE.ShapeUtils.triangulateShape(pts, []);
      const cc = couleurFn(s);
      for (const [a, b, c] of idx) {
        const t = orienter([a, b, c].map((i) => [pts[i].x, this.hauteur(pts[i].x, pts[i].y) + dy, pts[i].y]), [0, 1, 0]);
        for (const [x, y, z] of t) { pos.push(x, y, z); col.push(...cc); nor.push(0, 1, 0); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  }

  _sol(liste) {
    const VERT = ["park", "recreation", "golf", "cemetery", "agriculture", "horticulture", "grass", "garden"];
    const g = this._polys(liste, (s) => (VERT.includes(s.k) ? lin(0.33, 0.47, 0.22) : lin(0.6, 0.55, 0.47)), 0.02);
    const m = new THREE.Mesh(g, this.matRoute);
    m.receiveShadow = true;
    return m;
  }

  _eau(liste) {
    const g = this._polys(liste, () => [1, 1, 1], -0.3);
    return new THREE.Mesh(g, this.matEau);
  }

  /** Arbres réels (OpenStreetMap) et estimés (zones arborées satellite), instanciés. */
  _arbres(liste) {
    const groupe = new THREE.Group();
    const tronc = new THREE.CylinderGeometry(0.18, 0.3, 3, 6);
    tronc.translate(0, 1.5, 0);
    const feuillage = new THREE.IcosahedronGeometry(2.6, 1);
    feuillage.scale(1, 0.8, 1);
    feuillage.translate(0, 4.2, 0);
    const mt = new THREE.InstancedMesh(tronc, new THREE.MeshStandardMaterial({ color: 0x5a4330 }), liste.length);
    const mf = new THREE.InstancedMesh(feuillage, new THREE.MeshStandardMaterial({ color: 0x3d6b2a, flatShading: true }), liste.length);
    const m = new THREE.Matrix4();
    const rnd = aleatoire(liste.length * 31 + 5);
    liste.forEach(([x, y, z], i) => {
      const s = 0.8 + rnd() * 0.6;
      m.makeRotationY(rnd() * 6.28).scale(new THREE.Vector3(s, s, s)).setPosition(x, y, z);
      mt.setMatrixAt(i, m);
      mf.setMatrixAt(i, m);
    });
    mf.castShadow = true;
    groupe.add(mt, mf);
    return groupe;
  }

  /** Lampadaires le long des grands axes (positions générées tous les 35 m : simulées). */
  _lampadaires(routes, tuile) {
    const pts = [];
    for (const r of routes) {
      if (!["trunk", "primary", "secondary", "motorway"].includes(r.k)) continue;
      const p = r.p;
      let acc = 0;
      for (let i = 0; i + 5 < p.length; i += 3) {
        const lg = Math.hypot(p[i + 3] - p[i], p[i + 5] - p[i + 2]);
        acc += lg;
        if (acc < 35) continue;
        acc = 0;
        const ox = -(p[i + 5] - p[i + 2]) / (lg || 1), oz = (p[i + 3] - p[i]) / (lg || 1);
        for (const s of [1, -1]) {
          pts.push([p[i] + ox * s * (r.w / 2 + 1), p[i + 1], p[i + 2] + oz * s * (r.w / 2 + 1), Math.atan2(-ox * s, -oz * s)]);
        }
      }
    }
    if (!pts.length) return null;
    const poteau = new THREE.CylinderGeometry(0.07, 0.11, 9, 5);
    poteau.translate(0, 4.5, 0);
    const lampe = new THREE.BoxGeometry(0.4, 0.15, 0.8);
    lampe.translate(0, 8.9, 1.1);
    const mp = new THREE.InstancedMesh(poteau, new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.6, roughness: 0.4 }), pts.length);
    const ml = new THREE.InstancedMesh(lampe, this.lampeMat, pts.length);
    const m = new THREE.Matrix4();
    pts.forEach(([x, y, z, a], i) => {
      m.makeRotationY(a).setPosition(x, y, z);
      mp.setMatrixAt(i, m);
      ml.setMatrixAt(i, m);
      this.lampadaires.push({ x: x + Math.sin(a) * 1.1, y: y + 8.6, z: z + Math.cos(a) * 1.1, tuile });
    });
    const g = new THREE.Group();
    g.add(mp, ml);
    return g;
  }

  /** Le joueur est-il à l'intérieur d'un bâtiment (pour éviter d'y apparaître) ? */
  dansBatiment(x, z) {
    for (const t of this.tuiles.values()) {
      for (const b of t.d.b) if (dansPolygone(x, z, b.p)) return true;
    }
    return false;
  }
}

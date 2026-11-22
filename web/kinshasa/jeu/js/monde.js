// Chargement de la ville réelle PAR TUILES autour du joueur (streaming).
// Chaque tuile (200 m) contient bâtiments, routes, lieux, eau, sol et arbres.
// Les tuiles lointaines sont déchargées : géométrie, matériaux et collisions.
import * as THREE from "three";
import { Relief, aleatoire, dansPolygone } from "./geo.js";
import { construireBatiments, construireDetails, fenetresLointaines, Lot } from "./architecture.js";
import { construireArbres } from "./vegetation.js";

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
  constructor(scene, physique, base, qualite, materiaux = null) {
    this.M = materiaux?.m || null;   // matériaux PBR (null : rendu simple d'origine)
    this.loin = {};
    if (this.M) for (const k of ["crepi", "crepiUse", "parpaing", "brique"]) this.loin[k] = fenetresLointaines(this.M[k]);
    this.rayonDetails = qualite === "basse" ? 0 : 1;   // tuiles avec fenêtres en relief, balcons, etc.
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
    this.relief = new Relief(new Float32Array(buf), r.nx ?? r.n, r.pas, r.nz ?? r.n);
    this.reseau = await (await fetch(this.base + "reseau.json")).json();
    this.index = new Map(this.manifest.tuiles.map((t) => [`${t.i}_${t.j}`, t]));
    // Carrefours (au moins 3 tronçons se rejoignent) : pas de trottoir en travers des rues.
    const compte = new Map();
    for (const r of this.reseau) for (const i of [0, r.p.length - 2]) {
      const k = `${Math.round(r.p[i])}_${Math.round(r.p[i + 1])}`;
      compte.set(k, (compte.get(k) || 0) + 1);
    }
    this.carrefours = new Map();
    for (const [k, n] of compte) if (n >= 3) {
      const [x, z] = k.split("_").map(Number);
      const c = `${Math.floor(x / 50)}_${Math.floor(z / 50)}`;
      if (!this.carrefours.has(c)) this.carrefours.set(c, []);
      this.carrefours.get(c).push([x, z]);
    }
    this._creerSol();
    return this.manifest;
  }

  hauteur(x, z) {
    return this.relief ? this.relief.hauteur(x, z) : 0;
  }

  /** Sol continu (relief réel lissé) + collision « heightfield ». */
  _creerSol() {
    const { pas } = this.manifest.relief;
    const n = this.relief.n, nz = this.relief.nz;
    const taille = (n - 1) * pas, tailleZ = (nz - 1) * pas;
    const geo = new THREE.PlaneGeometry(taille, tailleZ, n - 1, nz - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const couleurs = new Float32Array(pos.count * 3);
    const rnd = aleatoire(7);
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setY(k, this.relief.hauteur(x, z) - 0.05);
      const v = 0.92 + rnd() * 0.1;
      const [r, g, b] = this.M ? [0.9 * v, 0.86 * v, 0.82 * v] : lin(0.50 * v, 0.38 * v, 0.28 * v);   // terre battue
      couleurs[k * 3] = r; couleurs[k * 3 + 1] = g; couleurs[k * 3 + 2] = b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(couleurs, 3));
    if (this.M) {   // UV en mètres pour la texture de terre (latérite)
      const uv = geo.attributes.uv;
      for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
    }
    geo.computeVertexNormals();
    const sol = new THREE.Mesh(geo, this.M ? this.M.terre : this.matSol);
    sol.receiveShadow = true;
    this.scene.add(sol);
    this.physique.ajouterRelief(this.relief.d, n, taille, nz);
  }

  /** Charge/décharge les tuiles selon la position du joueur. */
  mettreAJour(x, z) {
    const { demi, tuile } = this.manifest;
    const ci = Math.floor((x + (this.manifest.demi_x ?? demi)) / tuile);
    const cj = Math.floor((z + (this.manifest.demi_z ?? demi)) / tuile);
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
    this.centre = [ci, cj];
    // Niveau de détail : une tuile mise à jour par appel (évite les saccades).
    for (const k of this.tuiles.keys()) if (this._niveauDetail(k)) break;
  }

  /** Bâtiments proches : fenêtres en relief, balcons, équipements ; lointains : façades simplifiées. */
  _niveauDetail(k) {
    const t = this.tuiles.get(k);
    if (!t || !t.corpsBat || !this.centre) return false;
    const [i, j] = k.split("_").map(Number);
    const proche = Math.max(Math.abs(i - this.centre[0]), Math.abs(j - this.centre[1])) <= this.rayonDetails;
    if (proche === t.proche) return false;
    t.proche = proche;
    for (const m of t.corpsBat.children) {
      const nom = m.userData.mat;
      if (this.loin[nom]) m.material = proche ? this.M[nom] : this.loin[nom];
    }
    if (proche && !t.detGroupe) {
      t.detGroupe = construireDetails(t.details, this.M, this.qualite);
      t.groupe.add(t.detGroupe);
    } else if (!proche && t.detGroupe) {
      t.groupe.remove(t.detGroupe);
      t.detGroupe.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      t.detGroupe = null;
    }
    return true;
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
      this._arbresRue = [];
      if (d.r.length) groupe.add(this.M ? this._routesPBR(d.r) : this._routes(d.r));
      let details = null, corpsBat = null;
      if (d.b.length && this.M) {
        const r = construireBatiments(d.b, this.M, this.qualite);
        corpsBat = r.corps; details = r.details;
        groupe.add(corpsBat);
        if (r.triangles.length) corps.push(this.physique.ajouterMaillageFixe(r.triangles));
      } else if (d.b.length) {
        const { mesh, triangles } = this._batiments(d.b);
        groupe.add(mesh);
        corps.push(this.physique.ajouterMaillageFixe(triangles));
      }
      const estimes = this.M ? this._arbresCours(d, k) : [];
      if (this.M && (d.t.length || this._arbresRue.length || estimes.length)) groupe.add(construireArbres([...d.t, ...this._arbresRue, ...estimes], this.M, this.qualite));
      else if (d.t.length) groupe.add(this._arbres(d.t));
      const lamp = this._lampadaires(d.r, k);
      if (lamp) groupe.add(lamp);
      this.scene.add(groupe);
      for (const l of d.l) this.lieux.push({ ...l, tuile: k, y: this.hauteur(l.x, l.z) });
      this.tuiles.set(k, { groupe, corps, d, details, corpsBat, detGroupe: null, proche: null });
      this._niveauDetail(k);
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
      // fc / tc : couleurs imposées d'après photos (ex. Hôpital du Cinquantenaire).
      c.setHex(b.fc ? parseInt(b.fc, 16) : haut ? 0xc9c4ba : FACADES[b.v % 8]);
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
      c.setHex(b.tc ? parseInt(b.tc, 16) : haut ? 0x9c9890 : TOITS[(b.v * 3) % TOITS.length]);
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

  /**
   * Arbres des cours et parcelles (positions ESTIMÉES) : OpenStreetMap n'en cartographie presque
   * aucun dans les quartiers, alors que les manguiers et palmiers y sont nombreux. On en place
   * sur le terrain libre (hors bâtiments, hors rues, à distance des murs), environ un pour 900 m².
   */
  _arbresCours(d, k) {
    if (!d.b.length) return [];
    const [i, j] = k.split("_").map(Number);
    const { tuile } = this.manifest;
    const x0 = i * tuile - (this.manifest.demi_x ?? this.manifest.demi), z0 = j * tuile - (this.manifest.demi_z ?? this.manifest.demi);
    const rnd = aleatoire(i * 7919 + j * 104729 + 3);
    const bats = d.b.map((b) => {
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let q = 0; q < b.p.length; q += 2) { mnx = Math.min(mnx, b.p[q]); mxx = Math.max(mxx, b.p[q]); mnz = Math.min(mnz, b.p[q + 1]); mxz = Math.max(mxz, b.p[q + 1]); }
      return { b, mnx: mnx - 2.5, mxx: mxx + 2.5, mnz: mnz - 2.5, mxz: mxz + 2.5 };
    });
    const segs = [];
    for (const r of d.r) for (let q = 0; q + 5 < r.p.length; q += 3) segs.push([r.p[q], r.p[q + 2], r.p[q + 3], r.p[q + 5], r.w / 2 + 2]);
    const loinRoutes = (x, z) => segs.every(([ax, az, bx, bz, w]) => {
      const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
      return Math.hypot(ax + lx * t - x, az + lz * t - z) > w;
    });
    const res = [];
    const n = Math.round((tuile * tuile) / 900);
    for (let s = 0; s < n * 3 && res.length < n; s++) {
      const x = x0 + rnd() * tuile, z = z0 + rnd() * tuile;
      if (bats.some((o) => x > o.mnx && x < o.mxx && z > o.mnz && z < o.mxz)) continue;
      if (!loinRoutes(x, z)) continue;
      res.push([x, this.hauteur(x, z), z, 1]);
    }
    return res;
  }

  /** Distance au carrefour le plus proche (m). */
  _distCarrefour(x, z) {
    let d = Infinity;
    const ci = Math.floor(x / 50), cj = Math.floor(z / 50);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const [a, b] of this.carrefours.get(`${i}_${j}`) || []) d = Math.min(d, Math.hypot(a - x, b - z));
    }
    return d;
  }

  /**
   * Rues texturées : asphalte (revêtement cartographié, sinon grands axes) ou latérite
   * rouge (rues en terre), bords salis, marquages, trottoirs pavés avec bordures en béton
   * le long des axes asphaltés (interrompus aux carrefours).
   */
  _routesPBR(liste) {
    const ASPHALTE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
    const PIETON = new Set(["footway", "path", "pedestrian", "steps", "cycleway"]);
    const ORDRE = { motorway: 6, trunk: 6, primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
    const lots = { asphalte: new Lot(), laterite: new Lot(), paves: new Lot(), terre: new Lot(), beton: new Lot(), marquage: new Lot() };
    const H = [0, 1, 0];
    const blanc = [1, 1, 1], bord = [0.74, 0.72, 0.7];
    for (const r of liste) {
      const p = r.p;
      const revetu = r.s ? /paved|asphalt|concrete|sett|paving/.test(r.s) && !/unpaved/.test(r.s) : ASPHALTE.has(r.k);
      const pieton = PIETON.has(r.k);
      const L = pieton ? lots[revetu ? "paves" : "terre"] : lots[revetu ? "asphalte" : "laterite"];
      const w = r.w / 2;
      const dy = 0.04 + (ORDRE[r.k] || 0) * 0.006;
      const trottoir = revetu && !pieton && ["trunk", "primary", "secondary", "tertiary", "motorway"].includes(r.k);
      const ligneBord = revetu && ["trunk", "primary", "secondary", "motorway"].includes(r.k);
      let v = 0;
      for (let i = 0; i + 5 < p.length; i += 3) {
        const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5];
        const lg = Math.hypot(bx - ax, bz - az) || 1;
        const ox = -(bz - az) / lg, oz = (bx - ax) / lg;
        const A = (o, h = 0) => [ax + ox * o, ay + dy + h, az + oz * o], B = (o, h = 0) => [bx + ox * o, by + dy + h, bz + oz * o];
        // Chaussée en 3 bandes : bords plus sombres (poussière, eaux de ruissellement).
        const tache = revetu ? 1 : 0.86 + 0.14 * Math.abs(Math.sin(ax * 0.37 + az * 0.61));
        const ce = blanc.map((c) => c * tache), cb = bord.map((c) => c * tache);
        const m = Math.min(0.6, w * 0.25);
        for (const [o1, o2, c1, c2] of [[-w, -w + m, cb, ce], [-w + m, w - m, ce, ce], [w - m, w, ce, cb]]) {
          L.tri(A(o1), A(o2), B(o2), H, [o1, v], [o2, v], [o2, v + lg], [c1, c2, c2]);
          L.tri(A(o1), B(o2), B(o1), H, [o1, v], [o2, v + lg], [o1, v + lg], [c1, c2, c1]);
        }
        // Marquages : axe discontinu (tirets de 4 m), lignes de rive continues sur les grands axes.
        if (revetu && !pieton && w >= 3.4) {
          const M = lots.marquage;
          const tiret = (o, e, t0, t1) => {
            const P = (t, oo) => [ax + (bx - ax) * t + ox * oo, ay + (by - ay) * t + dy + 0.012, az + (bz - az) * t + oz * oo];
            M.quad(P(t0, o - e), P(t0, o + e), P(t1, o + e), P(t1, o - e), H, [0, 0], [1, 0], [1, 1], [0, 1], blanc);
          };
          if ((i / 3) % 2 === 0) tiret(0, 0.07, 0, 0.5);
          if (ligneBord) { tiret(-w + 0.35, 0.06, 0, 1); tiret(w - 0.35, 0.06, 0, 1); }
        }
        // Trottoirs (2,2 m, +14 cm) avec bordure en béton, sauf près des carrefours.
        if (trottoir && this._distCarrefour((ax + bx) / 2, (az + bz) / 2) > w + 6) {
          for (const s of [-1, 1]) {
            const o1 = s * w, o2 = s * (w + 2.2), h = 0.14;
            const P = lots.paves, Bt = lots.beton;
            P.tri(A(o1, h), A(o2, h), B(o2, h), H, [o1, v], [o2, v], [o2, v + lg], blanc);
            P.tri(A(o1, h), B(o2, h), B(o1, h), H, [o1, v], [o2, v + lg], [o1, v + lg], blanc);
            const nC = [-ox * s, 0, -oz * s];
            Bt.quad(A(o1, -0.05), B(o1, -0.05), B(o1, h), A(o1, h), nC, [v, 0], [v + lg, 0], [v + lg, h], [v, h], [0.9, 0.9, 0.88]);
            Bt.quad(A(o1 + s * 0.15, h + 0.005), B(o1 + s * 0.15, h + 0.005), B(o1, h + 0.005), A(o1, h + 0.005), H, [v, 0], [v + lg, 0], [v + lg, 0.15], [v, 0.15], [0.92, 0.92, 0.9]);
            Bt.quad(A(o2, -0.3), B(o2, -0.3), B(o2, h), A(o2, h), [ox * s, 0, oz * s], [v, 0], [v + lg, 0], [v + lg, h], [v, h], [0.85, 0.85, 0.83]);
            // Arbres d'alignement sur les grandes avenues (positions ESTIMÉES : non cartographiées).
            const hz = Math.abs(Math.sin(ax * 0.173 + az * 0.291 + s));
            if (["trunk", "primary", "secondary"].includes(r.k) && hz < 0.16) this._arbresRue.push([ax + ox * s * (w + 1.5), ay + 0.15, az + oz * s * (w + 1.5), 1]);
          }
        }
        v += lg;
      }
    }
    const groupe = new THREE.Group();
    for (const [nom, l] of Object.entries(lots)) {
      const g = l.geometrie();
      if (!g) continue;
      const mat = nom === "marquage" ? (this.matMarquage ||= new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.65,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) : this.M[nom];
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      groupe.add(m);
    }
    return groupe;
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
    const uv = new Float32Array((pos.length / 3) * 2);
    for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = pos[i]; uv[j + 1] = pos[i + 2]; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  }

  _sol(liste) {
    const VERT = ["park", "recreation", "golf", "cemetery", "agriculture", "horticulture", "grass", "garden", "managed"];
    if (!this.M) {
      const g = this._polys(liste, (s) => (VERT.includes(s.k) ? lin(0.33, 0.47, 0.22) : lin(0.6, 0.55, 0.47)), 0.02);
      const m = new THREE.Mesh(g, this.matRoute);
      m.receiveShadow = true;
      return m;
    }
    // Pelouses (herbe), places et parkings (pavés), le reste en terre battue.
    const DALLE = ["pedestrian", "transportation", "parking", "plaza", "entertainment"];
    const groupe = new THREE.Group();
    for (const [mat, filtre, c] of [["herbe", (s) => VERT.includes(s.k), [0.95, 1, 0.9]], ["paves", (s) => DALLE.includes(s.k), [1, 1, 1]],
      ["terre", (s) => !VERT.includes(s.k) && !DALLE.includes(s.k), [0.95, 0.9, 0.86]]]) {
      const l = liste.filter(filtre);
      if (!l.length) continue;
      const m = new THREE.Mesh(this._polys(l, () => c, 0.02), this.M[mat]);
      m.receiveShadow = true;
      groupe.add(m);
    }
    return groupe;
  }

  _eau(liste) {
    // Au-dessus du sol (posé à -0,05 m) et sous les routes : sinon l'eau serait cachée par le terrain.
    const g = this._polys(liste, () => [1, 1, 1], 0.06);
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

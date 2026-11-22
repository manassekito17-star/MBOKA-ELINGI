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

// ---------------------------------------------------------------------------------------
// Zone Lingwala / Kasa-Vubu : Stade des Martyrs, Palais du Peuple, Hôpital du Cinquantenaire.
// Contours RÉELS (OpenStreetMap, dans manifest.monuments) ; formes, couleurs et hauteurs
// d'après les photos fournies (estimées). Portage web des modèles de la version Godot.
// Repère local : x = est, z = sud.
// ---------------------------------------------------------------------------------------
const mat = (hex, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
const plat = (f) => { const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]); return p; };
const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);

/** Étiquette lisible de loin (texte dessiné sur un canevas, toujours face à la caméra). */
function etiquette(texte, largeur = 40) {
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 160;
  const ctx = cv.getContext("2d");
  ctx.font = "bold 84px system-ui, sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 14; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(texte, 512, 80);
  ctx.fillStyle = "#fff"; ctx.fillText(texte, 512, 80);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(largeur, largeur * 160 / 1024, 1);
  return s;
}

/** Panneau de texte plat (bannières, lettres de façade). */
function panneauTexte(texte, l, h, { fond = null, couleur = "#fff", contour = null } = {}) {
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = Math.round(1024 * h / l);
  const ctx = cv.getContext("2d");
  if (fond) { ctx.fillStyle = fond; ctx.fillRect(0, 0, cv.width, cv.height); }
  ctx.font = `bold ${Math.round(cv.height * 0.62)}px system-ui, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (contour) { ctx.lineWidth = 8; ctx.strokeStyle = contour; ctx.strokeText(texte, 512, cv.height / 2); }
  ctx.fillStyle = couleur; ctx.fillText(texte, 512, cv.height / 2, 1000);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshStandardMaterial({ map: tex, transparent: !fond, roughness: 0.7 }));
}

/** Point de la grande route la plus proche (côté de la façade principale). */
function routeProche(monde, x, z) {
  let best = null, dmin = Infinity;
  for (const r of monde.reseau) {
    if (!["trunk", "primary", "secondary", "tertiary"].includes(r.k)) continue;
    for (let i = 0; i < r.p.length; i += 2) {
      const d = Math.hypot(r.p[i] - x, r.p[i + 1] - z);
      if (d < dmin) { dmin = d; best = [r.p[i], r.p[i + 1]]; }
    }
  }
  return best || [x, z - 100];
}

/** Triangles d'une géométrie (pour les collisions Rapier). */
function triangles(geo, decal = [0, 0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const t = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { t[i] = p[i] + decal[0]; t[i + 1] = p[i + 1] + decal[1]; t[i + 2] = p[i + 2] + decal[2]; }
  return t;
}

/** Drapeau de la RDC dessiné en code : bleu ciel, diagonale rouge bordée de jaune, étoile jaune. */
function drapeauRDC() {
  const cv = document.createElement("canvas");
  cv.width = 120; cv.height = 80;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#007fff"; ctx.fillRect(0, 0, 120, 80);
  ctx.save(); ctx.translate(60, 40); ctx.rotate(-Math.atan2(80, 120));
  ctx.fillStyle = "#f7d618"; ctx.fillRect(-90, -13, 180, 26);
  ctx.fillStyle = "#ce1021"; ctx.fillRect(-90, -9, 180, 18);
  ctx.restore();
  ctx.fillStyle = "#f7d618"; ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 5 : 13, a = -Math.PI / 2 + (k * Math.PI) / 5;
    ctx.lineTo(22 + r * Math.cos(a), 18 + r * Math.sin(a));
  }
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Stade des Martyrs de la Pentecôte (1994) : cuvette ovale, façade blanche nervurée,
 *  bannières rouges, gradins bleus / jaunes / rouges, piste et pelouse, parvis. Hauteur ~30 m (estimée). */
export function stadeMartyrs(scene, physique, monde, contour) {
  const H = 30;
  const pts = plat(contour);
  const n = pts.length;
  const [cx, cz] = centre(pts);
  const y0 = monde.hauteur(cx, cz);
  const g = new THREE.Group();
  g.position.y = y0;
  const pt = (p, k, h) => [cx + (p[0] - cx) * k, h, cz + (p[1] - cz) * k];
  const pos = [], col = [];
  const quad = (a0, b0, a1, b1, c) => { for (const v of [a0, a1, b1, a0, b1, b0]) { pos.push(...v); col.push(...c); } };
  const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const sieges = [lin(0x1a4dbf), lin(0xf2c71a), lin(0xcc1f1f)];
  const beton = lin(0xd9d6cc);
  const etages = [[0.58, 1.2, 0.76, 13, true], [0.76, 13, 0.79, 13, false], [0.79, 14, 0.97, 28, true], [0.97, 28, 1.0, H, false]];
  for (const [k0, h0, k1, h1, gradin] of etages) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(pt(pts[i], k0, h0), pt(pts[j], k0, h0), pt(pts[i], k1, h1), pt(pts[j], k1, h1), gradin ? sieges[Math.floor((i / n) * 12) % 3] : beton);
    }
  }
  for (let i = 0; i < n; i++) {   // façade extérieure blanche
    const j = (i + 1) % n;
    quad(pt(pts[i], 1, -1.5), pt(pts[j], 1, -1.5), pt(pts[i], 1, H), pt(pts[j], 1, H), lin(0xeeebe0));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const coque = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  coque.castShadow = true; coque.receiveShadow = true;
  g.add(coque);
  physique.ajouterMaillageFixe(triangles(geo, [0, y0, 0]));

  // Nervures verticales blanches tous les ~7 m, bandeaux béton et bannières rouges.
  let perim = 0;
  for (let i = 0; i < n; i++) perim += Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);
  const le = (d) => {
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d <= l) return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l];
      d -= l;
    }
    return pts[0];
  };
  const nb = Math.floor(perim / 7);
  const nerv = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, H, 1.8), mat(0xf7f5ee, 0.7), nb);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), un = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < nb; k++) {
    const p = le((perim * k) / nb);
    const dx = p[0] - cx, dz = p[1] - cz;
    q.setFromAxisAngle(Y, Math.atan2(dx, dz));
    m4.compose(new THREE.Vector3(cx + dx * 1.015, H / 2, cz + dz * 1.015), q, un);
    nerv.setMatrixAt(k, m4);
  }
  nerv.castShadow = true;
  g.add(nerv);
  const bande = (k, y, h, hex) => {
    const b = [], c = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a0 = pt(pts[i], k, y), b0 = pt(pts[j], k, y), a1 = pt(pts[i], k, y + h), b1 = pt(pts[j], k, y + h);
      for (const v of [a0, a1, b1, a0, b1, b0]) b.push(...v);
    }
    const gb = new THREE.BufferGeometry();
    gb.setAttribute("position", new THREE.Float32BufferAttribute(b, 3));
    gb.computeVertexNormals();
    g.add(new THREE.Mesh(gb, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, side: THREE.DoubleSide })));
  };
  bande(1.025, 9.5, 1, 0xe6e3d9);
  bande(1.03, 23, 5, 0xcc1418);
  // Textes du jeu sur les bannières (pas de vraies marques).
  const textes = ["LÉOPARDS", "MBOKA ELENGI", "KIN EZALI MBOKA", "ALLEZ LES LÉOPARDS !"];
  for (let k = 0; k < 8; k++) {
    const p = le((perim * (k + 0.5)) / 8);
    const dx = p[0] - cx, dz = p[1] - cz;
    const t = panneauTexte(textes[k % 4], 22, 3.6, { couleur: "#fff" });
    t.position.set(cx + dx * 1.06, 25.5, cz + dz * 1.06);
    t.rotation.y = Math.atan2(dx, dz);
    g.add(t);
  }
  // Piste d'athlétisme et pelouse rayée, orientées selon le grand axe du stade.
  let loin = pts[0], rmax = 0;
  for (const p of pts) { const d = Math.hypot(p[0] - cx, p[1] - cz); if (d > rmax) { rmax = d; loin = p; } }
  const th = Math.atan2(loin[0] - cx, loin[1] - cz);
  const piste = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 48), mat(0xa83d2b, 0.95));
  piste.scale.set(rmax * 0.36, 1, rmax * 0.55);
  piste.rotation.y = th;
  piste.position.set(cx, 0.1, cz);
  piste.receiveShadow = true;
  g.add(piste);
  for (let k = 0; k < 10; k++) {
    const bande2 = new THREE.Mesh(new THREE.BoxGeometry(68, 0.12, 10.5), mat(k % 2 ? 0x3f9938 : 0x33852e, 0.95));
    const o = -52.5 + 5.25 + k * 10.5;
    bande2.position.set(cx + Math.sin(th) * o, 0.14, cz + Math.cos(th) * o);
    bande2.rotation.y = th;
    bande2.receiveShadow = true;
    g.add(bande2);
  }
  // Parvis gris autour du stade.
  const pv = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    for (const v of [pt(pts[i], 1, 0.07), pt(pts[j], 1.38, 0.07), pt(pts[i], 1.38, 0.07), pt(pts[i], 1, 0.07), pt(pts[j], 1, 0.07), pt(pts[j], 1.38, 0.07)]) pv.push(...v);
  }
  const gp = new THREE.BufferGeometry();
  gp.setAttribute("position", new THREE.Float32BufferAttribute(pv, 3));
  gp.computeVertexNormals();
  const parvis = new THREE.Mesh(gp, new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 1, side: THREE.DoubleSide }));
  parvis.receiveShadow = true;
  g.add(parvis);
  const lbl = etiquette("Stade des Martyrs", 46);
  lbl.position.set(cx, H + 14, cz);
  g.add(lbl);
  scene.add(g);
  return { groupe: g, x: cx, z: cz };
}

/** Palais du Peuple (Parlement) : long bâtiment crème à pilastres serrés, panneaux colorés au centre
 *  de la façade, corniche, drapeaux de la RDC, esplanade, bacs aux couleurs nationales. ~20 m (estimée). */
export function palaisDuPeuple(scene, physique, monde, contour) {
  const H = 20;
  const pts = plat(contour);
  const n = pts.length;
  const [cx, cz] = centre(pts);
  const y0 = monde.hauteur(cx, cz);
  // Murs avec fenêtres : même rendu que les bâtiments de la ville (shader de fenêtres).
  const { mesh, triangles: tri } = monde._batiments([{ p: contour, h: H, y: y0, v: 0, fc: "eee5cf", tc: "e3dfd3" }]);
  scene.add(mesh);
  physique.ajouterMaillageFixe(tri);
  const g = new THREE.Group();
  g.position.y = y0;
  const creme = mat(0xf3ebd6, 0.75);
  // Corniche débordante (dalle de 1,6 m, 3 % plus large que le bâtiment).
  const forme = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(cx + (x - cx) * 1.03, -(cz + (z - cz) * 1.03))));
  const corniche = new THREE.Mesh(new THREE.ExtrudeGeometry(forme, { depth: 1.6, bevelEnabled: false }), mat(0xe2ded2, 0.8));
  corniche.rotation.x = -Math.PI / 2;
  corniche.position.y = H;
  corniche.castShadow = true;
  g.add(corniche);
  // Orientation de chaque côté (normale vers l'extérieur).
  const cotes = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.5) continue;
    const d = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    let o = [d[1], -d[0]];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (o[0] * (mx - cx) + o[1] * (mz - cz) < 0) o = [-o[0], -o[1]];
    cotes.push({ a, b, l, d, o, m: [mx, mz] });
  }
  // Pilastres verticaux serrés (tous les 3,2 m).
  const places = [];
  for (const c of cotes) {
    const k = Math.floor(c.l / 3.2);
    for (let s = 0; s <= k; s++) {
      const t = s / Math.max(k, 1);
      places.push([c.a[0] + (c.b[0] - c.a[0]) * t + c.o[0] * 0.35, c.a[1] + (c.b[1] - c.a[1]) * t + c.o[1] * 0.35, Math.atan2(c.d[0], c.d[1])]);
    }
  }
  const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, H, 0.7), creme, places.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), un = new THREE.Vector3(1, 1, 1);
  places.forEach(([x, z, a], i) => { q.setFromAxisAngle(Y, a); m4.compose(new THREE.Vector3(x, H / 2, z), q, un); pil.setMatrixAt(i, m4); });
  pil.castShadow = true;
  g.add(pil);
  // Façade principale : côté tourné vers la grande avenue la plus proche.
  const [rx, rz] = routeProche(monde, cx, cz);
  const vr = [rx - cx, rz - cz];
  const f = cotes.reduce((m, c) => ((c.o[0] * vr[0] + c.o[1] * vr[1]) / Math.hypot(...vr) * c.l > (m.score ?? -Infinity)
    ? { ...c, score: (c.o[0] * vr[0] + c.o[1] * vr[1]) / Math.hypot(...vr) * c.l } : m), {});
  const ang = Math.atan2(f.d[0], f.d[1]);           // axe de la façade
  const P = (along, out, y = 0) => [f.m[0] + f.d[0] * along + f.o[0] * out, y, f.m[1] + f.d[1] * along + f.o[1] * out];
  const couleurs = [0xd92626, 0x1a59cc, 0xf2cc26, 0x26994d, 0xf2801a, 0x8c40a6];
  for (let k = 0; k < 12; k++) {
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(2.3, H - 5, 0.2), mat(couleurs[k % 6], 0.6));
    pnl.position.set(...P(-19.2 + k * 3.2 + 1.6, 0.3, 2.5 + (H - 5) / 2));
    pnl.rotation.y = ang + Math.PI / 2;
    g.add(pnl);
  }
  const esp = new THREE.Mesh(new THREE.BoxGeometry(f.l + 20, 0.1, 48), mat(0x404040, 1));
  esp.position.set(...P(0, 28, 0.08));
  esp.rotation.y = ang + Math.PI / 2;
  esp.receiveShadow = true;
  g.add(esp);
  // Rangée de drapeaux de la RDC.
  const texDrapeau = drapeauRDC();
  const mDrapeau = new THREE.MeshStandardMaterial({ map: texDrapeau, side: THREE.DoubleSide, roughness: 0.8 });
  const mMat = mat(0xebebeb, 0.4, 0.6);
  const nbd = Math.floor(Math.min(f.l, 120) / 9);
  for (let k = 0; k < nbd; k++) {
    const p = P(-(nbd - 1) * 4.5 + k * 9, 20);
    const mat_ = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 12, 6), mMat);
    mat_.position.set(p[0], 6, p[2]);
    g.add(mat_);
    const dr = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), mDrapeau);
    const a = ang + 0.25 * Math.sin(k * 1.7);
    dr.position.set(p[0] + Math.sin(a) * 1.55, 10.8, p[2] + Math.cos(a) * 1.55);
    dr.rotation.y = a - Math.PI / 2;
    g.add(dr);
  }
  // Bacs à fleurs aux couleurs nationales, le long de l'avenue.
  for (let k = 0; k < 10; k++) {
    const bac = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 1.2), mat([0x007fff, 0xf7d618, 0xce1021][k % 3], 0.7));
    bac.position.set(...P(-45 + k * 10, 46, 0.4));
    bac.rotation.y = ang + Math.PI / 2;
    g.add(bac);
  }
  const lbl = etiquette("Palais du Peuple", 40);
  lbl.position.set(cx, H + 10, cz);
  g.add(lbl);
  scene.add(g);
  return { groupe: g, x: cx, z: cz, facade: P(0, 60, 0) };
}

/** Hôpital du Cinquantenaire (2014) : bâtiments du site recolorés d'après photos (blanc / brique),
 *  entrée monumentale (piliers de pierre, marquise, lettres dorées, croix), parvis, verrière,
 *  lampadaires et ambulances. */
export function hopitalCinquantenaire(scene, physique, monde, site, principal) {
  const S = site.p, Pp = plat(principal.p);
  const [cx, cz] = centre(Pp);
  const [rx, rz] = routeProche(monde, cx, cz);
  const lg = Math.hypot(rx - cx, rz - cz) || 1;
  const out = [(rx - cx) / lg, (rz - cz) / lg];
  // Portail sur la limite du terrain, côté rue.
  const dedans = (x, z) => {
    let c = false;
    for (let i = 0, j = S.length / 2 - 1; i < S.length / 2; j = i++) {
      const xi = S[2 * i], zi = S[2 * i + 1], xj = S[2 * j], zj = S[2 * j + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  let gx = cx, gz = cz;
  for (let i = 0; i < 400; i++) {
    if (!dedans(cx + out[0] * i, cz + out[1] * i)) { gx = cx + out[0] * Math.max(i - 4, 0); gz = cz + out[1] * Math.max(i - 4, 0); break; }
  }
  const y0 = monde.hauteur(gx, gz);
  const g = new THREE.Group();                       // repère local : -z = vers la rue
  g.position.set(gx, y0, gz);
  g.rotation.y = Math.atan2(-out[0], -out[1]);
  const profondeur = Math.hypot(gx - cx, gz - cz);
  const blanc = mat(0xf5f5f2, 0.6), pierre = mat(0xa8a194, 0.85);
  const boite = (l, h, p, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const parvis = boite(70, 0.08, profondeur, mat(0x454543, 0.95), 0, 0.1, profondeur / 2);
  parvis.castShadow = false; parvis.receiveShadow = true;
  for (const s of [-1, 1]) boite(4, 7.5, 7, pierre, s * 9, 3.75, 0);
  boite(26, 0.9, 12, blanc, 0, 7.9, 0);
  boite(26.4, 0.25, 12.4, mat(0xb3b8bd, 0.4, 0.5), 0, 8.45, 0);
  const lettres = panneauTexte("HÔPITAL DU CINQUANTENAIRE", 22, 1.6, { couleur: "#ffd640", contour: "#6b4a08" });
  lettres.position.set(0, 9.6, -6.3);
  lettres.rotation.y = Math.PI;
  g.add(lettres);
  boite(2.4, 2.4, 0.2, mat(0x1f4dbf, 0.5), -11.5, 10.4, -6.2);
  boite(1.8, 0.6, 0.25, mat(0xd91414, 0.5), -11.5, 10.4, -6.3);
  boite(0.6, 1.8, 0.25, mat(0xd91414, 0.5), -11.5, 10.4, -6.3);
  // Verrière en arc le long du parvis.
  const verre = new THREE.MeshStandardMaterial({ color: 0xbfd9e6, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  const arc = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, profondeur * 0.6, 18, 1, true, 0, Math.PI), verre);
  arc.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  arc.position.set(24, 3, profondeur / 2);
  g.add(arc);
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) boite(0.25, 3, 0.25, blanc, 24 + s * 4.2, 1.5, profondeur / 2 + (k / 4 - 0.5) * profondeur * 0.56);
  // Lampadaires blancs.
  const globe = new THREE.MeshStandardMaterial({ color: 0xfffff2, emissive: 0xfff7d9, emissiveIntensity: 0.5 });
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const z = 8 + k * profondeur * 0.22;
    boite(0.18, 5.5, 0.18, blanc, s * 16, 2.75, z);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), globe);
    sp.position.set(s * 16, 5.7, z);
    g.add(sp);
  }
  // Ambulances garées devant l'entrée (décor).
  for (let i = 0; i < 2; i++) {
    const x = i * 4 - 2;
    boite(2.1, 2.3, 5.4, blanc, x, 1.45, 16);
    boite(2.12, 0.35, 5.42, mat(0xd91414, 0.5), x, 1.2, 16);
    boite(1.9, 0.7, 0.05, mat(0x141a1f, 0.2), x, 2.0, 16 - 2.72);
    boite(0.6, 0.18, 0.3, mat(0x1a4dff, 0.3), x, 2.7, 14);
  }
  const lbl = etiquette("Hôpital du Cinquantenaire", 44);
  lbl.position.set(cx - gx, principal.h + 8, cz - gz);
  lbl.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -g.rotation.y);
  g.add(lbl);
  scene.add(g);
  // Collisions : piliers et ambulances.
  g.updateMatrixWorld(true);
  const corps = physique.monde.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const qq = new THREE.Quaternion().setFromEuler(g.rotation);
  const v = new THREE.Vector3();
  const solide = (l, h, p, x, y, z) => {
    v.set(x, y, z).applyMatrix4(g.matrixWorld);
    physique.monde.createCollider(RAPIER.ColliderDesc.cuboid(l / 2, h / 2, p / 2).setTranslation(v.x, v.y, v.z)
      .setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w }), corps);
  };
  for (const s of [-1, 1]) solide(4, 7.5, 7, s * 9, 3.75, 0);
  for (let i = 0; i < 2; i++) solide(2.1, 2.3, 5.4, i * 4 - 2, 1.45, 16);
  return { groupe: g, x: gx, z: gz };
}

/** Tous les monuments de la zone Lingwala / Kasa-Vubu. */
export function monumentsCentre(scene, physique, monde, m) {
  const r = {};
  if (m?.stade) r.stade = stadeMartyrs(scene, physique, monde, m.stade.p);
  if (m?.palais) r.palais = palaisDuPeuple(scene, physique, monde, m.palais.p);
  if (m?.hopital_site && m?.hopital_principal) r.hopital = hopitalCinquantenaire(scene, physique, monde, m.hopital_site, m.hopital_principal);
  return r;
}

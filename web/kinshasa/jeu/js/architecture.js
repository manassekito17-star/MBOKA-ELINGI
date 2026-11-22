// Générateur architectural : transforme chaque emprise RÉELLE (OpenStreetMap /
// Overture / Google Open Buildings) en un bâtiment de type kinois, détaillé.
//
// Le contour et la hauteur viennent des données (hauteur souvent ESTIMÉE) ;
// le style (type, couleurs, toiture, ouvertures, équipements) est GÉNÉRÉ de façon
// déterministe d'après la taille, la hauteur et la catégorie du bâtiment.
// Il s'inspire de l'architecture courante de Kinshasa : maisons crépies de
// couleurs vives à toit de tôle, maisons à étage en béton avec réservoir sur la
// dalle et fers en attente, grilles de protection aux fenêtres, rideaux
// métalliques des boutiques, immeubles à balcons et climatiseurs, tours vitrées.
//
// Deux niveaux de détail par tuile :
//  - « corps » (toujours affiché) : murs texturés, bandeaux d'étage, toits en
//    tôle à une ou deux pentes, dalles et acrotères, balcons ;
//  - « détails » (tuiles proches seulement, objets instanciés) : fenêtres en
//    relief avec cadre et vitre réfléchissante, grilles, portes, rideaux de
//    boutique, enseignes, climatiseurs, réservoirs, paraboles, garde-corps,
//    fers d'attente.
import * as THREE from "three";
import { aleatoire } from "./geo.js";

// Couleurs de façades relevées sur des photos de rues de Kinshasa (crépi peint).
const PEINTURES = [0xf1ece0, 0xf4e3b5, 0xe9c98f, 0xd9a86c, 0xe8b8a6, 0xbcd6e6, 0x9fc6e0, 0xc4dfc2,
  0xa9cfa7, 0xf2f2ee, 0xe7d9c9, 0xd6b89a, 0xf0d27a, 0xf3c6a5];
const TERRE_ROUGE = new THREE.Color(0x8a4a2c);   // éclaboussures de latérite au pied des murs
const SIGNES = ["ALIMENTATION", "PHARMACIE", "QUINCAILLERIE", "SALON DE COIFFURE", "TRANSFERT D'ARGENT",
  "BOUTIQUE", "NGANDA - TERRASSE", "PÂTISSERIE", "MALEWA", "CABINE - RECHARGE", "GARAGE", "DÉPÔT DE BOISSONS"];

const lin = (hex) => new THREE.Color(hex);

/** Accumulateur de géométrie pour un matériau (positions, normales, UV en mètres, couleurs). */
export class Lot {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  /** Triangle avec normale imposée (l'ordre des sommets est corrigé si besoin). */
  tri(a, b, c, n, ua, ub, uc, col) {
    let [ca, cb, cc] = Array.isArray(col[0]) ? col : [col, col, col];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; [cb, cc] = [cc, cb]; }
    for (const [v, uv, k] of [[a, ua, ca], [b, ub, cb], [c, uc, cc]]) {
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]);
      this.c.push(k[0], k[1], k[2]);
    }
  }
  /** Quadrilatère a-b-c-d (ordre périphérique), couleurs par sommet possibles. */
  quad(a, b, c, d, n, ua, ub, uc, ud, col, colH) {
    const bas = col, haut = colH || col;
    this.tri(a, b, c, n, ua, ub, uc, [bas, bas, haut]);
    this.tri(a, c, d, n, ua, uc, ud, [bas, haut, haut]);
  }
  geometrie() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/** Rectangle orienté minimal (axes, centre, demi-longueurs) d'un polygone. */
function rectangleOriente(pts) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 0.3) continue;
    const ux = (b[0] - a[0]) / l, uz = (b[1] - a[1]) / l;
    let mnU = Infinity, mxU = -Infinity, mnW = Infinity, mxW = -Infinity;
    for (const p of pts) {
      const u = p[0] * ux + p[1] * uz, w = -p[0] * uz + p[1] * ux;
      mnU = Math.min(mnU, u); mxU = Math.max(mxU, u); mnW = Math.min(mnW, w); mxW = Math.max(mxW, w);
    }
    const aire = (mxU - mnU) * (mxW - mnW);
    if (!best || aire < best.aire) best = { aire, ux, uz, mnU, mxU, mnW, mxW };
  }
  const r = best;
  let u = [r.ux, r.uz], w = [-r.uz, r.ux], L = (r.mxU - r.mnU) / 2, W = (r.mxW - r.mnW) / 2;
  const cu = (r.mxU + r.mnU) / 2, cw = (r.mxW + r.mnW) / 2;
  const centre = [cu * r.ux - cw * r.uz, cu * r.uz + cw * r.ux];
  if (W > L) { [u, w] = [w, [-u[0], -u[1]]]; [L, W] = [W, L]; }    // u = grand axe
  return { centre, u, w, L, W, aire: r.aire };
}

function airePolygone(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** Type architectural d'un bâtiment (déduit de sa taille, de sa hauteur et de sa catégorie). */
export function typeBatiment(b, aire) {
  const k = (b.k || "").toLowerCase(), n = (b.n || "").toLowerCase();
  if (/market|marketplace/.test(k) || /march[ée]/.test(n)) return "marche";
  if (/industrial|warehouse|factory|manufacture|hangar|storage/.test(k) || (aire > 1500 && b.h < 12)) return "entrepot";
  if (b.h >= 30) return "tour";
  if (b.h >= 12) return "immeuble";
  if (/church|cathedral|chapel|mosque|religious/.test(k) || /église|eglise|paroisse|cathédrale|temple/.test(n)) return "eglise";
  if (/school|university|college|hospital|government|civic|public|office|clinic/.test(k)) return "administratif";
  if (/commercial|retail|shop|supermarket|kiosk/.test(k)) return "commerce";
  if (b.h >= 5.5) return "etage";
  return aire >= 170 ? "villa" : "maison";
}

/**
 * Construit le corps des bâtiments d'une tuile et prépare leurs détails.
 * Retourne { corps: Group, triangles (collisions), details: [placements] }.
 */
export function construireBatiments(liste, M, qualite) {
  const lots = {};
  const lot = (nom) => (lots[nom] ||= new Lot());
  const tri = [];                                   // collisions : prisme simple
  const det = { fenetres: [], grilles: [], portes: [], rideaux: [], enseignes: [], clims: [], reservoirs: [],
    paraboles: [], gardeCorps: [], fers: [] };
  for (const b of liste) batiment(b, lot, tri, det);
  const corps = new THREE.Group();
  const ombres = qualite !== "basse";
  for (const [nom, l] of Object.entries(lots)) {
    const g = l.geometrie();
    if (!g) continue;
    const m = new THREE.Mesh(g, M[nom]);
    m.castShadow = ombres; m.receiveShadow = true;
    m.userData.mat = nom;
    corps.add(m);
  }
  return { corps, triangles: new Float32Array(tri), details: det };
}

function batiment(b, lot, tri, det) {
  let pts = [];
  for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
  if (airePolygone(pts) < 0) pts.reverse();          // sens direct (x, z)
  const aire = Math.abs(airePolygone(pts));
  if (aire < 4 || pts.length < 3) return;
  const rnd = aleatoire(Math.round(Math.abs(pts[0][0] * 73.1 + pts[0][1] * 19.7)) + (b.v || 0) * 7919 + 1);
  const type = typeBatiment(b, aire);
  const y0 = b.y - 1.2, yb = b.y;
  const H = Math.max(2.8, b.h);
  const obb = rectangleOriente(pts);
  const rect = aire / Math.max(1, obb.aire);
  // Étages.
  const nEt = type === "maison" || type === "villa" ? 1 : Math.max(1, Math.round(H / (type === "tour" ? 3.6 : 3.2)));
  const hEt = H / nEt;
  // Matériau et couleur des murs.
  let murMat = "crepi", teinte = PEINTURES[Math.floor(rnd() * PEINTURES.length)];
  if (b.fc) teinte = parseInt(b.fc, 16);
  if (type === "maison") {
    const r = rnd();
    if (r < 0.14) { murMat = "parpaing"; teinte = 0xd8d4cc; }        // maison inachevée (parpaings apparents)
    else if (r < 0.5) murMat = "crepiUse";
  } else if (type === "entrepot") { murMat = "tole"; teinte = rnd() < 0.5 ? 0xb9bcbf : 0x9fb0a6; }
  else if (type === "tour") { murMat = "murRideau"; }
  else if (type === "administratif" || type === "eglise") teinte = b.fc ? teinte : rnd() < 0.6 ? 0xf3f0e6 : 0xf1e2b8;
  else if ((type === "immeuble" || type === "etage") && rnd() < 0.25) { murMat = "beton"; teinte = 0xe2ddd3; }
  if (b.fc === "bf6a4f" || b.fc === "a84f38") { murMat = "brique"; teinte = 0xf2e8e2; }   // briques (ex. hôpital)
  const cMur = lin(teinte), cBas = cMur.clone().lerp(TERRE_ROUGE, 0.45).multiplyScalar(0.85);
  const cMurA = cMur.toArray(), cBasA = cBas.toArray();

  // Toiture.
  let toit = "dalle";
  if (["maison", "villa", "eglise", "entrepot", "marche"].includes(type) && rect > 0.72 && obb.W < 22) {
    toit = type === "maison" && obb.W < 6 && rnd() < 0.45 ? "appentis" : "deuxPans";
    if (type === "maison" && rnd() < 0.3) toit = "dalle";              // maison à dalle (futur étage)
  }
  if (type === "administratif" && rect > 0.75 && obb.W < 18 && rnd() < 0.5) toit = "deuxPans";
  const toitMat = b.tc ? "beton" : type === "villa" && rnd() < 0.5 ? "tuile" : rnd() < 0.3 ? "toleRouille" : "tole";
  const hMur = type === "marche" ? Math.min(H, 4.2) : H;

  // --- Murs : soubassement sali (terre rouge), corps, haut de mur.
  const L = lot(murMat === "murRideau" ? "murRideau" : murMat);
  const n = pts.length;
  let perim = 0;
  const cotes = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], d = pts[(i + 1) % n];
    const lg = Math.hypot(d[0] - a[0], d[1] - a[1]);
    if (lg < 0.05) continue;
    const nx = (d[1] - a[1]) / lg, nz = -(d[0] - a[0]) / lg;
    cotes.push({ a, d, lg, nx, nz, u0: perim });
    perim += lg;
  }
  const yTop = yb + hMur;
  if (type !== "marche") {
    for (const c of cotes) {
      const N = [c.nx, 0, c.nz];
      const A = (y) => [c.a[0], y, c.a[1]], D = (y) => [c.d[0], y, c.d[1]];
      const uv = (u, y) => [u, y - yb];
      const yS = Math.min(yb + 0.9, yTop);
      if (murMat !== "murRideau") {
        L.quad(A(y0), D(y0), D(yS), A(yS), N, uv(c.u0, y0), uv(c.u0 + c.lg, y0), uv(c.u0 + c.lg, yS), uv(c.u0, yS), cBasA, cMurA);
        L.quad(A(yS), D(yS), D(yTop), A(yTop), N, uv(c.u0, yS), uv(c.u0 + c.lg, yS), uv(c.u0 + c.lg, yTop), uv(c.u0, yTop), cMurA);
      } else {
        // Tour : socle en béton (2 premiers mètres), puis mur-rideau.
        lot("beton").quad(A(y0), D(y0), D(yb + 4), A(yb + 4), N, uv(c.u0, y0), uv(c.u0 + c.lg, y0), uv(c.u0 + c.lg, yb + 4), uv(c.u0, yb + 4), [0.85, 0.84, 0.82]);
        L.quad(A(yb + 4), D(yb + 4), D(yTop), A(yTop), N, uv(c.u0, 4), uv(c.u0 + c.lg, 4), uv(c.u0 + c.lg, H), uv(c.u0, H), [1, 1, 1]);
      }
      // Entrepôt : soubassement en parpaings sur 2,5 m devant la tôle.
      if (type === "entrepot") {
        const o = 0.03;
        const Ao = (y) => [c.a[0] + c.nx * o, y, c.a[1] + c.nz * o], Do = (y) => [c.d[0] + c.nx * o, y, c.d[1] + c.nz * o];
        lot("parpaing").quad(Ao(y0), Do(y0), Do(yb + 2.5), Ao(yb + 2.5), N, uv(c.u0, y0), uv(c.u0 + c.lg, y0), uv(c.u0 + c.lg, yb + 2.5), uv(c.u0, yb + 2.5), [0.86, 0.84, 0.8]);
      }
      // Collisions (prisme).
      for (const t of [[A(y0), D(y0), D(yTop)], [A(y0), D(yTop), A(yTop)]]) for (const v of t) tri.push(...v);
    }
  }

  // --- Bandeaux d'étage (nez de dalle en saillie) : maisons à étage, immeubles, administratif.
  if (nEt > 1 && type !== "tour" && type !== "entrepot") {
    const Lb = lot("beton");
    const cB = lin(teinte).lerp(lin(0xffffff), 0.5).toArray();
    for (let e = 1; e < nEt; e++) {
      const y = yb + e * hEt;
      for (const c of cotes) {
        const o = 0.12;
        const A = (yy, k = o) => [c.a[0] + c.nx * k, yy, c.a[1] + c.nz * k], D = (yy, k = o) => [c.d[0] + c.nx * k, yy, c.d[1] + c.nz * k];
        Lb.quad(A(y - 0.12), D(y - 0.12), D(y + 0.18), A(y + 0.18), [c.nx, 0, c.nz], [c.u0, y], [c.u0 + c.lg, y], [c.u0 + c.lg, y + 0.3], [c.u0, y + 0.3], cB);
        Lb.quad(A(y + 0.18, 0), D(y + 0.18, 0), D(y + 0.18), A(y + 0.18), [0, 1, 0], [c.u0, 0], [c.u0 + c.lg, 0], [c.u0 + c.lg, o], [c.u0, o], cB);
        Lb.quad(A(y - 0.12, 0), D(y - 0.12, 0), D(y - 0.12), A(y - 0.12), [0, -1, 0], [c.u0, 0], [c.u0 + c.lg, 0], [c.u0 + c.lg, o], [c.u0, o], cB);
      }
    }
  }

  // --- Toits.
  if (toit === "dalle" || type === "tour" || type === "immeuble") {
    const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
    const Lt = lot("beton");
    const cT = [0.72, 0.7, 0.67];
    for (const [i0, i1, i2] of tris) {
      const P = (i) => [pts[i][0], yTop + 0.05, pts[i][1]];
      Lt.tri(P(i0), P(i1), P(i2), [0, 1, 0], pts[i0], pts[i1], pts[i2], cT);
      for (const v of [P(i0), P(i1), P(i2)]) tri.push(v[0], v[1] - 0.05, v[2]);
    }
    // Acrotère (muret de toit) : face extérieure (comme le mur), face intérieure en béton.
    const hA = type === "tour" ? 1.4 : 0.8;
    const La = lot(murMat === "murRideau" ? "beton" : murMat);
    for (const c of cotes) {
      const A = (y) => [c.a[0], y, c.a[1]], D = (y) => [c.d[0], y, c.d[1]];
      La.quad(A(yTop), D(yTop), D(yTop + hA), A(yTop + hA), [c.nx, 0, c.nz], [c.u0, H], [c.u0 + c.lg, H], [c.u0 + c.lg, H + hA], [c.u0, H + hA], murMat === "murRideau" ? [0.85, 0.85, 0.85] : cMurA);
      Lt.quad(D(yTop), A(yTop), A(yTop + hA), D(yTop + hA), [-c.nx, 0, -c.nz], [c.u0, 0], [c.u0 + c.lg, 0], [c.u0 + c.lg, hA], [c.u0, hA], cT);
    }
    // Équipements de toit (détails) : réservoirs, paraboles, fers en attente.
    const [cx, cz] = obb.centre;
    if (type === "tour") {
      // Édicule technique au sommet.
      const ex = obb.u, ew = obb.w, l = Math.min(obb.L * 0.5, 8), w = Math.min(obb.W * 0.5, 6), hE = 4;
      const P = (su, sw, y) => [cx + ex[0] * su * l + ew[0] * sw * w, y, cz + ex[1] * su * l + ew[1] * sw * w];
      const Le = lot("beton");
      const coins = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [a1, a2] = coins[i], [b1, b2] = coins[(i + 1) % 4];
        const mx = (a1 + b1) / 2, mz = (a2 + b2) / 2;
        const N = [ex[0] * mx + ew[0] * mz, 0, ex[1] * mx + ew[1] * mz];
        Le.quad(P(a1, a2, yTop), P(b1, b2, yTop), P(b1, b2, yTop + hE), P(a1, a2, yTop + hE), N, [0, 0], [4, 0], [4, hE], [0, hE], [0.8, 0.8, 0.78]);
      }
      Le.quad(P(-1, -1, yTop + hE), P(1, -1, yTop + hE), P(1, 1, yTop + hE), P(-1, 1, yTop + hE), [0, 1, 0], [0, 0], [4, 0], [4, 4], [0, 4], [0.7, 0.7, 0.68]);
    } else {
      const nbR = type === "immeuble" ? 1 + Math.floor(rnd() * 3) : rnd() < 0.55 ? 1 : 0;
      for (let i = 0; i < nbR; i++) {
        const su = (rnd() - 0.5) * obb.L * 0.8, sw = (rnd() - 0.5) * obb.W * 0.8;
        det.reservoirs.push([cx + obb.u[0] * su + obb.w[0] * sw, yTop + 0.05, cz + obb.u[1] * su + obb.w[1] * sw, rnd() < 0.7 ? 0 : 1, rnd() * 6.28]);
      }
      if (type === "immeuble" && rnd() < 0.6) det.paraboles.push([cx + obb.u[0] * obb.L * 0.6, yTop + 0.05, cz + obb.u[1] * obb.L * 0.6, rnd() * 6.28]);
      if ((type === "maison" || type === "etage") && rnd() < 0.55) {
        // « Fers en attente » : armatures dépassant des poteaux, pour un étage futur.
        for (const [su, sw] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          det.fers.push([cx + obb.u[0] * su * (obb.L - 0.3) + obb.w[0] * sw * (obb.W - 0.3), yTop + 0.05, cz + obb.u[1] * su * (obb.L - 0.3) + obb.w[1] * sw * (obb.W - 0.3)]);
        }
      }
    }
  } else {
    // Toit en pente sur le rectangle orienté : tôle ondulée (ou tuiles), débord de 45 cm.
    const o = 0.45, pente = toit === "appentis" ? 0.18 : type === "eglise" ? 0.6 : 0.27;
    const { u, w, L: Lu, W: Ww, centre } = obb;
    const P = (su, sw, y) => [centre[0] + u[0] * su + w[0] * sw, y, centre[1] + u[1] * su + w[1] * sw];
    const Lt = lot(toitMat);
    // Tôles : neuves (gris argent) ou anciennes et rouillées (brun-orangé), comme sur les photos.
    const rouille = rnd();
    const cT = toitMat === "tuile" ? [0.95, 0.9, 0.88] : rouille < 0.35 ? [0.78, 0.52, 0.36] : rouille < 0.55 ? [0.66, 0.6, 0.55] : [0.9, 0.9, 0.9];
    const lu = Lu + o, ww = Ww + o;
    if (toit === "deuxPans") {
      const yR = yTop + Ww * pente;
      for (const s of [-1, 1]) {
        const N = new THREE.Vector3(w[0] * s * pente, 1, w[1] * s * pente).normalize().toArray();
        const pl = Math.hypot(ww, ww * pente);
        Lt.quad(P(-lu, s * ww, yTop - o * pente), P(lu, s * ww, yTop - o * pente), P(lu, 0, yR), P(-lu, 0, yR), N,
          [0, 0], [2 * lu, 0], [2 * lu, pl], [0, pl], cT);
      }
      // Pignons (triangles de mur sous la toiture).
      for (const s of [-1, 1]) {
        lot(murMat).tri(P(s * Lu, -Ww, yTop), P(s * Lu, Ww, yTop), P(s * Lu, 0, yR), [u[0] * s, 0, u[1] * s], [0, H], [2 * Ww, H], [Ww, H + Ww * pente], cMurA);
      }
    } else {
      // Appentis : une seule pente.
      const yH = yTop + 2 * Ww * pente;
      const N = new THREE.Vector3(w[0] * pente, 1, w[1] * pente).normalize().toArray();
      const pl = Math.hypot(2 * ww, 2 * ww * pente);
      Lt.quad(P(-lu, ww, yTop - o * pente), P(lu, ww, yTop - o * pente), P(lu, -ww, yH + o * pente), P(-lu, -ww, yH + o * pente), N, [0, 0], [2 * lu, 0], [2 * lu, pl], [0, pl], cT);
      const Lm = lot(murMat);
      for (const s of [-1, 1]) Lm.tri(P(s * Lu, Ww, yTop), P(s * Lu, -Ww, yTop), P(s * Lu, -Ww, yH), [u[0] * s, 0, u[1] * s], [0, H], [2 * Ww, H], [2 * Ww, H + 2 * Ww * pente], cMurA);
      Lm.quad(P(-Lu, -Ww, yTop), P(Lu, -Ww, yTop), P(Lu, -Ww, yH), P(-Lu, -Ww, yH), [-w[0], 0, -w[1]], [0, H], [2 * Lu, H], [2 * Lu, H + 2 * Ww * pente], [0, H + 2 * Ww * pente], cMurA);
    }
    // Collisions : dessus plat au niveau de l'égout.
    const tris = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
    for (const t of tris) for (const i of t) tri.push(pts[i][0], yTop, pts[i][1]);
  }

  // --- Marché couvert : poteaux en béton tous les 4 m sous la toiture.
  if (type === "marche") {
    const Lp = lot("beton");
    for (const c of cotes) {
      const k = Math.max(1, Math.round(c.lg / 4));
      for (let s = 0; s < k; s++) {
        const t = s / k;
        const x = c.a[0] + (c.d[0] - c.a[0]) * t, z = c.a[1] + (c.d[1] - c.a[1]) * t;
        poteau(Lp, x, z, y0, yTop, 0.15);
      }
    }
    return;
  }

  // --- Ouvertures (détails) : fenêtres, portes, rideaux métalliques, enseignes, climatiseurs, balcons.
  if (type === "tour") return;                                  // le mur-rideau porte déjà les vitrages
  const longest = cotes.reduce((m, c) => (c.lg > m.lg ? c : m), cotes[0]);
  const grilles = type === "maison" || type === "villa" || type === "etage" || type === "commerce";
  const fenL = type === "immeuble" || type === "administratif" ? 1.5 : 1.2;
  const fenH = type === "immeuble" || type === "administratif" ? 1.6 : 1.3;
  const pas = type === "immeuble" ? 2.9 : type === "administratif" ? 3.0 : 3.4;
  const boutiques = type === "commerce" || (type === "etage" && rnd() < 0.45);   // rez-de-chaussée commerçant
  for (const c of cotes) {
    if (c.lg < 2.2) continue;
    const ang = Math.atan2(c.nx, c.nz);
    const k = Math.max(1, Math.floor((c.lg - 0.8) / pas));
    for (let e = 0; e < nEt; e++) {
      const yF = yb + e * hEt + (e === 0 ? 1.0 : 0.95);
      for (let s = 0; s < k; s++) {
        const t = (s + 0.5) / k;
        const x = c.a[0] + (c.d[0] - c.a[0]) * t, z = c.a[1] + (c.d[1] - c.a[1]) * t;
        const rez = e === 0;
        // Porte d'entrée au milieu du plus long côté (maisons, villas, étages).
        if (rez && c === longest && s === Math.floor(k / 2) && !boutiques && type !== "entrepot") {
          det.portes.push([x, yb, z, ang, rnd()]);
          continue;
        }
        if (rez && boutiques && (c === longest || c.lg > 8)) {
          // Boutique au rez-de-chaussée : rideau métallique et enseigne.
          det.rideaux.push([x, yb, z, ang, Math.min(2.8, c.lg / k - 0.4)]);
          if (s === 0 || rnd() < 0.4) det.enseignes.push([x, yb + 2.75, z, ang, Math.floor(rnd() * SIGNES.length), Math.min(2.9, c.lg / k - 0.2)]);
          continue;
        }
        if (type === "entrepot") {
          if (rez && c === longest && s % 3 === 1) det.rideaux.push([x, yb, z, ang, 4.2]);
          continue;
        }
        det.fenetres.push([x, yF + fenH / 2, z, ang, fenL, fenH, rnd() < 0.35 ? 1 : 0]);
        if (grilles && (rez || rnd() < 0.5)) det.grilles.push([x, yF + fenH / 2, z, ang, fenL, fenH]);
        if ((type === "immeuble" || type === "etage" || type === "administratif") && rnd() < 0.22) {
          const dx = -c.nz * (fenL / 2 + 0.6), dz = c.nx * (fenL / 2 + 0.6);
          det.clims.push([x + dx, yF + 0.2, z + dz, ang]);
        }
      }
      // Balcon sur le plus long côté, aux étages.
      if (e > 0 && c === longest && (type === "immeuble" || type === "etage") && c.lg > 4 && rnd() < 0.7) {
        const lb = Math.min(c.lg - 1.5, 7), prof = 1.2, yS = yb + e * hEt - 0.05;
        const mx = (c.a[0] + c.d[0]) / 2, mz = (c.a[1] + c.d[1]) / 2;
        const ux = -c.nz, uz = c.nx;
        const P = (su, sn, y) => [mx + ux * su + c.nx * sn, y, mz + uz * su + c.nz * sn];
        dalle(lot("beton"), P, lb / 2, prof, yS, 0.16);
        det.gardeCorps.push([mx + c.nx * prof, yS + 0.16, mz + c.nz * prof, ang, lb]);
        for (const s2 of [-1, 1]) det.gardeCorps.push([mx + ux * s2 * lb / 2 + c.nx * prof / 2, yS + 0.16, mz + uz * s2 * lb / 2 + c.nz * prof / 2, ang + Math.PI / 2, prof]);
      }
    }
  }
}

/** Dalle (boîte) définie dans le repère d'un côté de bâtiment. */
function dalle(L, P, demiL, prof, y, ep) {
  const c = [0.85, 0.84, 0.81];
  const q = (a, b, cc, d, n) => L.quad(a, b, cc, d, n, [0, 0], [1, 0], [1, 1], [0, 1], c);
  const h = y + ep;
  q(P(-demiL, 0, h), P(demiL, 0, h), P(demiL, prof, h), P(-demiL, prof, h), [0, 1, 0]);
  q(P(-demiL, 0, y), P(-demiL, prof, y), P(demiL, prof, y), P(demiL, 0, y), [0, -1, 0]);
  const f = P(0, 1, 0), o = P(0, 0, 0);
  const nOut = [f[0] - o[0], 0, f[2] - o[2]];
  q(P(-demiL, prof, y), P(demiL, prof, y), P(demiL, prof, h), P(-demiL, prof, h), nOut);
}

/** Poteau carré. */
function poteau(L, x, z, y0, y1, r) {
  const c = [0.82, 0.8, 0.77];
  for (const [dx, dz, n] of [[r, 0, [1, 0, 0]], [-r, 0, [-1, 0, 0]], [0, r, [0, 0, 1]], [0, -r, [0, 0, -1]]]) {
    const tx = dz ? r : 0, tz = dx ? r : 0;
    L.quad([x + dx - tx, y0, z + dz - tz], [x + dx + tx, y0, z + dz + tz], [x + dx + tx, y1, z + dz + tz], [x + dx - tx, y1, z + dz - tz], n, [0, 0], [1, 0], [1, y1 - y0], [0, y1 - y0], c);
  }
}

// ---------------------------------------------------------------------------------------
// Détails instanciés (géométries unitaires partagées).
// ---------------------------------------------------------------------------------------
let GEO = null;
function geometries() {
  if (GEO) return GEO;
  const fusion = (liste) => {
    const g = new THREE.BufferGeometry();
    const geos = liste.map((x) => x.toNonIndexed());
    const n = geos.reduce((s, x) => s + x.attributes.position.count, 0);
    const p = new Float32Array(n * 3), no = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const x of geos) {
      p.set(x.attributes.position.array, o * 3); no.set(x.attributes.normal.array, o * 3); uv.set(x.attributes.uv.array, o * 2);
      o += x.attributes.position.count;
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(no, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const boite = (l, h, p, x, y, z) => new THREE.BoxGeometry(l, h, p).translate(x, y, z);
  // Cadre de fenêtre unitaire (1 × 1 m, face avant vers +z) + appui saillant.
  const cadre = fusion([boite(1, 0.07, 0.1, 0, 0.465, 0.03), boite(1, 0.07, 0.1, 0, -0.465, 0.03), boite(0.07, 1, 0.1, -0.465, 0, 0.03),
    boite(0.07, 1, 0.1, 0.465, 0, 0.03), boite(0.04, 1, 0.05, 0, 0, 0.0), boite(1.12, 0.06, 0.2, 0, -0.53, 0.08)]);
  const vitre = new THREE.PlaneGeometry(0.93, 0.93).translate(0, 0, -0.01);
  // Grille de protection (barreaux en fer forgé).
  // (barreaux en plans fins : 2 triangles chacun, matériau double face)
  const plan = (l, h, x, y, z) => new THREE.PlaneGeometry(l, h).translate(x, y, z);
  const barres = [];
  for (let i = -3; i <= 3; i++) barres.push(plan(0.025, 1, i * 0.14, 0, 0.12));
  barres.push(plan(1, 0.03, 0, 0.3, 0.12), plan(1, 0.03, 0, -0.3, 0.12), plan(1.04, 0.045, 0, 0.5, 0.12), plan(1.04, 0.045, 0, -0.5, 0.12));
  const grille = fusion(barres);
  // Porte métallique (0,95 × 2,1 m) avec chambranle et marche.
  const porte = fusion([boite(0.95, 2.1, 0.05, 0, 1.05, 0.0), boite(1.1, 0.12, 0.12, 0, 2.16, 0.02), boite(0.08, 2.2, 0.12, -0.51, 1.1, 0.02),
    boite(0.08, 2.2, 0.12, 0.51, 1.1, 0.02), boite(1.3, 0.16, 0.5, 0, 0.08, 0.25)]);
  // Rideau métallique (largeur 1 m, hauteur 2,5 m) avec coffre.
  const rideau = fusion([boite(1, 2.45, 0.06, 0, 1.225, 0.02), boite(1.06, 0.3, 0.3, 0, 2.6, 0.12)]);
  const enseigne = boite(1, 0.7, 0.08, 0, 0.35, 0.3);
  // Climatiseur (unité extérieure) avec ventilateur.
  const clim = fusion([boite(0.8, 0.55, 0.3, 0, 0, 0.17), new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16).rotateX(Math.PI / 2).translate(-0.1, 0, 0.33),
    boite(0.7, 0.04, 0.04, 0, -0.3, 0.12)]);
  // Réservoir d'eau (citerne en plastique) sur pieds.
  const reservoir = fusion([new THREE.CylinderGeometry(0.62, 0.62, 1.3, 18).translate(0, 1.15, 0), new THREE.CylinderGeometry(0.2, 0.25, 0.12, 12).translate(0, 1.86, 0),
    boite(1.1, 0.08, 1.1, 0, 0.46, 0), boite(0.08, 0.5, 0.08, -0.5, 0.25, -0.5), boite(0.08, 0.5, 0.08, 0.5, 0.25, -0.5), boite(0.08, 0.5, 0.08, -0.5, 0.25, 0.5), boite(0.08, 0.5, 0.08, 0.5, 0.25, 0.5)]);
  // Parabole + mât.
  const parabole = fusion([new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6).translate(0, 0.8, 0),
    new THREE.SphereGeometry(0.55, 14, 6, 0, Math.PI * 2, 0, 0.6).rotateX(-Math.PI / 2.4).translate(0, 1.6, 0.15)]);
  // Garde-corps (segment de 1 m) : main courante + barreaux.
  const gc = [boite(1, 0.05, 0.06, 0, 1.0, 0), boite(1, 0.04, 0.04, 0, 0.1, 0)];
  for (let i = 0; i < 5; i++) gc.push(plan(0.035, 0.95, -0.4 + i * 0.2, 0.55, 0));
  const gardeCorps = fusion(gc);
  // Fers en attente (4 barres d'armature).
  const fers = fusion([0, 1, 2, 3].map((i) => new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4).translate((i % 2) * 0.12 - 0.06, 0.55, Math.floor(i / 2) * 0.12 - 0.06)));
  GEO = { cadre, vitre, grille, porte, rideau, enseigne, clim, reservoir, parabole, gardeCorps, fers };
  return GEO;
}

let ATLAS = null;
/** Atlas d'enseignes de boutiques (textes génériques, aucune marque réelle). */
function atlasEnseignes() {
  if (ATLAS) return ATLAS;
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 64 * SIGNES.length;
  const x = c.getContext("2d");
  const fonds = ["#c62828", "#1565c0", "#f9a825", "#2e7d32", "#6a1b9a", "#ef6c00", "#00838f", "#ad1457"];
  SIGNES.forEach((t, i) => {
    x.fillStyle = fonds[i % fonds.length]; x.fillRect(0, i * 64, 1024, 64);
    x.fillStyle = "rgba(255,255,255,0.9)"; x.fillRect(0, i * 64 + 58, 1024, 6);
    x.font = "bold 40px system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillStyle = i % fonds.length === 2 ? "#222" : "#fff"; x.fillText(t, 512, i * 64 + 30, 980);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSigne;")
      .replace("#include <uv_vertex>", `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vec2(uv.x, (uv.y + aSigne) / ${SIGNES.length.toFixed(1)});
        #endif`);
  };
  m.customProgramCacheKey = () => "enseignes";
  ATLAS = m;
  return m;
}

/** Objets instanciés d'une tuile (tuiles proches seulement). */
export function construireDetails(det, M, qualite) {
  const G = geometries();
  const groupe = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
  const coul = new THREE.Color();
  const inst = (geo, mat, liste, f, couleur, ombre = false) => {
    if (!liste.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, liste.length);
    liste.forEach((e, i) => { f(e); m4.compose(p, q, s); im.setMatrixAt(i, m4); if (couleur) im.setColorAt(i, couleur(e, i)); });
    im.castShadow = ombre && qualite !== "basse";
    im.receiveShadow = true;
    im.computeBoundingSphere();
    groupe.add(im);
    return im;
  };
  const place = (x, y, z, a, sx = 1, sy = 1, sz = 1, avance = 0) => {
    p.set(x + Math.sin(a) * avance, y, z + Math.cos(a) * avance); q.setFromAxisAngle(Y, a); s.set(sx, sy, sz);
  };
  inst(G.cadre, M.cadre, det.fenetres, ([x, y, z, a, l, h]) => place(x, y, z, a, l, h, 1));
  inst(G.vitre, M.vitre, det.fenetres, ([x, y, z, a, l, h]) => place(x, y, z, a, l, h, 1, 0.02), (e) => coul.setRGB(e[6], 0, 0));
  inst(G.grille, M.ferForge, det.grilles, ([x, y, z, a, l, h]) => place(x, y, z, a, l * 1.02, h * 1.02, 1));
  const PORTES = [0x7a2c22, 0x1f4e79, 0x2f5d32, 0x3a3a3a, 0x8a6d1f];
  inst(G.porte, M.porte, det.portes, ([x, y, z, a]) => place(x, y, z, a), (e) => coul.setHex(PORTES[Math.floor(e[4] * PORTES.length)]));
  inst(G.rideau, M.rideau, det.rideaux, ([x, y, z, a, l]) => place(x, y, z, a, l, l > 3.5 ? 1.6 : 1, 1), (e, i) => coul.setHSL(((i * 0.37) % 1), 0.25, 0.55));
  if (det.enseignes.length) {
    const im = inst(G.enseigne, atlasEnseignes(), det.enseignes, ([x, y, z, a, , l]) => place(x, y, z, a, l, 1, 1));
    im.geometry = G.enseigne.clone();
    im.geometry.setAttribute("aSigne", new THREE.InstancedBufferAttribute(new Float32Array(det.enseignes.map((e) => SIGNES.length - 1 - e[4])), 1));
  }
  inst(G.clim, M.clim, det.clims, ([x, y, z, a]) => place(x, y, z, a), null, true);
  inst(G.reservoir, M.reservoir, det.reservoirs.filter((r) => r[3] === 0), ([x, y, z, , r]) => place(x, y, z, r), null, true);
  inst(G.reservoir, M.reservoirBleu, det.reservoirs.filter((r) => r[3] === 1), ([x, y, z, , r]) => place(x, y, z, r), null, true);
  inst(G.parabole, M.cadreAlu, det.paraboles, ([x, y, z, r]) => place(x, y, z, r), null, true);
  inst(G.gardeCorps, M.ferForge, det.gardeCorps, ([x, y, z, a, l]) => place(x, y, z, a, l, 1, 1));
  inst(G.fers, M.fers, det.fers, ([x, y, z]) => place(x, y, z, 0));
  return groupe;
}

/** Fenêtres dessinées par le shader pour les tuiles lointaines (niveau de détail bas). */
export function fenetresLointaines(mat) {
  const m = mat.clone();
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMur;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMur = uv;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vMur;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        if (vMur.y > 0.6) {
          vec2 cel = vec2(vMur.x / 3.2, (vMur.y - 0.2) / 3.2);
          vec2 f = fract(cel);
          float fen = step(0.31, f.x) * step(f.x, 0.69) * step(0.3, f.y) * step(f.y, 0.72);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.13, 0.15), fen * 0.92);
        }`);
  };
  m.customProgramCacheKey = () => "loin_" + mat.uuid;
  return m;
}

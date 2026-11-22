// Murs de clôture et portails des parcelles (GÉNÉRÉS, positions estimées).
// À Kinshasa, la plupart des rues de quartier sont bordées de murs de parcelle
// (parpaings bruts ou crépis peints) percés d'un portail métallique. Aucune donnée
// de parcelle n'est disponible : pour chaque maison proche d'une rue de quartier,
// on bâtit un mur parallèle à la rue (à 3 m du bord de chaussée, derrière les
// piétons), sur la largeur de la maison, avec un portail en face d'elle. Les murs
// voisins sur un même côté de rue sont fusionnés ; ils s'interrompent devant tout
// bâtiment ou toute autre rue.
import * as THREE from "three";
import { Lot, typeBatiment, airePolygone, PEINTURES } from "./architecture.js";
import { aleatoire, dansPolygone } from "./geo.js";

const RUES = new Set(["residential", "unclassified", "living_street", "tertiary"]);
const RETRAIT = 3.0;     // distance mur – bord de chaussée (m)
const HAUT = 2.2, EP = 0.2;

/** Polyligne 2D d'un tronçon de rue de la tuile, avec abscisses curvilignes. */
function polyligne(r) {
  const pts = [];
  for (let i = 0; i < r.p.length; i += 3) pts.push([r.p[i], r.p[i + 2]]);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, long: s[s.length - 1], w: r.w / 2, k: r.k };
}

/** Point et normale (côté gauche) à l'abscisse s. */
function pointA(pl, s) {
  let i = 1;
  while (i < pl.pts.length - 1 && pl.s[i] < s) i++;
  const a = pl.pts[i - 1], b = pl.pts[i], l = pl.s[i] - pl.s[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - pl.s[i - 1]) / l));
  const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
  return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx: -dz, nz: dx, dx, dz };
}

/** Projection d'un point sur la polyligne : abscisse, distance signée (côté gauche > 0). */
function projeter(pl, x, z) {
  let best = { d: Infinity };
  for (let i = 1; i < pl.pts.length; i++) {
    const a = pl.pts[i - 1], b = pl.pts[i];
    const lx = b[0] - a[0], lz = b[1] - a[1], l2 = lx * lx + lz * lz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * lx + (z - a[1]) * lz) / l2));
    const px = a[0] + lx * t, pz = a[1] + lz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) {
      const cote = Math.sign(-lz * (x - a[0]) + lx * (z - a[1])) || 1;
      best = { d, s: pl.s[i - 1] + Math.sqrt(l2) * t, cote };
    }
  }
  return best;
}

/**
 * Construit les clôtures d'une tuile.
 * Retourne { groupe, triangles } ; hauteur(x, z) donne le sol réel.
 */
export function construireClotures(d, M, hauteur) {
  const routes = d.r.filter((r) => r.p.length >= 6).map(polyligne);
  const quartier = routes.map((pl, i) => [pl, i]).filter(([pl]) => RUES.has(pl.k) && pl.long > 6);
  if (!quartier.length || !d.b.length) return null;
  const polys = d.b.map((b) => b.p);
  const boites = polys.map((p) => {
    let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity;
    for (let i = 0; i < p.length; i += 2) { a = Math.min(a, p[i]); b = Math.max(b, p[i]); c = Math.min(c, p[i + 1]); e = Math.max(e, p[i + 1]); }
    return [a - 0.3, b + 0.3, c - 0.3, e + 0.3];
  });
  const libre = (x, z) => {
    for (let k = 0; k < polys.length; k++) {
      const [a, b, c, e] = boites[k];
      if (x > a && x < b && z > c && z < e && dansPolygone(x, z, polys[k])) return false;   // dans un bâtiment
    }
    for (const pl of routes) { const p = projeter(pl, x, z); if (p.d < pl.w + 1.2) return false; }
    return true;
  };
  // 1. Intervalles de mur par (rue, côté), et portails.
  const intervalles = new Map(), portails = [];
  d.b.forEach((b) => {
    const pts = [];
    for (let i = 0; i < b.p.length; i += 2) pts.push([b.p[i], b.p[i + 1]]);
    const aire = Math.abs(airePolygone(pts));
    const type = typeBatiment(b, aire);
    if (!["maison", "villa", "etage"].includes(type)) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    let meilleur = null;
    for (const [pl, i] of quartier) {
      const p = projeter(pl, cx, cz);
      // Recul de la FAÇADE (sommet le plus proche de la rue), pas du centre de la maison.
      const facade = Math.min(...pts.map(([x, z]) => projeter(pl, x, z).d)) - pl.w;
      if (facade > RETRAIT + 1.2 && facade < 18 && (!meilleur || p.d < meilleur.p.d)) meilleur = { pl, i, p };
    }
    if (!meilleur) return;
    // Étendue de la maison le long de la rue.
    let s0 = Infinity, s1 = -Infinity;
    for (const [x, z] of pts) { const q = projeter(meilleur.pl, x, z); s0 = Math.min(s0, q.s); s1 = Math.max(s1, q.s); }
    s0 = Math.max(0.5, s0 - 2.5); s1 = Math.min(meilleur.pl.long - 0.5, s1 + 2.5);
    if (s1 - s0 < 4) return;
    const cle = `${meilleur.i}_${meilleur.p.cote}`;
    if (!intervalles.has(cle)) intervalles.set(cle, { pl: meilleur.pl, cote: meilleur.p.cote, liste: [] });
    intervalles.get(cle).liste.push([s0, s1]);
    // Un portail par parcelle assez large (les petites maisons voisines partagent souvent l'accès).
    const graine = Math.round(Math.abs(cx * 13 + cz * 7));
    if (s1 - s0 >= 9 || graine % 10 < 5) {
      const sg = Math.min(Math.max(meilleur.p.s, s0 + 2), s1 - 2);
      portails.push({ cle, s: sg, graine });
    }
  });
  if (!intervalles.size) return null;
  // 2. Géométrie : murs (parpaing brut ou crépi peint), chaperon, pilastres, portails.
  const lots = { parpaing: new Lot(), crepi: new Lot(), beton: new Lot(), metal: new Lot() };
  const tri = [];
  const H = [0, 1, 0];
  for (const [cle, { pl, cote, liste }] of intervalles) {
    // Fusion des intervalles (les trous de moins de 4 m sont comblés).
    liste.sort((a, b) => a[0] - b[0]);
    const fus = [];
    for (const [a, b] of liste) {
      if (fus.length && a <= fus[fus.length - 1][1] + 4) fus[fus.length - 1][1] = Math.max(fus[fus.length - 1][1], b);
      else fus.push([a, b]);
    }
    const ici = portails.filter((p) => p.cle === cle);
    const off = cote * (pl.w + RETRAIT);
    for (const [a, b] of fus) {
      const rnd = aleatoire(Math.round(a * 31 + b * 17) + cle.length);
      const brut = rnd() < 0.45;
      const L = lots[brut ? "parpaing" : "crepi"];
      const c = brut ? [0.92, 0.9, 0.86] : new THREE.Color(PEINTURES[Math.floor(rnd() * PEINTURES.length)]).toArray();
      const cBas = c.map((v, i) => v * [0.75, 0.62, 0.55][i]);
      // Pas de 1 m ; on saute les portails et les points non libres (bâtiment, autre rue).
      let tronçon = [];
      const finir = () => {
        if (tronçon.length >= 2) murEntre(L, lots.beton, tronçon, c, cBas, tri);
        tronçon = [];
      };
      for (let s = a; s <= b + 1e-6; s += 1) {
        const p = pointA(pl, Math.min(s, b));
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        const dansPortail = ici.some((g) => Math.abs(g.s - s) < 1.6);
        if (dansPortail || !libre(x, z)) { finir(); continue; }
        tronçon.push({ x, z, y: hauteur(x, z), nx: p.nx * cote, nz: p.nz * cote, u: s });
      }
      finir();
    }
    // Portails métalliques (2 battants) entre deux piliers en béton.
    for (const g of ici) {
      const p = pointA(pl, g.s);
      const x = p.x + p.nx * off, z = p.z + p.nz * off;
      if (!libre(x, z)) continue;
      const y = hauteur(x, z);
      const ux = p.dx, uz = p.dz;
      const rndP = aleatoire(g.graine);
      const teinte = [[0.55, 0.12, 0.1], [0.12, 0.25, 0.5], [0.15, 0.35, 0.18], [0.2, 0.2, 0.2], [0.6, 0.5, 0.15]][Math.floor(rndP() * 5)];
      boite(lots.metal, x, y, z, ux, uz, 2.9, 2.05, 0.06, 0.02, teinte, tri);                // battants
      for (const s of [-1, 1]) boite(lots.beton, x + ux * s * 1.65, y, z + uz * s * 1.65, ux, uz, 0.35, HAUT + 0.25, 0.35, 0, [0.85, 0.84, 0.8], tri);
    }
  }
  const groupe = new THREE.Group();
  for (const [nom, l] of Object.entries(lots)) {
    const g = l.geometrie();
    if (!g) continue;
    const m = new THREE.Mesh(g, M[nom]);
    m.castShadow = true; m.receiveShadow = true;
    groupe.add(m);
  }
  return { groupe, triangles: new Float32Array(tri) };
}

/** Mur le long d'une suite de points : faces côté rue et côté parcelle, chaperon en béton. */
function murEntre(L, Lb, pts, c, cBas, tri) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const nx = a.nx, nz = a.nz;           // normale vers la rue
    const e = EP / 2;
    const A = (y, k) => [a.x - nx * e * k, y, a.z - nz * e * k], B = (y, k) => [b.x - nx * e * k, y, b.z - nz * e * k];
    const ya = a.y - 0.4, yb = b.y - 0.4, ha = a.y + HAUT, hb = b.y + HAUT;
    // n = direction rue -> mur. k = -1 : face côté parcelle (normale +n) ; k = 1 : face côté rue (normale -n).
    L.tri(A(ya, -1), B(yb, -1), B(hb, -1), [nx, 0, nz], [a.u, 0], [b.u, 0], [b.u, HAUT], [cBas, cBas, c]);
    L.tri(A(ya, -1), B(hb, -1), A(ha, -1), [nx, 0, nz], [a.u, 0], [b.u, HAUT], [a.u, HAUT], [cBas, c, c]);
    L.tri(A(ya, 1), B(hb, 1), B(yb, 1), [-nx, 0, -nz], [a.u, 0], [b.u, HAUT], [b.u, 0], [cBas, c, cBas]);
    L.tri(A(ya, 1), A(ha, 1), B(hb, 1), [-nx, 0, -nz], [a.u, 0], [a.u, HAUT], [b.u, HAUT], [cBas, c, c]);
    // chaperon (dessus) légèrement débordant
    const C = (p, k, h) => [p.x - nx * (e + 0.04) * k, h, p.z - nz * (e + 0.04) * k];
    Lb.quad(C(a, -1, ha + 0.06), C(b, -1, hb + 0.06), C(b, 1, hb + 0.06), C(a, 1, ha + 0.06), [0, 1, 0], [a.u, 0], [b.u, 0], [b.u, 0.3], [a.u, 0.3], [0.86, 0.85, 0.82]);
    for (const v of [A(ya, 0), B(yb, 0), B(hb, 0), A(ya, 0), B(hb, 0), A(ha, 0)]) tri.push(...v);
  }
}

/** Boîte orientée selon la rue (u = direction de la rue), posée au sol. */
function boite(L, x, y, z, ux, uz, lg, h, ep, recul, c, tri) {
  const nx = -uz, nz = ux;
  const P = (su, sn, yy) => [x + ux * su * lg / 2 + nx * (sn * ep / 2 + recul), y + yy, z + uz * su * lg / 2 + nz * (sn * ep / 2 + recul)];
  const faces = [
    [P(-1, 1, -0.3), P(1, 1, -0.3), P(1, 1, h), P(-1, 1, h), [nx, 0, nz]],
    [P(1, -1, -0.3), P(-1, -1, -0.3), P(-1, -1, h), P(1, -1, h), [-nx, 0, -nz]],
    [P(-1, -1, -0.3), P(-1, 1, -0.3), P(-1, 1, h), P(-1, -1, h), [-ux, 0, -uz]],
    [P(1, 1, -0.3), P(1, -1, -0.3), P(1, -1, h), P(1, 1, h), [ux, 0, uz]],
    [P(-1, 1, h), P(1, 1, h), P(1, -1, h), P(-1, -1, h), [0, 1, 0]],
  ];
  for (const [a, b, cc, d, n] of faces) {
    L.quad(a, b, cc, d, n, [0, 0], [lg, 0], [lg, h], [0, h], c);
    for (const v of [a, b, cc, a, cc, d]) tri.push(...v);
  }
}

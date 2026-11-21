// Projection locale (mètres) <-> latitude/longitude, et utilitaires géométriques.
// Repère du jeu : x = est, z = sud, y = haut. Identique à tools/jumeau/decouper_zone.py.

const M_LAT = 111320;

export class Projection {
  constructor(lat0, lon0) {
    this.lat0 = lat0;
    this.lon0 = lon0;
    this.mLon = M_LAT * Math.cos((lat0 * Math.PI) / 180);
  }
  versLocal(lon, lat) {
    return { x: (lon - this.lon0) * this.mLon, z: -(lat - this.lat0) * M_LAT };
  }
  versGeo(x, z) {
    return { lon: this.lon0 + x / this.mLon, lat: this.lat0 - z / M_LAT };
  }
}

/** Grille de relief (Float32, n×n, pas en m), centrée sur l'origine. */
export class Relief {
  /** Grille n (est-ouest) × nz (nord-sud) ; nz = n pour une zone carrée. */
  constructor(donnees, n, pas, nz = n) {
    this.d = donnees;
    this.n = n;
    this.nz = nz;
    this.pas = pas;
    this.demi = ((n - 1) * pas) / 2;
    this.demiZ = ((nz - 1) * pas) / 2;
  }
  hauteur(x, z) {
    const fx = (x + this.demi) / this.pas;
    const fz = (z + this.demiZ) / this.pas;
    const i0 = Math.min(this.n - 2, Math.max(0, Math.floor(fx)));
    const j0 = Math.min(this.nz - 2, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i0));
    const tz = Math.min(1, Math.max(0, fz - j0));
    const n = this.n;
    const a = this.d[j0 * n + i0] * (1 - tx) + this.d[j0 * n + i0 + 1] * tx;
    const b = this.d[(j0 + 1) * n + i0] * (1 - tx) + this.d[(j0 + 1) * n + i0 + 1] * tx;
    return a * (1 - tz) + b * tz;
  }
}

/** Polyligne [x,z,x,z...] : longueur totale et point à une distance donnée. */
export class Trajet {
  constructor(plat) {
    this.pts = [];
    for (let i = 0; i < plat.length; i += 2) this.pts.push([plat[i], plat[i + 1]]);
    this.cumul = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, az] = this.pts[i - 1];
      const [bx, bz] = this.pts[i];
      this.cumul.push(this.cumul[i - 1] + Math.hypot(bx - ax, bz - az));
    }
    this.longueur = this.cumul[this.cumul.length - 1];
  }
  /** Position et direction (vecteur unitaire) à la distance d (bornée). */
  point(d) {
    d = Math.max(0, Math.min(this.longueur, d));
    let i = 1;
    while (i < this.cumul.length - 1 && this.cumul[i] < d) i++;
    const [ax, az] = this.pts[i - 1];
    const [bx, bz] = this.pts[i];
    const seg = this.cumul[i] - this.cumul[i - 1] || 1e-6;
    const t = (d - this.cumul[i - 1]) / seg;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / seg, dz: (bz - az) / seg };
  }
}

/** Point dans polygone (plat [x,z,...]). */
export function dansPolygone(x, z, p) {
  let dedans = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Générateur pseudo-aléatoire déterministe (même graine = même ville). */
export function aleatoire(graine) {
  let s = graine >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

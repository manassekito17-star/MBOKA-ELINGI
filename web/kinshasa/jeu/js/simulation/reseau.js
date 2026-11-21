// Graphe routier orienté construit à partir des VRAIES routes de la zone
// (Overture / OpenStreetMap) : nœuds aux extrémités des tronçons, arcs orientés
// (deux par route à double sens, un par route à sens unique), voies, vitesses,
// carrefours, et calcul d'itinéraires (A*).

export const CLASSES = {
  motorway: { rang: 6, voies: 2, largeur: 14, vmax: 22.2 },
  trunk: { rang: 5, voies: 2, largeur: 14, vmax: 16.7 },       // 60 km/h
  primary: { rang: 4, voies: 2, largeur: 12, vmax: 13.9 },     // 50 km/h
  secondary: { rang: 3, voies: 1, largeur: 9, vmax: 11.1 },    // 40 km/h
  tertiary: { rang: 2, voies: 1, largeur: 7.5, vmax: 9.7 },    // 35 km/h
  unclassified: { rang: 1, voies: 1, largeur: 6, vmax: 8.3 },  // 30 km/h
  residential: { rang: 1, voies: 1, largeur: 5.5, vmax: 6.9 }, // 25 km/h
};
export const MAJEURES = new Set(["motorway", "trunk", "primary", "secondary"]);

const cle = (x, z) => `${Math.round(x)},${Math.round(z)}`;

export class Reseau {
  /** lignes : [{p:[x,z,...], k:classe, u?:1 (sens unique), n?:nom}] */
  constructor(lignes) {
    this.noeuds = [];
    this.arcs = [];
    const index = new Map();
    const noeud = (x, z) => {
      const k = cle(x, z);
      if (!index.has(k)) {
        index.set(k, this.noeuds.length);
        this.noeuds.push({ id: this.noeuds.length, x, z, sortants: [], entrants: [], voisins: new Set() });
      }
      return index.get(k);
    };
    for (const l of lignes) {
      const c = CLASSES[l.k];
      if (!c || l.p.length < 4) continue;
      const pts = [];
      for (let i = 0; i < l.p.length; i += 2) pts.push([l.p[i], l.p[i + 1]]);
      const a = noeud(...pts[0]);
      const b = noeud(...pts[pts.length - 1]);
      if (a === b) continue;
      const voies = l.u ? Math.max(c.voies, l.k === "secondary" ? 2 : c.voies) : c.voies;
      const largeur = l.u ? c.largeur * 0.6 : c.largeur;
      const avant = this._arc(a, b, pts, l, voies, largeur, !!l.u);
      if (!l.u) {
        const arriere = this._arc(b, a, [...pts].reverse(), l, voies, largeur, false);
        avant.jumeau = arriere.id;
        arriere.jumeau = avant.id;
      }
      this.noeuds[a].voisins.add(b);
      this.noeuds[b].voisins.add(a);
    }
    for (const n of this.noeuds) {
      n.degre = n.voisins.size;
      n.carrefour = n.degre >= 3;
      n.rangMax = Math.max(0, ...n.entrants.map((e) => this.arcs[e].rang));
    }
  }

  _arc(de, vers, pts, l, voies, largeur, sensUnique) {
    const cumul = [0];
    for (let i = 1; i < pts.length; i++) cumul.push(cumul[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const c = CLASSES[l.k];
    const arc = {
      id: this.arcs.length, de, vers, pts, cumul, long: cumul[cumul.length - 1], classe: l.k, nom: l.n || "",
      rang: c.rang, voies, largeur, vmax: c.vmax, sensUnique, jumeau: -1,
      traversees: [],   // passages piétons sur cet arc : [{s, id}]
    };
    this.arcs.push(arc);
    this.noeuds[de].sortants.push(arc.id);
    this.noeuds[vers].entrants.push(arc.id);
    return arc;
  }

  /** Position sur un arc à l'abscisse s, décalée latéralement (+ = à droite). */
  point(arcId, s, lat = 0) {
    const a = this.arcs[arcId];
    s = Math.max(0, Math.min(a.long, s));
    let i = 1;
    while (i < a.cumul.length - 1 && a.cumul[i] < s) i++;
    const [ax, az] = a.pts[i - 1];
    const [bx, bz] = a.pts[i];
    const seg = a.cumul[i] - a.cumul[i - 1] || 1e-6;
    const t = (s - a.cumul[i - 1]) / seg;
    const dx = (bx - ax) / seg, dz = (bz - az) / seg;
    // Normale droite dans le repère (x est, z sud) : (-dz, dx).
    return { x: ax + (bx - ax) * t - dz * lat, z: az + (bz - az) * t + dx * lat, dx, dz };
  }

  /** Décalage latéral (m, vers la droite) du centre de la voie `v` (0 = voie de droite). */
  decalageVoie(arcId, v) {
    const a = this.arcs[arcId];
    if (a.sensUnique) {
      const lv = a.largeur / a.voies;
      return (a.voies / 2 - v - 0.5) * lv;
    }
    const lv = a.largeur / 2 / a.voies;
    return a.largeur / 2 - (v + 0.5) * lv;
  }

  /** Direction à l'entrée / à la sortie d'un arc (radians, 0 = nord). */
  cap(arcId, fin) {
    const a = this.arcs[arcId];
    const p = fin ? this.point(arcId, a.long - 0.1) : this.point(arcId, 0.1);
    return Math.atan2(p.dx, -p.dz);
  }

  /** Arc le plus proche d'un point (et abscisse s). */
  arcProche(x, z, filtre = () => true) {
    let best = null;
    for (const a of this.arcs) {
      if (!filtre(a)) continue;
      let acc = 0;
      for (let i = 1; i < a.pts.length; i++) {
        const [ax, az] = a.pts[i - 1], [bx, bz] = a.pts[i];
        const lx = bx - ax, lz = bz - az, l2 = lx * lx + lz * lz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
        const d = Math.hypot(ax + lx * t - x, az + lz * t - z);
        const lg = Math.sqrt(l2);
        if (!best || d < best.d) best = { arc: a.id, s: acc + lg * t, d };
        acc += lg;
      }
    }
    return best;
  }

  noeudProche(x, z, filtre = () => true) {
    let best = -1, dmin = Infinity;
    for (const n of this.noeuds) {
      if (!filtre(n)) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < dmin) { dmin = d; best = n.id; }
    }
    return best;
  }

  /**
   * Itinéraire A* entre deux nœuds : liste d'arcs.
   * cout(arc) : coût de parcours (s) ; Infinity = arc interdit (accident...).
   */
  itineraire(de, vers, cout = (a) => a.long / a.vmax) {
    if (de === vers) return [];
    const cible = this.noeuds[vers];
    const vmaxG = 22.2;
    const h = (n) => Math.hypot(this.noeuds[n].x - cible.x, this.noeuds[n].z - cible.z) / vmaxG;
    const g = new Map([[de, 0]]);
    const precedent = new Map();
    const ouverts = new TasMin();
    ouverts.ajouter(de, h(de));
    const fermes = new Set();
    while (ouverts.taille) {
      const n = ouverts.extraire();
      if (n === vers) break;
      if (fermes.has(n)) continue;
      fermes.add(n);
      for (const aid of this.noeuds[n].sortants) {
        const a = this.arcs[aid];
        const c = cout(a);
        if (!Number.isFinite(c)) continue;
        const ng = g.get(n) + c;
        if (ng < (g.get(a.vers) ?? Infinity)) {
          g.set(a.vers, ng);
          precedent.set(a.vers, aid);
          ouverts.ajouter(a.vers, ng + h(a.vers));
        }
      }
    }
    if (!precedent.has(vers)) return null;
    const chemin = [];
    for (let n = vers; n !== de;) {
      const aid = precedent.get(n);
      chemin.push(aid);
      n = this.arcs[aid].de;
    }
    return chemin.reverse();
  }
}

/** File de priorité minimale (tas binaire). */
class TasMin {
  constructor() { this.t = []; }
  get taille() { return this.t.length; }
  ajouter(v, p) {
    const t = this.t;
    t.push([p, v]);
    let i = t.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (t[j][0] <= t[i][0]) break;
      [t[i], t[j]] = [t[j], t[i]];
      i = j;
    }
  }
  extraire() {
    const t = this.t;
    const haut = t[0][1];
    const der = t.pop();
    if (t.length) {
      t[0] = der;
      let i = 0;
      for (;;) {
        const g = 2 * i + 1, d = g + 1;
        let m = i;
        if (g < t.length && t[g][0] < t[m][0]) m = g;
        if (d < t.length && t[d][0] < t[m][0]) m = d;
        if (m === i) break;
        [t[i], t[m]] = [t[m], t[i]];
        i = m;
      }
    }
    return haut;
  }
}

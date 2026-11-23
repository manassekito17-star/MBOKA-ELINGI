// GPS : itinéraire calculé sur le VRAI réseau routier de la zone (A*, sens uniques
// réels respectés en voiture), recalculé si le joueur s'en écarte, distance restante
// et consigne de la prochaine manœuvre (avec le vrai nom de la rue).

const ANGLE_VIRAGE = 0.6;   // ~35° : en dessous, c'est « continuer tout droit »

export class GPS {
  constructor(reseau) {
    this.R = reseau;
    this.dest = null;        // { x, z, nom }
    this.points = [];        // polyligne [x, z] du trajet
    this.arcs = [];
    this.recalcul = 0;
    this.restant = 0;
    this.prochaine = null;   // { distance, sens, rue }
  }

  definir(x, z, nom = "Destination") {
    this.dest = { x, z, nom };
    this.points = [];
    this.recalcul = 0;
  }

  effacer() { this.dest = null; this.points = []; this.arcs = []; this.prochaine = null; }

  /** Calcule l'itinéraire depuis (px, pz). enVoiture : sens uniques respectés. */
  calculer(px, pz, enVoiture = true) {
    if (!this.dest) return false;
    const R = this.R;
    const de = R.noeudProche(px, pz, (n) => n.sortants.length > 0);
    const vers = R.noeudProche(this.dest.x, this.dest.z, (n) => n.entrants.length > 0);
    if (de < 0 || vers < 0) return false;
    const cout = enVoiture ? (a) => a.long / a.vmax : (a) => a.long;
    let chemin = R.itineraire(de, vers, cout);
    if (!chemin && enVoiture) chemin = this._sansSensUnique(de, vers);
    if (!chemin) return false;
    this.arcs = chemin;
    const pts = [[px, pz], [R.noeuds[de].x, R.noeuds[de].z]], arcDe = [-1, -1];
    chemin.forEach((aid, k) => {
      const a = R.arcs[aid];
      // (repli sans sens unique : l'arc peut être parcouru à l'envers)
      const p = k === 0 ? (a.de === de ? a.pts : [...a.pts].reverse()) : (Math.hypot(a.pts[0][0] - pts[pts.length - 1][0], a.pts[0][1] - pts[pts.length - 1][1]) < 1 ? a.pts : [...a.pts].reverse());
      for (const q of p.slice(1)) { pts.push(q); arcDe.push(k); }
    });
    pts.push([this.dest.x, this.dest.z]); arcDe.push(chemin.length);
    this.points = pts;
    this.arcDe = arcDe;
    return true;
  }

  /** Repli (sens unique qui isole la destination) : graphe parcouru dans les deux sens. */
  _sansSensUnique(de, vers) {
    const R = this.R;
    const ouverts = [[de, 0]], g = new Map([[de, 0]]), prec = new Map();
    while (ouverts.length) {
      ouverts.sort((a, b) => a[1] - b[1]);
      const [n] = ouverts.shift();
      if (n === vers) break;
      for (const aid of [...R.noeuds[n].sortants, ...R.noeuds[n].entrants]) {
        const a = R.arcs[aid], m = a.de === n ? a.vers : a.de;
        const ng = g.get(n) + a.long;
        if (ng < (g.get(m) ?? Infinity)) { g.set(m, ng); prec.set(m, aid); ouverts.push([m, ng]); }
      }
    }
    if (!prec.has(vers)) return null;
    const chemin = [];
    for (let n = vers; n !== de;) { const aid = prec.get(n); chemin.push(aid); const a = R.arcs[aid]; n = a.vers === n ? a.de : a.vers; }
    return chemin.reverse();
  }

  /**
   * Mise à jour : recalcul si écart > 35 m, distance restante, prochaine manœuvre.
   * Retourne "arrivee" quand le joueur est à moins de 18 m de la destination.
   */
  mettreAJour(dt, px, pz, enVoiture) {
    if (!this.dest) return null;
    if (Math.hypot(this.dest.x - px, this.dest.z - pz) < 18) { const d = this.dest; this.effacer(); return { arrivee: d }; }
    this.recalcul -= dt;
    let iProche = 0, dProche = Infinity;
    for (let i = 0; i < this.points.length - 1; i++) {
      const d = distSeg(px, pz, this.points[i], this.points[i + 1]);
      if (d < dProche) { dProche = d; iProche = i; }
    }
    if ((!this.points.length || dProche > 35) && this.recalcul <= 0) {
      this.recalcul = 2;
      this.calculer(px, pz, enVoiture);
      return null;
    }
    // Distance restante et prochaine manœuvre le long de la polyligne.
    let restant = Math.hypot(this.points[iProche + 1][0] - px, this.points[iProche + 1][1] - pz);
    for (let i = iProche + 1; i < this.points.length - 1; i++) restant += Math.hypot(this.points[i + 1][0] - this.points[i][0], this.points[i + 1][1] - this.points[i][1]);
    this.restant = restant;
    this.prochaine = this._manoeuvre(px, pz, iProche);
    return null;
  }

  /** Prochaine manœuvre : premier changement de direction > 35° après la position du joueur. */
  _manoeuvre(px, pz, iProche) {
    const P = this.points;
    let cumul = Math.hypot(P[iProche + 1][0] - px, P[iProche + 1][1] - pz);
    for (let i = iProche + 1; i < P.length - 1; i++) {
      if (i >= 1 && this.arcDe[i + 1] !== this.arcDe[i] && this.arcDe[i + 1] < this.arcs.length && this.arcDe[i] >= 0) {
        const avant = this.R.arcs[this.arcs[this.arcDe[i]]], apres = this.R.arcs[this.arcs[this.arcDe[i + 1]]];
        let d = cap(P[i], P[i + 1]) - cap(P[i - 1], P[i]);
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > ANGLE_VIRAGE && (apres.nom !== avant.nom || Math.abs(d) > 1.2)) {
          return { distance: cumul, sens: d > 0 ? "gauche" : "droite", rue: apres.nom || "rue sans nom" };
        }
      }
      cumul += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
    }
    return { distance: this.restant, sens: "arrivee", rue: this.dest?.nom || "" };
  }
}

const cap = (a, b) => Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));   // repère du jeu (x est, z sud)

function distSeg(x, z, a, b) {
  const lx = b[0] - a[0], lz = b[1] - a[1], l2 = lx * lx + lz * lz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * lx + (z - a[1]) * lz) / l2));
  return Math.hypot(a[0] + lx * t - x, a[1] + lz * t - z);
}

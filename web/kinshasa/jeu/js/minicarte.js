// Mini-carte et grande carte, dessinées à partir des VRAIES données de la zone :
// routes (réseau Overture/OSM, avec leurs noms), bâtiments et eau des tuiles
// chargées, lieux (index lieux.json : stations, hôpitaux, pharmacies, banques…),
// arrêts de bus (réels et simulés), véhicules du joueur, itinéraire GPS, mission.

export const CATEGORIES = {
  station:   { nom: "Stations-service", couleur: "#ffb300", glyphe: "⛽", test: (k) => /gas_station|fuel/.test(k) },
  hopital:   { nom: "Hôpitaux et cliniques", couleur: "#e53935", glyphe: "✚", test: (k) => /hospital|clinic|medical/.test(k) },
  pharmacie: { nom: "Pharmacies", couleur: "#43a047", glyphe: "℞", test: (k) => /pharmac|drug/.test(k) },
  banque:    { nom: "Banques et distributeurs", couleur: "#26a69a", glyphe: "$", test: (k) => /bank|atm|credit_union/.test(k) },
  police:    { nom: "Police", couleur: "#1e88e5", glyphe: "★", test: (k) => /police/.test(k) },
  manger:    { nom: "Restaurants et bars", couleur: "#fb8c00", glyphe: "🍴", test: (k) => /restaurant|bar|cafe|food|eatery|lounge/.test(k) },
  commerce:  { nom: "Marchés et commerces", couleur: "#ab47bc", glyphe: "🛒", test: (k) => /market|store|shop|supermarket|retail/.test(k) },
  hotel:     { nom: "Hôtels", couleur: "#8d6e63", glyphe: "H", test: (k) => /hotel|lodging/.test(k) },
};
export const categorie = (k) => Object.keys(CATEGORIES).find((c) => CATEGORIES[c].test(k || "")) || null;

const ROUTES = {
  motorway: ["#f6c95b", 9], trunk: ["#f6c95b", 8], primary: ["#ffe08a", 7], secondary: ["#fff3c4", 6], tertiary: ["#ffffff", 5],
  unclassified: ["#e9e6df", 4], residential: ["#e9e6df", 3.6], living_street: ["#e9e6df", 3],
};

export class Carte {
  /** monde : Monde (tuiles, réseau), sim : Circulation, lieux : index de la zone. */
  constructor(monde, sim, lieux, eau = []) {
    this.monde = monde;
    this.eau = eau;                     // eau de toute la zone (index eau.json)
    this.sim = sim;
    this.lieux = lieux.map(([x, z, n, k, f]) => ({ x, z, n, k, cat: categorie(k), f }));
    this.filtres = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, true]));
    this.filtres.bus = true;
    // Boîtes englobantes des routes (pour ne dessiner que ce qui est visible).
    this.routes = monde.reseau.map((r) => {
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (let i = 0; i < r.p.length; i += 2) { a = Math.min(a, r.p[i]); b = Math.max(b, r.p[i]); c = Math.min(c, r.p[i + 1]); d = Math.max(d, r.p[i + 1]); }
      return { r, a, b, c, d };
    });
  }

  /** Nom de la rue la plus proche (réel) et sa distance. */
  rueProche(x, z) {
    let best = null, dmin = 40;
    for (const { r, a, b, c, d } of this.routes) {
      if (!r.n || x < a - 40 || x > b + 40 || z < c - 40 || z > d + 40) continue;
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], lx = r.p[i + 2] - ax, lz = r.p[i + 3] - az, l2 = lx * lx + lz * lz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / l2));
        const dd = Math.hypot(ax + lx * t - x, az + lz * t - z);
        if (dd < dmin) { dmin = dd; best = r.n; }
      }
    }
    return best;
  }

  /**
   * Dessine la carte. vue = { cx, cz (centre monde), angle (rotation, rad), echelle (px/m),
   *   joueur: {x, z, cap}, gps, mission, flotte, destination, nordEnHaut }.
   */
  dessiner(ctx, l, h, vue) {
    const { cx, cz, angle, echelle } = vue;
    const rayon = Math.hypot(l, h) / 2 / echelle + 20;
    ctx.save();
    ctx.fillStyle = "#cbbfa8";                 // sol (terre) — teinte proche du rendu 3D
    ctx.fillRect(0, 0, l, h);
    ctx.translate(l / 2, h / 2);
    ctx.rotate(angle);
    ctx.scale(echelle, echelle);
    ctx.translate(-cx, -cz);
    const visible = (x0, x1, z0, z1) => x1 > cx - rayon && x0 < cx + rayon && z1 > cz - rayon && z0 < cz + rayon;
    // Eau, sol et bâtiments des tuiles chargées.
    ctx.fillStyle = "#6fa8c7";
    for (const w of this.eau) this._poly(ctx, w, visible);
    for (const t of this.monde.tuiles.values()) {
      const d = t.d;
      ctx.fillStyle = "#6fa8c7";
      if (!this.eau.length) for (const w of d.w) this._poly(ctx, w.p, visible);
      ctx.fillStyle = "#9bc48a";
      for (const s of d.s) if (/park|recreation|golf|grass|garden|cemetery/.test(s.k)) this._poly(ctx, s.p, visible);
      if (echelle > 0.35) {
        ctx.fillStyle = "#a99c86";
        for (const b of d.b) this._poly(ctx, b.p, visible);
      }
    }
    // Routes (plus larges d'abord), largeur minimale lisible à toutes les échelles.
    const ordre = ["residential", "unclassified", "living_street", "tertiary", "secondary", "primary", "trunk", "motorway"];
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const passe of [0, 1]) {
      for (const cls of ordre) {
        const [couleur, larg] = ROUTES[cls];
        ctx.strokeStyle = passe === 0 ? "#7d7266" : couleur;
        ctx.lineWidth = Math.max((larg + (passe === 0 ? 1.6 : 0)) / Math.max(echelle, 0.25), (passe === 0 ? 2.6 : 1.6) / echelle) * (echelle < 0.3 ? 0.6 : 1);
        ctx.beginPath();
        for (const { r, a, b, c, d } of this.routes) {
          if (r.k !== cls || !visible(a, b, c, d)) continue;
          ctx.moveTo(r.p[0], r.p[1]);
          for (let i = 2; i < r.p.length; i += 2) ctx.lineTo(r.p[i], r.p[i + 1]);
        }
        ctx.stroke();
      }
    }
    // Itinéraire GPS.
    if (vue.gps?.points?.length > 1) {
      ctx.strokeStyle = "#b84dff";
      ctx.lineWidth = 5 / echelle;
      ctx.beginPath();
      ctx.moveTo(vue.gps.points[0][0], vue.gps.points[0][1]);
      for (const p of vue.gps.points) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    ctx.restore();
    // Icônes (non tournées) : lieux, arrêts, véhicules, destination, joueur.
    const P = (x, z) => {
      const dx = (x - cx) * echelle, dz = (z - cz) * echelle;
      const c = Math.cos(angle), s = Math.sin(angle);
      return [l / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c];
    };
    const dans = ([x, y], m = 6) => x > m && y > m && x < l - m && y < h - m;
    const taille = vue.grande ? 16 : 13;
    ctx.font = `bold ${taille - 3}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (echelle > (vue.grande ? 0.12 : 0.2)) {
      for (const li of this.lieux) {
        if (!li.cat || !this.filtres[li.cat]) continue;
        const q = P(li.x, li.z);
        if (!dans(q)) continue;
        this._icone(ctx, q, CATEGORIES[li.cat].couleur, CATEGORIES[li.cat].glyphe, taille);
      }
    }
    if (this.filtres.bus && echelle > 0.25) {
      for (const a of this.sim.arrets.values()) {
        const q = P(a.x, a.z);
        if (dans(q)) this._icone(ctx, q, a.reel ? "#1565c0" : "#607d8b", "B", taille - 3);
      }
    }
    // Bâtiments remarquables (modèles individuels) : emprise dorée, étoile, nom sur la grande carte.
    for (const b of this.remarquables || []) {
      for (const e of b.emprises) {
        ctx.beginPath();
        for (let i = 0; i < e.length; i += 2) { const q = P(e[i], e[i + 1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.closePath();
        ctx.strokeStyle = "rgba(242,178,51,0.9)"; ctx.lineWidth = vue.grande ? 2 : 1.5; ctx.stroke();
      }
      const q = P(b.x, b.z);
      if (!dans(q)) continue;
      this._icone(ctx, q, "#f2b233", "★", taille + 2);
      if (vue.grande) {
        ctx.font = `bold ${taille - 2}px system-ui, sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.fillStyle = "#ffe08a";
        ctx.strokeText(b.nom_courant, q[0], q[1] + taille + 4); ctx.fillText(b.nom_courant, q[0], q[1] + taille + 4);
        ctx.font = `bold ${taille - 3}px system-ui, sans-serif`;
      }
    }
    for (const v of vue.flotte || []) {
      const p = v.position(), q = P(p.x, p.z);
      if (dans(q)) this._icone(ctx, q, "#2e7d32", "🚗", taille);
    }
    const bordure = (x, z, couleur, glyphe) => {
      let q = P(x, z);
      if (!dans(q, 10)) {          // hors cadre : flèche sur le bord (comme les repères de mission)
        const ax = q[0] - l / 2, ay = q[1] - h / 2, k = Math.min((l / 2 - 12) / Math.abs(ax || 1e-6), (h / 2 - 12) / Math.abs(ay || 1e-6));
        q = [l / 2 + ax * k, h / 2 + ay * k];
      }
      this._icone(ctx, q, couleur, glyphe, taille + 3);
    };
    if (vue.destination) bordure(vue.destination.x, vue.destination.z, "#b84dff", "⚑");
    if (vue.mission) bordure(vue.mission.x, vue.mission.z, "#f2b233", "!");
    // Joueur : flèche orientée.
    const j = vue.joueur, q = P(j.x, j.z);
    ctx.save();
    ctx.translate(q[0], q[1]);
    ctx.rotate(-(j.cap) + angle);
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // Nord (repère : le nord du monde est la direction z négative).
    if (!vue.nordEnHaut) {
      const r = Math.min(l, h) / 2 - 11, sn = Math.sin(angle), cs = Math.cos(angle);
      const nx = l / 2 + sn * r, ny = h / 2 - cs * r;
      ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.beginPath(); ctx.arc(nx, ny, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 10px system-ui, sans-serif"; ctx.fillText("N", nx, ny + 0.5);
    }
  }

  _poly(ctx, p, visible) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < p.length; i += 2) { if (p[i] < a) a = p[i]; if (p[i] > b) b = p[i]; if (p[i + 1] < c) c = p[i + 1]; if (p[i + 1] > d) d = p[i + 1]; }
    if (!visible(a, b, c, d)) return;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
  }

  _icone(ctx, [x, y], couleur, glyphe, t) {
    ctx.fillStyle = couleur;
    ctx.beginPath(); ctx.arc(x, y, t / 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(glyphe, x, y + 0.5);
  }
}

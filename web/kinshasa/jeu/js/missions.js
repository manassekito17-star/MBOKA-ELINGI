// Missions (logique pure, testable sans navigateur). Toutes les destinations sont
// des LIEUX RÉELS de la zone (Overture / OpenStreetMap). Récompenses, délais et
// clients sont des éléments de jeu (fictifs).
//
// Types :
//  - course    : rejoindre un lieu avant la fin du temps imparti (à pied ou en véhicule) ;
//  - taxi      : taxi, minibus ou moto — prendre un client devant un lieu, le déposer ailleurs ;
//  - livraison : camion ou camionnette — livrer un marché, un restaurant ou un hôtel ;
//  - urgence   : ambulance — prendre un malade puis rejoindre l'hôpital réel le plus proche.
import { aleatoire } from "./geo.js";

const NOMS_COURSE = ["Rendez-vous", "Course urgente", "Commission"];
const CLIENTS = ["Maman Pauline", "Papa Jean-Pierre", "Christelle", "Patrick", "Grâce", "Ya Mado", "Junior", "Nadège", "Tonton Willy", "Divine"];

export class Missions {
  /** lieux : [[x, z, nom, catégorie, confiance], ...] */
  constructor(lieux, graine = 1) {
    this.lieux = lieux.filter((l) => l[2] && l[2].length > 2 && l[2].length < 60);
    this.rnd = aleatoire(graine);
    this.active = null;
    this.stats = { reussies: 0, echouees: 0, gains: 0 };
    this.offres = [];
  }

  _lieu(px, pz, dmin, dmax, filtre = () => true) {
    const c = this.lieux.filter((l) => { const d = Math.hypot(l[0] - px, l[1] - pz); return d > dmin && d < dmax && filtre(l); });
    return c.length ? c[Math.floor(this.rnd() * c.length)] : null;
  }

  /** Propositions de missions selon la position et le véhicule du joueur. */
  proposer(px, pz, typeVehicule = null) {
    const offres = [];
    const course = this._lieu(px, pz, 350, 1600);
    if (course) {
      const d = Math.hypot(course[0] - px, course[1] - pz);
      offres.push(this._creer("course", `${NOMS_COURSE[Math.floor(this.rnd() * 3)]} : ${course[2]}`, [{ l: course, cond: "atteindre", texte: `Rejoignez « ${course[2]} »` }],
        Math.round(1000 + d * 2.5), Math.round(d / 2.2 + 90), null));
    }
    const A = this._lieu(px, pz, 150, 900), B = A && this._lieu(A[0], A[1], 500, 2200);
    if (A && B) {
      const client = CLIENTS[Math.floor(this.rnd() * CLIENTS.length)];
      offres.push(this._creer("taxi", `Client taxi : ${client}`, [
        { l: A, cond: "arret", texte: `Allez chercher ${client} devant « ${A[2]} » (arrêtez-vous près du client)`, client },
        { l: B, cond: "arret", texte: `Déposez ${client} à « ${B[2]} »`, client },
      ], Math.round(2000 + Math.hypot(B[0] - A[0], B[1] - A[1]) * 3), Math.round((Math.hypot(A[0] - px, A[1] - pz) + Math.hypot(B[0] - A[0], B[1] - A[1])) / 5 + 120), ["taxi", "minibus", "moto"]));
    }
    const liv = this._lieu(px, pz, 500, 2500, (l) => /market|restaurant|hotel|supermarket|store|food/.test(l[3]));
    if (liv) {
      offres.push(this._creer("livraison", `Livraison : ${liv[2]}`, [{ l: liv, cond: "arret", texte: `Livrez la marchandise à « ${liv[2]} »` }],
        Math.round(3000 + Math.hypot(liv[0] - px, liv[1] - pz) * 2.5), Math.round(Math.hypot(liv[0] - px, liv[1] - pz) / 4 + 120), ["camion", "livraison"]));
    }
    const malade = this._lieu(px, pz, 200, 1200);
    if (malade) {
      const hop = this.lieux.filter((l) => /hospital|clinic/.test(l[3])).sort((a, b) => Math.hypot(a[0] - malade[0], a[1] - malade[1]) - Math.hypot(b[0] - malade[0], b[1] - malade[1]))[0];
      if (hop) {
        offres.push(this._creer("urgence", `Urgence médicale : ${malade[2]}`, [
          { l: malade, cond: "arret", texte: `Allez chercher le malade devant « ${malade[2]} »`, client: "Malade" },
          { l: hop, cond: "arret", texte: `Conduisez le malade à l'hôpital « ${hop[2]} »`, client: "Malade" },
        ], 6000, Math.round((Math.hypot(malade[0] - px, malade[1] - pz) + Math.hypot(hop[0] - malade[0], hop[1] - malade[1])) / 6 + 120), ["ambulance"]));
      }
    }
    this.offres = offres;
    return this.offres;
  }

  _creer(type, titre, etapes, recompense, delai, vehicules) {
    return { id: `${type}_${Math.floor(this.rnd() * 1e9)}`, type, titre, etapes, recompense, delai, vehicules, i: 0, restant: delai };
  }

  /** La mission peut-elle démarrer maintenant ? (véhicule requis) */
  possible(offre, typeVehicule) {
    if (!offre.vehicules) return { ok: true };
    if (offre.vehicules.includes(typeVehicule)) return { ok: true };
    const noms = { taxi: "un taxi", minibus: "un minibus", moto: "une moto", camion: "un camion", livraison: "une camionnette", ambulance: "une ambulance" };
    return { ok: false, raison: `Il faut conduire ${offre.vehicules.map((v) => noms[v]).join(" ou ")}.` };
  }

  demarrer(offre) { this.active = { ...offre, i: 0, restant: offre.delai, horsVehicule: 0 }; return this.etapeCourante(); }
  abandonner() { if (this.active) this.stats.echouees++; this.active = null; }
  etapeCourante() { return this.active ? this.active.etapes[this.active.i] : null; }

  /**
   * ctx : { x, z, vitesse (m/s), typeVehicule (null à pied) }.
   * Retourne un évènement : { etape }, { reussie, recompense }, { echec, raison } ou null.
   */
  mettreAJour(dt, ctx) {
    const m = this.active;
    if (!m) return null;
    m.restant -= dt;
    if (m.restant <= 0) { this.active = null; this.stats.echouees++; return { echec: true, raison: "Temps écoulé" }; }
    if (m.vehicules) {
      m.horsVehicule = m.vehicules.includes(ctx.typeVehicule) ? 0 : m.horsVehicule + dt;
      if (m.horsVehicule > 25) { this.active = null; this.stats.echouees++; return { echec: true, raison: "Vous avez quitté le véhicule" }; }
    }
    const e = m.etapes[m.i];
    const d = Math.hypot(e.l[0] - ctx.x, e.l[1] - ctx.z);
    const ok = e.cond === "atteindre" ? d < 18 : d < 14 && Math.abs(ctx.vitesse) < 1.5 && (!m.vehicules || m.vehicules.includes(ctx.typeVehicule));
    if (!ok) return null;
    m.i++;
    if (m.i >= m.etapes.length) {
      this.active = null;
      // Bonus si plus de la moitié du temps reste.
      const recompense = m.recompense + (m.restant > m.delai / 2 ? Math.round(m.recompense * 0.25) : 0);
      this.stats.reussies++; this.stats.gains += recompense;
      return { reussie: true, recompense, titre: m.titre };
    }
    return { etape: m.etapes[m.i], precedente: e };
  }
}

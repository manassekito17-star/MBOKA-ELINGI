// Sauvegarde locale (navigateur) : position, véhicule, véhicules stationnés,
// heure, météo, argent. Lecture défensive : une sauvegarde abîmée est ignorée.
const CLE = "kinshasa3d.sauvegarde.v1";
const CLE_ZONE = "kinshasa3d.zone.v1";
// Une sauvegarde par zone (la clé d'origine reste celle de Limete).
const cle = (zone) => (zone && zone !== "limete" ? `${CLE}.${zone}` : CLE);

/** Dernière zone jouée (ou null). */
export function derniereZone() {
  try { return localStorage.getItem(CLE_ZONE); } catch { return null; }
}

export function charger(zone = "limete") {
  try {
    const d = JSON.parse(localStorage.getItem(cle(zone)) || "null");
    if (!d || typeof d !== "object" || d.v !== 1) return null;
    const nombre = (x, def) => (Number.isFinite(x) ? x : def);
    return {
      v: 1,
      zone: typeof d.zone === "string" ? d.zone : "limete",
      niveau: [0, 1, 2].includes(d.niveau) ? d.niveau : 1,
      joueur: { x: nombre(d.joueur?.x, 0), y: nombre(d.joueur?.y, 0), z: nombre(d.joueur?.z, 0) },
      conduit: Number.isInteger(d.conduit) ? d.conduit : -1,
      vehicules: Array.isArray(d.vehicules) ? d.vehicules.filter((v) => v && typeof v.type === "string").slice(0, 40) : [],
      heure: nombre(d.heure, 10) % 24,
      meteo: [0, 1, 2].includes(d.meteo) ? d.meteo : 0,
      argent: Math.max(0, Math.min(1e9, nombre(d.argent, 20000))),
      banque: Math.max(0, Math.min(1e10, nombre(d.banque, 100000))),
      sante: Math.max(1, Math.min(100, nombre(d.sante, 100))),
      stats: { pied: nombre(d.stats?.pied, 0), vehicule: nombre(d.stats?.vehicule, 0), temps: nombre(d.stats?.temps, 0) },
      missions: { reussies: nombre(d.missions?.reussies, 0), echouees: nombre(d.missions?.echouees, 0), gains: nombre(d.missions?.gains, 0) },
      date: nombre(d.date, 0),
    };
  } catch {
    return null;
  }
}

export function enregistrer(etat) {
  try {
    localStorage.setItem(cle(etat.zone), JSON.stringify({ v: 1, ...etat, date: Date.now() }));
    localStorage.setItem(CLE_ZONE, etat.zone);
    return true;
  } catch {
    return false;
  }
}

export function effacer(zone = "limete") {
  try { localStorage.removeItem(cle(zone)); } catch { /* stockage indisponible */ }
}

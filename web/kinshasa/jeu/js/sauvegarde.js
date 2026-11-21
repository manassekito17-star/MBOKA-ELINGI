// Sauvegarde locale (navigateur) : position, véhicule, véhicules stationnés,
// heure, météo, argent. Lecture défensive : une sauvegarde abîmée est ignorée.
const CLE = "kinshasa3d.sauvegarde.v1";

export function charger() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE) || "null");
    if (!d || typeof d !== "object" || d.v !== 1) return null;
    const nombre = (x, def) => (Number.isFinite(x) ? x : def);
    return {
      v: 1,
      zone: typeof d.zone === "string" ? d.zone : "limete",
      joueur: { x: nombre(d.joueur?.x, 0), y: nombre(d.joueur?.y, 0), z: nombre(d.joueur?.z, 0) },
      conduit: Number.isInteger(d.conduit) ? d.conduit : -1,
      vehicules: Array.isArray(d.vehicules) ? d.vehicules.filter((v) => v && typeof v.type === "string").slice(0, 40) : [],
      heure: nombre(d.heure, 10) % 24,
      meteo: [0, 1, 2].includes(d.meteo) ? d.meteo : 0,
      argent: Math.max(0, Math.min(1e9, nombre(d.argent, 20000))),
    };
  } catch {
    return null;
  }
}

export function enregistrer(etat) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ v: 1, ...etat }));
    return true;
  } catch {
    return false;
  }
}

export function effacer() {
  try { localStorage.removeItem(CLE); } catch { /* stockage indisponible */ }
}

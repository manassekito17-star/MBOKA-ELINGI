// Panneaux d'interface : éditeur de personnage et lignes de transport.
import { COIFFURES, TEINTS, STYLES, APPARENCE_DEFAUT, MOTIFS } from "./personnages.js";

const CLE_PERSO = "kinshasa3d.personnage.v1";

export function chargerApparence() {
  try {
    const a = JSON.parse(localStorage.getItem(CLE_PERSO) || "null");
    if (a && typeof a === "object" && typeof a.haut === "string") return { ...APPARENCE_DEFAUT, ...a };
  } catch { /* stockage indisponible */ }
  return { ...APPARENCE_DEFAUT };
}

function enregistrerApparence(a) {
  try { localStorage.setItem(CLE_PERSO, JSON.stringify(a)); } catch { /* ignoré */ }
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Éditeur de personnage. appliquer(apparence) reconstruit le personnage du joueur. */
export function editeurPersonnage(racine, appliquer) {
  let ap = chargerApparence();
  const champ = (lbl, html) => `<label><span>${lbl}</span>${html}</label>`;
  const options = (obj, v) => Object.entries(obj).map(([k, o]) => `<option value="${k}" ${k === v ? "selected" : ""}>${esc(o.nom ?? k)}</option>`).join("");
  function rendre() {
    racine.innerHTML = `
      <h2>Mon personnage</h2>
      <div class="styles">${Object.entries(STYLES).map(([k, s]) => `<button data-style="${k}">${esc(s.nom)}</button>`).join("")}</div>
      <div class="grille">
        ${champ("Sexe", `<select data-k="femme"><option value="0" ${!ap.femme ? "selected" : ""}>Homme</option><option value="1" ${ap.femme ? "selected" : ""}>Femme</option></select>`)}
        ${champ("Teint", `<div class="teints">${TEINTS.map((t) => `<button data-teint="${t}" style="background:${t}" class="${t === ap.teint ? "choisi" : ""}" aria-label="teint"></button>`).join("")}</div>`)}
        ${champ("Coiffure", `<select data-k="coiffure">${options(COIFFURES, ap.coiffure)}</select>`)}
        ${champ("Barbe", `<input type="checkbox" data-k="barbe" ${ap.barbe ? "checked" : ""}>`)}
        ${champ("Haut", `<input type="color" data-k="haut" value="${ap.haut}">`)}
        ${champ("Motif", `<select data-k="motif">${Object.keys(MOTIFS).map((m) => `<option ${m === ap.motif ? "selected" : ""}>${m}</option>`).join("")}</select>`)}
        ${champ("Couleur du motif", `<input type="color" data-k="motifCouleur" value="${ap.motifCouleur}">`)}
        ${champ("Manches longues", `<input type="checkbox" data-k="manches" ${ap.manches ? "checked" : ""}>`)}
        ${champ("Col / veste", `<input type="checkbox" data-k="col" ${ap.col ? "checked" : ""}>`)}
        ${champ("Pantalon / pagne", `<input type="color" data-k="bas" value="${ap.bas}">`)}
        ${champ("Pagne en wax", `<input type="checkbox" data-k="pagne" ${ap.pagne ? "checked" : ""}>`)}
        ${champ("Chaussures", `<input type="color" data-k="chaussures" value="${ap.chaussures}">`)}
        ${["casquette", "lunettes", "sac", "chaine"].map((a) => champ({ casquette: "Casquette", lunettes: "Lunettes", sac: "Sac à dos", chaine: "Chaîne" }[a],
          `<input type="checkbox" data-acc="${a}" ${ap.accessoires?.[a] ? "checked" : ""}>`)).join("")}
      </div>
      <p class="note">Le modèle de base (Quaternius, CC0) n'a pas d'expressions faciales.</p>
      <div class="actions"><button data-fermer>Fermer</button></div>`;
  }
  rendre();
  const maj = () => { enregistrerApparence(ap); appliquer(ap); };
  racine.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.k) {
      const k = t.dataset.k;
      ap = { ...ap, [k]: t.type === "checkbox" ? t.checked : k === "femme" ? t.value === "1" : t.value };
      if (k === "femme") ap.coiffure = ap.femme ? "longue" : "rasee";
    }
    if (t.dataset.acc) ap = { ...ap, accessoires: { ...ap.accessoires, [t.dataset.acc]: t.checked } };
    maj();
    rendre();
  });
  racine.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.teint) { ap = { ...ap, teint: b.dataset.teint }; maj(); rendre(); }
    if (b.dataset.style) {
      const s = STYLES[b.dataset.style];
      ap = { ...APPARENCE_DEFAUT, femme: !!s.femme, teint: ap.teint, coiffure: s.coiffure || (s.femme ? "longue" : ap.coiffure),
        barbe: s.femme ? false : ap.barbe, ...s, accessoires: { ...APPARENCE_DEFAUT.accessoires, ...(s.accessoires || {}) } };
      delete ap.nom;
      maj(); rendre();
    }
    if ("fermer" in b.dataset) racine.hidden = true;
  });
  return { ouvrir() { racine.hidden = false; } };
}

/** Panneau des lignes de transport : arrêts, terminus, prochain passage (simulé). */
export function panneauTransports(racine, sim, nomZone = "Limete") {
  let choix = sim.lignes[0]?.id;
  function rendre() {
    const l = sim.lignes.find((x) => x.id === choix);
    const h = l ? sim.horaires(l.id) : [];
    const bus = l ? sim.vehicules.filter((v) => v.ligne === l.id) : [];
    racine.innerHTML = `
      <h2>Transports publics — ${esc(nomZone)}</h2>
      <div class="onglets">${sim.lignes.map((x) => `<button data-l="${x.id}" class="${x.id === choix ? "choisi" : ""}">${esc(x.ref || "")} ${x.type === "minibus" ? "Minibus" : "Bus"}</button>`).join("")}</div>
      ${l ? `
      <p><b>${esc(l.nom)}</b><br>${esc(l.depart || "—")} → ${esc(l.terminus || "—")} ·
        ${l.reel ? "<span class='reel'>tracé réel (OpenStreetMap)</span>" : "<span class='simule'>ligne simulée</span>"}<br>
        ${Math.round(l.longueur)} m dans la zone · ${bus.length} véhicule(s) en service · ${bus.reduce((s, v) => s + v.passagers.length, 0)} passager(s) à bord</p>
      <table><tr><th>Arrêt</th><th>En attente</th><th>Prochain passage</th></tr>
        ${h.map((a) => `<tr><td>${esc(a.nom)}</td><td>${a.attente}</td>
          <td>${Number.isFinite(a.prochain) ? (a.prochain < 60 ? "< 1 min" : `${Math.round(a.prochain / 60)} min`) : "—"}</td></tr>`).join("")}
      </table>` : "<p>Aucune ligne.</p>"}
      <p class="note">Horaires estimés en direct à partir de la position des véhicules simulés (pas d'horaires officiels).</p>
      <div class="actions"><button data-fermer>Fermer</button></div>`;
  }
  racine.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.l) { choix = b.dataset.l; rendre(); }
    if ("fermer" in b.dataset) racine.hidden = true;
  });
  let minuterie = null;
  return {
    ouvrir() { racine.hidden = false; rendre(); clearInterval(minuterie); minuterie = setInterval(() => { if (racine.hidden) clearInterval(minuterie); else rendre(); }, 2000); },
  };
}

/** Choix de la zone jouable : recharge le jeu sur la zone choisie (la partie en cours est sauvegardée). */
export function panneauZones(racine, zones, actuelle, avantDepart) {
  racine.innerHTML = `
    <h2>Zones jouables</h2>
    <p class="note">Seules ces portions de Kinshasa sont jouables pour l'instant. Chaque zone a sa propre sauvegarde.</p>
    <div class="zones">${Object.entries(zones).map(([id, z]) => `
      <button data-zone="${id}" class="${id === actuelle ? "choisi" : ""}"><b>${esc(z.nom)}</b><br><small>${esc(z.description)}</small></button>`).join("")}
    </div>
    <div class="actions"><button data-fermer>Fermer</button></div>`;
  racine.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if ("fermer" in b.dataset) racine.hidden = true;
    if (b.dataset.zone && b.dataset.zone !== actuelle) {
      avantDepart();
      location.href = `?zone=${encodeURIComponent(b.dataset.zone)}`;
    }
  });
  return { ouvrir() { racine.hidden = false; } };
}

// Interface de jeu (HUD) : mini-carte, santé, endurance, argent, heure, notifications,
// GPS, mission, menu d'interaction, tableau de bord du véhicule.
// Chaque indicateur lit une VRAIE valeur du jeu (rien n'est décoratif).

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const fc = (n) => `${Math.round(n).toLocaleString("fr-FR")} FC`;
const fleche = { gauche: "↰", droite: "↱", arrivee: "⚑" };
const distanceTexte = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${Math.max(10, Math.round(m / 10) * 10)} m`);

export class HUD {
  constructor({ carte, mobile, onAction, onZoom, onCarte, onMenu }) {
    this.carte = carte;
    this.mobile = mobile;
    this.echelle = 1.2;          // mini-carte : pixels par mètre
    this.zoomManuel = 0;
    this.canvas = $("minicarte");
    this.ctx2d = this.canvas.getContext("2d");
    this.actions = [];
    this.selection = 0;
    this.onAction = onAction;
    this._dimensionner();
    addEventListener("resize", () => this._dimensionner());
    $("radar").addEventListener("click", (e) => {
      const b = e.target.closest("[data-zoom]");
      if (!b) return;
      if (b.dataset.zoom === "carte") onCarte(); else onZoom(b.dataset.zoom === "+" ? 1 : -1);
    });
    $("btn-menu").addEventListener("click", () => onMenu());
    $("interactions").addEventListener("click", (e) => {
      const li = e.target.closest("[data-i]");
      if (li) this.onAction(this.actions[+li.dataset.i]);
    });
  }

  _dimensionner() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.max(10, Math.round(r.width * dpr));
    this.canvas.height = Math.max(10, Math.round(r.height * dpr));
    this.dpr = dpr;
  }

  zoom(sens) { this.zoomManuel = Math.max(-2, Math.min(2, this.zoomManuel + sens)); }

  /** Mini-carte (environ 10 fois par seconde). */
  dessinerCarte(vue, vitesse) {
    // Zoom automatique : la carte s'éloigne quand on roule vite (comme dans les jeux de conduite).
    const auto = 1.3 / (1 + Math.max(0, vitesse - 4) / 9);
    const ech = auto * Math.pow(1.6, this.zoomManuel);
    this.echelle += (ech - this.echelle) * 0.15;
    const { width: l, height: h } = this.canvas;
    this.carte.dessiner(this.ctx2d, l, h, { ...vue, echelle: this.echelle * this.dpr });
  }

  /** Barres de santé et d'endurance, argent, heure, rue. */
  etat({ sante, endurance, essouffle, argent, heure, meteo, rue, zone, trafic }) {
    $("barre-sante").style.width = `${sante}%`;
    $("barre-sante").parentElement.classList.toggle("critique", sante < 25);
    $("barre-endurance").style.width = `${endurance}%`;
    $("barre-endurance").parentElement.classList.toggle("essouffle", essouffle);
    $("argent").textContent = fc(argent);
    $("heure").textContent = `${heure} · ${meteo}`;
    $("rue").innerHTML = `<b>${esc(rue || "—")}</b> · ${esc(zone)}<br><small>${esc(trafic)}</small>`;
  }

  /** Notifications (fil en haut à gauche, disparaissent seules). */
  notifier(texte, { duree = 5, type = "" } = {}) {
    const fil = $("notifs");
    const n = document.createElement("div");
    n.className = "notif " + type;
    n.textContent = texte;
    fil.prepend(n);
    while (fil.children.length > 4) fil.lastChild.remove();
    setTimeout(() => n.classList.add("sortie"), duree * 1000);
    setTimeout(() => n.remove(), duree * 1000 + 450);
  }

  /** Bâtiment remarquable : son nom s'affiche discrètement à l'approche (fil des notifications). */
  lieu(b) {
    const fil = $("notifs");
    const n = document.createElement("div");
    n.className = "notif lieu";
    n.innerHTML = `<b>${esc(b.nom_courant.toUpperCase())}</b><span>${esc(b.categorie_libelle)}</span><small>${esc(b.commune)}, Kinshasa, RDC</small>`;
    fil.prepend(n);
    while (fil.children.length > 4) fil.lastChild.remove();
    setTimeout(() => n.classList.add("sortie"), 7000);
    setTimeout(() => n.remove(), 7450);
  }

  /** Bandeau GPS : prochaine manœuvre réelle et distance restante. */
  gps(g) {
    const el = $("gps-bandeau");
    if (!g?.dest || !g.prochaine) { el.hidden = true; return; }
    el.hidden = false;
    const p = g.prochaine;
    el.innerHTML = p.sens === "arrivee"
      ? `<span class="fl">⚑</span><span><b>${distanceTexte(p.distance)}</b> · ${esc(g.dest.nom)}</span>`
      : `<span class="fl">${fleche[p.sens]}</span><span><b>${distanceTexte(p.distance)}</b> · à ${p.sens}, ${esc(p.rue)}<br><small>${esc(g.dest.nom)} · ${distanceTexte(g.restant)}</small></span>`;
  }

  /** Mission active : objectif (sous-titre) et chronomètre. */
  mission(m, etape) {
    $("objectif").hidden = !m;
    $("mission-chrono").hidden = !m;
    if (!m) return;
    $("objectif").innerHTML = `<b>${esc(m.titre)}</b><br>${esc(etape?.texte || "")}`;
    const t = Math.max(0, Math.ceil(m.restant));
    $("mission-chrono").textContent = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} · ${fc(m.recompense)}`;
    $("mission-chrono").classList.toggle("urgent", t < 30);
  }

  /** Menu d'interaction contextuel : liste d'actions réellement disponibles. */
  interactions(actions, toucheInteragir) {
    const el = $("interactions");
    const cle = actions.map((a) => a.texte).join("|");
    if (cle !== this._cle) {
      this._cle = cle;
      this.actions = actions;
      this.selection = Math.min(this.selection, Math.max(0, actions.length - 1));
      el.hidden = !actions.length;
      el.querySelector("ul").innerHTML = actions.map((a, i) =>
        `<li data-i="${i}" class="${i === this.selection ? "choisi" : ""}"><kbd>${i === 0 ? esc(a.touche || toucheInteragir) : i + 1}</kbd><span>${esc(a.texte)}</span>${a.prix ? `<em>${fc(a.prix)}</em>` : ""}</li>`).join("");
    }
  }
  choisirSuivant(sens) {
    if (!this.actions.length) return;
    this.selection = (this.selection + sens + this.actions.length) % this.actions.length;
    [...$("interactions").querySelectorAll("li")].forEach((li, i) => li.classList.toggle("choisi", i === this.selection));
  }
  actionChoisie() { return this.actions[this.selection] || this.actions[0]; }

  /** Tableau de bord du véhicule (valeurs réelles du véhicule conduit). */
  vehicule(v, infos) {
    const el = $("tableau-bord");
    if (!v) { el.hidden = true; document.body.classList.remove("en-vehicule"); return; }
    el.hidden = false;
    document.body.classList.add("en-vehicule");
    $("tb-vitesse").textContent = Math.round(Math.abs(infos.vitesse) * 3.6);
    $("tb-rapport").textContent = infos.rapport ?? "—";
    $("tb-nom").textContent = infos.nom;
    $("tb-carburant").style.width = `${(infos.carburant ?? 0) * 100}%`;
    $("tb-etat").style.width = `${infos.etatMeca ?? 100}%`;
    $("tb-etat").parentElement.classList.toggle("critique", (infos.etatMeca ?? 100) < 30);
    $("tb-odo").textContent = infos.odometre == null ? "—" : `${(infos.odometre / 1000).toFixed(1).replace(".", ",")} km`;
    for (const [id, on] of Object.entries(infos.voyants || {})) $("v-" + id)?.classList.toggle("allume", !!on);
    $("tb-action").textContent = infos.action || "";
    $("tb-action").hidden = !infos.action;
    el.classList.toggle("passager", !!infos.passager);
  }
}

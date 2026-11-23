// Commandes : table d'ACTIONS configurable (clavier), manette (disposition standard,
// type Xbox / PlayStation) et commandes tactiles (joystick + boutons).
// Les touches sont des codes physiques : « KeyW » = Z sur un clavier AZERTY, W en QWERTY.

/** Actions du jeu : libellé, touches par défaut, bouton de manette (indice « standard »). */
export const ACTIONS = {
  avancer:        { nom: "Avancer / accélérer",          touches: ["KeyW", "ArrowUp"] },
  reculer:        { nom: "Reculer / freiner",            touches: ["KeyS", "ArrowDown"] },
  gauche:         { nom: "Aller / tourner à gauche",     touches: ["KeyA", "ArrowLeft"] },
  droite:         { nom: "Aller / tourner à droite",     touches: ["KeyD", "ArrowRight"] },
  sauter:         { nom: "Sauter · frein à main (véhicule)", touches: ["Space"], manette: 0 },          // A / Croix
  courir:         { nom: "Courir (maintenir)",           touches: ["ShiftLeft", "ShiftRight"], manette: 10 },   // L3
  lent:           { nom: "Marcher lentement",            touches: ["AltLeft"] },
  accroupir:      { nom: "S'accroupir",                  touches: ["ControlLeft", "KeyX"], manette: 11 },      // R3
  camera:         { nom: "Changer de caméra",            touches: ["KeyC", "KeyV"], manette: 8 },            // Vue / Select
  interagir:      { nom: "Interagir",                    touches: ["KeyE"], manette: 2 },                    // X / Carré
  vehicule:       { nom: "Entrer / sortir d'un véhicule", touches: ["KeyF"], manette: 3 },                   // Y / Triangle
  actionVehicule: { nom: "Action du véhicule (sirène, taxi, livraison)", touches: ["KeyR"], manette: 2 },
  klaxon:         { nom: "Klaxonner",                    touches: ["KeyH"], manette: 5 },                    // RB / R1
  phares:         { nom: "Phares",                       touches: ["KeyL"], manette: 4 },                    // LB / L1
  pause:          { nom: "Menu pause",                   touches: ["Escape"], manette: 9 },                  // Start / Options
  retour:         { nom: "Retour / annuler",             touches: ["Backspace"], manette: 1 },               // B / Rond
  carte:          { nom: "Grande carte",                 touches: ["KeyM"] },
  zoomPlus:       { nom: "Zoom avant (mini-carte)",      touches: ["Equal", "NumpadAdd"], manette: 12 },     // croix haut
  zoomMoins:      { nom: "Zoom arrière (mini-carte)",    touches: ["Minus", "NumpadSubtract"], manette: 13 }, // croix bas
  lignes:         { nom: "Lignes de bus",                touches: ["KeyB"] },
  personnage:     { nom: "Personnage",                   touches: ["KeyU"] },
  zone:           { nom: "Changer de zone",              touches: ["KeyJ"] },
  sauvegarder:    { nom: "Sauvegarder",                  touches: ["KeyP"] },
  meteo:          { nom: "Changer la météo",             touches: ["KeyT"] },
  heure:          { nom: "Avancer l'heure (+3 h)",       touches: ["KeyN"] },
  trafic:         { nom: "Densité de circulation",       touches: ["KeyG"] },
  accident:       { nom: "Provoquer un accident simulé", touches: ["KeyK"] },
};
const CLE = "kinshasa3d.commandes.v1";

/** Nom lisible d'une touche physique (AZERTY : KeyW → « Z »). */
export function nomTouche(code) {
  const azerty = { KeyW: "Z", KeyA: "Q", KeyQ: "A", KeyZ: "W", Semicolon: "M", KeyM: "," };
  const special = { Space: "Espace", ShiftLeft: "Maj", ShiftRight: "Maj droite", ControlLeft: "Ctrl", AltLeft: "Alt", Escape: "Échap",
    Backspace: "Retour arrière", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Equal: "=", Minus: "-",
    NumpadAdd: "+ (pavé)", NumpadSubtract: "- (pavé)", Enter: "Entrée", Tab: "Tab" };
  if (special[code]) return special[code];
  if (code.startsWith("Key")) return (azerty[code] ? azerty[code] + "/" : "") + code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
const BOUTONS_MANETTE = ["A / Croix", "B / Rond", "X / Carré", "Y / Triangle", "LB / L1", "RB / R1", "LT / L2", "RT / R2",
  "Vue / Select", "Start / Options", "L3", "R3", "Croix ↑", "Croix ↓", "Croix ←", "Croix →"];
export const nomBoutonManette = (i) => BOUTONS_MANETTE[i] ?? `Bouton ${i}`;

/**
 * Plein écran + verrouillage à l'horizontale (doit suivre un geste de l'utilisateur).
 * Android (Chrome, Samsung Internet) : plein écran et rotation verrouillée.
 * iPhone (Safari) : pas d'API de plein écran pour une page ; on renvoie false.
 */
export async function pleinEcranHorizontal() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch { /* refusé par le navigateur */ }
  try { await screen.orientation?.lock?.("landscape"); } catch { /* non pris en charge (iPhone, ordinateur) */ }
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export class Controles {
  constructor(element) {
    this.touches = new Set();
    this.appuis = new Set();       // touches appuyées pendant cette image (un seul déclenchement)
    this.actionsTactiles = new Set();      // actions déclenchées par un bouton tactile (cette image)
    this.actionsTactilesTenues = new Set(); // actions maintenues (pédales, course)
    this.lacet = 0;                // rotation caméra (souris / doigt / joystick droit)
    this.tangage = 0.25;
    this.joy = { x: 0, y: 0 };
    this.manette = { boutons: [], avant: [], gachetteD: 0, gachetteG: 0, connectee: false };
    this.element = element;
    this.capture = null;           // remappage en cours : fonction(code)
    this.carte = this.chargerCarte();
    addEventListener("keydown", (e) => {
      if (this.capture) { e.preventDefault(); const f = this.capture; this.capture = null; f(e.code); return; }
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (!this.touches.has(e.code)) this.appuis.add(e.code);
      this.touches.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown", "Tab", "Backspace"].includes(e.code) || e.code === "Escape") e.preventDefault();
    });
    addEventListener("keyup", (e) => this.touches.delete(e.code));
    addEventListener("blur", () => this.touches.clear());
    element.addEventListener("click", () => {
      if (!matchMedia("(pointer: coarse)").matches && !this.enPause?.()) element.requestPointerLock?.();
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== element) return;
      this.lacet -= e.movementX * 0.0025;
      this.tangage = Math.max(-0.35, Math.min(1.1, this.tangage + e.movementY * 0.002));
    });
    addEventListener("gamepadconnected", () => { this.manette.connectee = true; });
    this._tactile();
  }

  // --- Table des commandes (remappage enregistré dans le navigateur) -------------------
  chargerCarte() {
    const carte = Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, [...a.touches]]));
    try {
      const s = JSON.parse(localStorage.getItem(CLE) || "null");
      if (s && typeof s === "object") for (const [k, v] of Object.entries(s)) if (carte[k] && Array.isArray(v) && v.every((c) => typeof c === "string")) carte[k] = v.slice(0, 3);
    } catch { /* stockage indisponible */ }
    return carte;
  }
  enregistrerCarte() { try { localStorage.setItem(CLE, JSON.stringify(this.carte)); } catch { /* ignoré */ } }
  /** Associe une touche à une action (elle est retirée des autres actions, sauf conflits voulus). */
  assigner(action, code) {
    for (const [k, v] of Object.entries(this.carte)) if (k !== action) this.carte[k] = v.filter((c) => c !== code);
    this.carte[action] = [code, ...this.carte[action].filter((c) => c !== code)].slice(0, 2);
    this.enregistrerCarte();
  }
  reinitialiser() { this.carte = Object.fromEntries(Object.entries(ACTIONS).map(([k, a]) => [k, [...a.touches]])); this.enregistrerCarte(); }
  /** Attend la prochaine touche (remappage). */
  capturer(f) { this.capture = f; }

  /** Touche : codes physiques. */
  bas(...codes) { return codes.some((c) => this.touches.has(c)); }
  appui(...codes) { return codes.some((c) => this.appuis.has(c)); }

  /** Action maintenue (clavier, manette, tactile). */
  actif(action) {
    if (this.bas(...(this.carte[action] || []))) return true;
    if (this.actionsTactilesTenues.has(action)) return true;
    const b = ACTIONS[action]?.manette;
    return b !== undefined && !!this.manette.boutons[b];
  }
  /** Action déclenchée pendant cette image (front montant). */
  declenche(action) {
    if (this.appui(...(this.carte[action] || []))) return true;
    if (this.actionsTactiles.has(action)) return true;
    const b = ACTIONS[action]?.manette;
    return b !== undefined && !!this.manette.boutons[b] && !this.manette.avant[b];
  }
  finImage() { this.appuis.clear(); this.actionsTactiles.clear(); this.manette.avant = [...this.manette.boutons]; }

  /** Lecture de la manette (une fois par image). */
  lireManette() {
    const pad = navigator.getGamepads?.()?.find((p) => p && p.connected);
    const m = this.manette;
    if (!pad) { m.boutons = []; m.gachetteD = m.gachetteG = 0; m.axes = null; return; }
    m.connectee = true;
    m.boutons = pad.buttons.map((b) => b.pressed);
    m.gachetteD = pad.buttons[7]?.value || 0;
    m.gachetteG = pad.buttons[6]?.value || 0;
    m.axes = pad.axes;
    if (Math.abs(pad.axes[2]) > 0.15) this.lacet -= pad.axes[2] * 0.045;
    if (Math.abs(pad.axes[3]) > 0.15) this.tangage = Math.max(-0.35, Math.min(1.1, this.tangage + pad.axes[3] * 0.03));
  }

  /** Axes de déplacement : x (droite +), y (avant +), entre -1 et 1. */
  axes() {
    let x = 0, y = 0;
    if (this.actif("avancer")) y += 1;
    if (this.actif("reculer")) y -= 1;
    if (this.actif("gauche")) x -= 1;
    if (this.actif("droite")) x += 1;
    const a = this.manette.axes;
    if (a) {
      if (Math.abs(a[0]) > 0.15) x = a[0];
      if (Math.abs(a[1]) > 0.15) y = -a[1];
    }
    if (Math.hypot(this.joy.x, this.joy.y) > 0.1) { x = this.joy.x; y = this.joy.y; }
    return { x, y };
  }
  /** Pédales (véhicule) : gâchettes de manette et pédales tactiles. */
  pedales() {
    return {
      gaz: Math.max(this.manette.gachetteD, this.actionsTactilesTenues.has("gaz") ? 1 : 0),
      frein: Math.max(this.manette.gachetteG, this.actionsTactilesTenues.has("frein") ? 1 : 0),
    };
  }
  courir() { return this.actif("courir") || this.actionsTactilesTenues.has("courir"); }

  _tactile() {
    const zone = document.getElementById("tactile");
    if (!zone || !matchMedia("(pointer: coarse)").matches) return;
    zone.hidden = false;
    const base = zone.querySelector(".joy"), bouton = zone.querySelector(".joy i");
    let id = null, cx = 0, cy = 0;
    base.addEventListener("pointerdown", (e) => {
      if (this.edition) return;
      id = e.pointerId; const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      try { base.setPointerCapture(id); } catch { /* pointeur déjà relâché */ }
    });
    base.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const R = base.getBoundingClientRect().width * 0.42;
      const dx = e.clientX - cx, dy = e.clientY - cy, n = Math.min(R, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
      this.joy = { x: (dx * n) / R, y: (-dy * n) / R };
      bouton.style.transform = `translate(${dx * n}px, ${dy * n}px)`;
    });
    const fin = () => { id = null; this.joy = { x: 0, y: 0 }; bouton.style.transform = ""; };
    base.addEventListener("pointerup", fin);
    base.addEventListener("pointercancel", fin);
    // Glisser ailleurs = tourner la caméra.
    let dernier = null;
    this.element.addEventListener("pointerdown", (e) => { dernier = [e.clientX, e.clientY, e.pointerId]; });
    this.element.addEventListener("pointermove", (e) => {
      if (!dernier || e.pointerId !== dernier[2]) return;
      this.lacet -= (e.clientX - dernier[0]) * 0.006;
      this.tangage = Math.max(-0.35, Math.min(1.1, this.tangage + (e.clientY - dernier[1]) * 0.004));
      dernier = [e.clientX, e.clientY, e.pointerId];
    });
    this.element.addEventListener("pointerup", () => { dernier = null; });
    // Bannière « tournez le téléphone » (téléphone tenu verticalement ; peut être fermée).
    const tourner = document.getElementById("tourner");
    const aide = (ok) => {
      if (!ok && tourner) {
        tourner.hidden = false;
        tourner.querySelector("span").textContent = "Sur iPhone : touchez Partager puis « Sur l'écran d'accueil » pour jouer en plein écran. Tournez ensuite le téléphone.";
      }
    };
    if (tourner) {
      let ferme = false;
      try { ferme = sessionStorage.getItem("kinshasa3d.tourner") === "1"; } catch { /* stockage indisponible */ }
      tourner.hidden = ferme;
      tourner.querySelector("[data-plein-ecran]").addEventListener("click", async () => { const ok = await pleinEcranHorizontal(); if (ok) tourner.hidden = true; else aide(ok); });
      tourner.querySelector(".fermer").addEventListener("click", () => {
        tourner.hidden = true;
        try { sessionStorage.setItem("kinshasa3d.tourner", "1"); } catch { /* ignoré */ }
      });
    }
    // Boutons : data-action (déclenchement), data-tenir (maintenu : pédales), data-bascule (course).
    for (const b of zone.querySelectorAll("[data-action], [data-tenir], [data-bascule]")) {
      if (b.dataset.action === "pleinEcran") {   // « click » : seul un geste complet autorise le plein écran
        b.addEventListener("pointerdown", (e) => e.stopPropagation());
        b.addEventListener("click", async () => { if (!this.edition) aide(await pleinEcranHorizontal()); });
        continue;
      }
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (this.edition) return;
        if (b.dataset.bascule) {
          const k = b.dataset.bascule;
          if (this.actionsTactilesTenues.has(k)) this.actionsTactilesTenues.delete(k); else this.actionsTactilesTenues.add(k);
          b.classList.toggle("actif", this.actionsTactilesTenues.has(k));
          return;
        }
        if (b.dataset.tenir) { this.actionsTactilesTenues.add(b.dataset.tenir); b.classList.add("actif"); try { b.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } return; }
        this.actionsTactiles.add(b.dataset.action);
        b.classList.add("actif");
      });
      const relacher = () => {
        if (b.dataset.tenir) this.actionsTactilesTenues.delete(b.dataset.tenir);
        if (!b.dataset.bascule) b.classList.remove("actif");
      };
      b.addEventListener("pointerup", relacher);
      b.addEventListener("pointercancel", relacher);
    }
  }
}

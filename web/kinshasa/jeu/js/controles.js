// Commandes : clavier (AZERTY et QWERTY grâce aux touches physiques), souris,
// manette, et commandes tactiles (joystick + boutons) sur téléphone.
export class Controles {
  constructor(element) {
    this.touches = new Set();
    this.appuis = new Set();       // touches appuyées pendant cette image (un seul déclenchement)
    this.lacet = 0;                // rotation caméra (souris / doigt)
    this.tangage = 0.25;
    this.joy = { x: 0, y: 0 };
    this.tactile = { course: false, frein: false };
    this.element = element;
    addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (!this.touches.has(e.code)) this.appuis.add(e.code);
      this.touches.add(e.code);
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    addEventListener("keyup", (e) => this.touches.delete(e.code));
    addEventListener("blur", () => this.touches.clear());
    element.addEventListener("click", () => {
      if (!matchMedia("(pointer: coarse)").matches) element.requestPointerLock?.();
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement !== element) return;
      this.lacet -= e.movementX * 0.0025;
      this.tangage = Math.max(-0.35, Math.min(1.1, this.tangage + e.movementY * 0.002));
    });
    this._tactile();
  }

  /** Touche : codes physiques (KeyW = Z sur un clavier AZERTY). */
  bas(...codes) { return codes.some((c) => this.touches.has(c)); }
  appui(...codes) { return codes.some((c) => this.appuis.has(c)); }
  finImage() { this.appuis.clear(); }

  /** Axes de déplacement : x (droite +), y (avant +), entre -1 et 1. */
  axes() {
    let x = 0, y = 0;
    if (this.bas("KeyW", "ArrowUp")) y += 1;
    if (this.bas("KeyS", "ArrowDown")) y -= 1;
    if (this.bas("KeyA", "ArrowLeft")) x -= 1;
    if (this.bas("KeyD", "ArrowRight")) x += 1;
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      if (Math.abs(pad.axes[0]) > 0.15) x = pad.axes[0];
      if (Math.abs(pad.axes[1]) > 0.15) y = -pad.axes[1];
      if (Math.abs(pad.axes[2]) > 0.15) this.lacet -= pad.axes[2] * 0.04;
      if (Math.abs(pad.axes[3]) > 0.15) this.tangage = Math.max(-0.35, Math.min(1.1, this.tangage + pad.axes[3] * 0.03));
      // Gâchettes : accélérer (R2) / freiner (L2).
      if (pad.buttons[7]?.value > 0.1) y = Math.max(y, pad.buttons[7].value);
      if (pad.buttons[6]?.value > 0.1) y = Math.min(y, -pad.buttons[6].value);
      if (pad.buttons[0]?.pressed && !this._a) this.appuis.add("Space");
      if (pad.buttons[3]?.pressed && !this._y) this.appuis.add("KeyF");
      this._a = pad.buttons[0]?.pressed; this._y = pad.buttons[3]?.pressed;
    }
    if (Math.hypot(this.joy.x, this.joy.y) > 0.1) { x = this.joy.x; y = this.joy.y; }
    return { x, y };
  }
  courir() { return this.bas("ShiftLeft", "ShiftRight") || this.tactile.course; }
  frein() { return this.bas("Space") || this.tactile.frein; }

  _tactile() {
    const zone = document.getElementById("tactile");
    if (!zone || !matchMedia("(pointer: coarse)").matches) return;
    zone.hidden = false;
    const base = zone.querySelector(".joy"), bouton = zone.querySelector(".joy i");
    let id = null, cx = 0, cy = 0;
    base.addEventListener("pointerdown", (e) => {
      id = e.pointerId; const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      base.setPointerCapture(id);
    });
    base.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - cx, dy = e.clientY - cy, R = 55, n = Math.min(R, Math.hypot(dx, dy)) / (Math.hypot(dx, dy) || 1);
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
    for (const b of zone.querySelectorAll("[data-touche]")) {
      const code = b.dataset.touche;
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        if (code === "course") this.tactile.course = !this.tactile.course;
        else if (code === "frein") this.tactile.frein = true;
        else this.appuis.add(code);
        b.classList.toggle("actif", code === "course" ? this.tactile.course : true);
      });
      b.addEventListener("pointerup", () => {
        if (code === "frein") this.tactile.frein = false;
        if (code !== "course") b.classList.remove("actif");
      });
    }
  }
}

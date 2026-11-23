// Disposition des commandes tactiles : taille réglable et boutons déplaçables
// (glisser-déposer), enregistrée séparément à l'horizontale et à la verticale.

const orientation = () => (innerWidth > innerHeight ? "paysage" : "portrait");

/** Applique la taille et les positions enregistrées (fractions de l'écran). */
export function appliquerTactile(reglages) {
  document.documentElement.style.setProperty("--t-bouton", `${reglages.tailleBoutons}px`);
  const pos = reglages.positions?.[orientation()] || {};
  for (const el of document.querySelectorAll("#tactile [data-id]")) {
    const p = pos[el.dataset.id];
    if (p) Object.assign(el.style, { position: "fixed", left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, right: "auto", bottom: "auto", zIndex: 8 });
    else Object.assign(el.style, { position: "", left: "", top: "", right: "", bottom: "", zIndex: "" });
  }
}

/**
 * Mode édition : chaque bouton (et le joystick) se déplace au doigt.
 * « Terminer » enregistre ; les boutons à pied et en véhicule sont tous visibles pendant l'édition.
 */
export function editerTactile(ctl, reglages, enregistrer, notifier) {
  const o = orientation();
  reglages.positions ||= {};
  reglages.positions[o] ||= {};
  ctl.edition = true;
  document.body.classList.add("edition-tactile");
  const barre = document.createElement("div");
  barre.id = "barre-edition";
  barre.innerHTML = `<span>Glissez les boutons · ${o === "paysage" ? "horizontale" : "verticale"}</span><button class="btn principal">Terminer</button>`;
  document.body.appendChild(barre);
  const elements = [...document.querySelectorAll("#tactile [data-id]")];
  const poignees = [];
  for (const el of elements) {
    let depart = null;
    const bas = (e) => {
      e.preventDefault(); e.stopPropagation();
      const r = el.getBoundingClientRect();
      depart = [e.clientX - r.left, e.clientY - r.top];
      try { el.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
    };
    const bouge = (e) => {
      if (!depart) return;
      const x = Math.max(0, Math.min(innerWidth - el.offsetWidth, e.clientX - depart[0]));
      const y = Math.max(0, Math.min(innerHeight - el.offsetHeight, e.clientY - depart[1]));
      Object.assign(el.style, { position: "fixed", left: `${x}px`, top: `${y}px`, right: "auto", bottom: "auto", zIndex: 8 });
      reglages.positions[o][el.dataset.id] = [x / innerWidth, y / innerHeight];
    };
    const haut = () => { depart = null; };
    el.addEventListener("pointerdown", bas, true);
    el.addEventListener("pointermove", bouge, true);
    el.addEventListener("pointerup", haut, true);
    poignees.push([el, bas, bouge, haut]);
  }
  barre.querySelector("button").addEventListener("click", () => {
    for (const [el, bas, bouge, haut] of poignees) {
      el.removeEventListener("pointerdown", bas, true);
      el.removeEventListener("pointermove", bouge, true);
      el.removeEventListener("pointerup", haut, true);
    }
    barre.remove();
    document.body.classList.remove("edition-tactile");
    ctl.edition = false;
    enregistrer();
    appliquerTactile(reglages);
    notifier("Disposition des commandes enregistrée.", { type: "succes" });
  });
}

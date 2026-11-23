// Test de bout en bout de l'INTERFACE DE JEU (HUD, mini-carte, menus, interactions,
// missions, GPS, véhicule, commandes, tactile). Chaque bouton testé doit produire
// un effet réel dans le jeu.
// Usage : node web/kinshasa/jeu/tests/e2e_interface.cjs [http://localhost:8080]
const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const base = process.argv[2] || "http://localhost:8080";
  const nav = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await nav.newPage({ viewport: { width: 1280, height: 720 } });
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  const ok = (nom, cond) => { assert.ok(cond, nom); console.log("ok -", nom); };
  const J = (f, a) => page.evaluate(f, a);
  const attendre = (ms) => page.waitForTimeout(ms);
  // Attente en TEMPS DE JEU : le rendu logiciel des tests tourne à ~2 images/s et chaque image
  // est limitée à 0,1 s de jeu ; attendre en temps réel ne suffirait pas.
  const jeu = (p, s) => p.evaluate((s) => window.__jeu.sim.t + s, s).then((fin) =>
    p.waitForFunction((fin) => window.__jeu.sim.t >= fin, fin, { timeout: 600000, polling: 200 }));
  const attendreJeu = (s) => jeu(page, s);

  await page.goto(base + "/jeu/?zone=gombe&nouveau=1&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 180000 });
  await attendre(4000);

  // 1. HUD : valeurs réelles affichées.
  const h = await J(() => {
    const j = window.__jeu, c = document.getElementById("minicarte");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const couleurs = new Set(); for (let i = 0; i < d.length; i += 4 * 97) couleurs.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return { couleurs: couleurs.size, argent: document.getElementById("argent").textContent, etatArgent: j.etat.argent,
      sante: document.getElementById("barre-sante").style.width, rue: document.getElementById("rue").textContent };
  });
  ok("HUD : mini-carte dessinée (routes, bâtiments, icônes)", h.couleurs > 6);
  ok("HUD : argent affiché = argent du jeu", h.argent.replace(/\s| /g, "").startsWith(String(h.etatArgent)));
  ok("HUD : barre de santé = santé du joueur (100 %)", h.sante === "100%");
  ok("HUD : nom de la rue réelle sous la mini-carte", /Place de la Gare|Boulevard|Avenue|Rue/.test(h.rue));

  // 2. Endurance : le sprint fatigue, le repos la rend.
  await page.keyboard.down("ShiftLeft"); await page.keyboard.down("KeyW"); await attendreJeu(6);
  await page.keyboard.up("KeyW"); await page.keyboard.up("ShiftLeft");
  const e1 = await J(() => window.__jeu.joueur.endurance);
  ok(`endurance : diminue en courant (${Math.round(e1)} %)`, e1 < 99);
  await attendreJeu(4);
  ok("endurance : remonte au repos", (await J(() => window.__jeu.joueur.endurance)) > e1);

  // 3. Santé : une chute de 20 m blesse.
  await J(() => { const j = window.__jeu, p = j.joueur.position(); j.joueur.teleporter(p.x, p.y + 20, p.z); });
  await attendreJeu(4);
  const s1 = await J(() => window.__jeu.joueur.sante);
  ok(`santé : chute de 20 m → blessure (${Math.round(s1)} %)`, s1 < 95);

  // 4. Menu d'interaction : distributeur d'une vraie banque de la Gombe.
  const banque = await J(() => {
    const j = window.__jeu, b = j.carte.lieux.find((l) => l.cat === "banque");
    j.joueur.teleporter(b.x + 1, j.monde.hauteur(b.x, b.z) + 1, b.z + 1); j.sim.definirJoueur(b.x, b.z);
    return b.n;
  });
  await attendreJeu(1.5);
  const actions = await J(() => window.__jeu.actionsDisponibles().map((a) => a.texte));
  ok(`interaction : distributeur proposé devant « ${banque} »`, actions.some((t) => /Distributeur : retirer/.test(t)));
  const avant = await J(() => ({ a: window.__jeu.etat.argent, b: window.__jeu.etat.banque }));
  await J(() => { const j = window.__jeu; j.actionsDisponibles().find((a) => /Distributeur/.test(a.texte)).faire(); });
  const apres = await J(() => ({ a: window.__jeu.etat.argent, b: window.__jeu.etat.banque }));
  ok("interaction : retrait réel (argent +20 000, banque −20 000)", apres.a === avant.a + 20000 && apres.b === avant.b - 20000);
  ok("interaction : liste affichée à l'écran", await J(() => !document.getElementById("interactions").hidden && document.querySelectorAll("#interactions li").length > 0));

  // 5. Menu pause : le jeu est figé ; chaque onglet s'affiche.
  await page.keyboard.press("Escape"); await attendre(500);
  const t0 = await J(() => [window.__jeu.etat.pause, window.__jeu.sim.t, window.__jeu.env.heure]);
  await attendre(1500);
  const t1 = await J(() => [window.__jeu.sim.t, window.__jeu.env.heure]);
  ok("pause : menu ouvert, circulation et heure arrêtées", t0[0] === true && t1[0] === t0[1] && t1[1] === t0[2]);
  for (const o of ["carte", "personnage", "vehicules", "missions", "transports", "zones", "parametres", "sauvegarde", "quitter"]) {
    await page.click(`[data-onglet="${o}"]`); await attendre(400);
    const n = await J(() => document.getElementById("menu-contenu").textContent.trim().length);
    ok(`menu : onglet « ${o} » affiché`, n > 20);
  }
  // Paramètres > Commandes : remapper « Interagir » sur G, puis rétablir.
  await page.click('[data-onglet="parametres"]'); await attendre(300);
  await page.click('[data-modifier="interagir"]'); await attendre(200);
  await page.keyboard.press("KeyG"); await attendre(300);
  ok("commandes : « Interagir » remappé sur G et enregistré", await J(() => window.__jeu.ctl.carte.interagir[0] === "KeyG" &&
    JSON.parse(localStorage.getItem("kinshasa3d.commandes.v1")).interagir[0] === "KeyG"));
  await page.click("[data-reinit]"); await attendre(200);
  ok("commandes : touches par défaut rétablies", await J(() => window.__jeu.ctl.carte.interagir[0] === "KeyE"));
  // Graphismes : champ de vision ; Audio : volume.
  await page.click('[data-sous="graphismes"]'); await attendre(200);
  await J(() => { const r = document.getElementById("r-fov"); r.value = 80; r.dispatchEvent(new Event("input")); });
  ok("graphismes : champ de vision appliqué à la caméra (80°)", await J(() => window.__jeu.camera.fov === 80));
  await page.click('[data-sous="audio"]'); await attendre(200);
  await J(() => { const r = document.getElementById("r-vol"); r.value = 30; r.dispatchEvent(new Event("input")); });
  ok("audio : volume enregistré (30 %)", await J(() => window.__jeu.reglages.volume === 0.3));
  // Sauvegarde.
  await page.click('[data-onglet="sauvegarde"]'); await attendre(200);
  await page.click("[data-sauver]"); await attendre(300);
  ok("sauvegarde : écrite avec la banque et les statistiques", await J(() => {
    const s = JSON.parse(localStorage.getItem("kinshasa3d.sauvegarde.v1.gombe")); return s.banque === window.__jeu.etat.banque && s.stats && s.date > 0; }));
  // Carte : un clic choisit une destination GPS réelle (itinéraire calculé).
  await page.click('[data-onglet="carte"]'); await attendre(600);
  const box = await page.locator("#grande-carte").boundingBox();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4); await attendre(500);
  ok("carte : clic → destination GPS", await J(() => !!window.__jeu.gps.dest));
  await page.keyboard.press("Escape"); await attendreJeu(0.6);
  ok("pause : le menu se ferme, le jeu reprend", await J(() => !window.__jeu.etat.pause && document.getElementById("menu").hidden));
  ok("GPS : itinéraire sur le réseau réel et bandeau affiché", await J(() => window.__jeu.gps.points.length > 1 && !document.getElementById("gps-bandeau").hidden));
  await J(() => window.__jeu.gps.effacer());

  // 6. Mission « course » : démarrage depuis le menu, objectif, arrivée, récompense.
  await page.keyboard.press("Escape"); await attendre(300);
  await page.click('[data-onglet="missions"]'); await attendre(300);
  const idx = await J(() => window.__jeu.missions.offres.findIndex((o) => o.type === "course"));
  await page.click(`[data-demarrer="${idx}"]`); await attendreJeu(0.6);
  ok("mission : démarrée, objectif et chronomètre affichés", await J(() => !!window.__jeu.missions.active && !document.getElementById("objectif").hidden && !document.getElementById("mission-chrono").hidden));
  const argentAvant = await J(() => window.__jeu.etat.argent);
  await J(() => { const j = window.__jeu, e = j.missions.etapeCourante().l; j.joueur.teleporter(e[0] + 2, j.monde.hauteur(e[0], e[1]) + 1, e[1]); });
  await attendreJeu(2);
  ok("mission : réussie sur place, récompense versée", await J((a) => !window.__jeu.missions.active && window.__jeu.etat.argent > a && window.__jeu.missions.stats.reussies === 1, argentAvant));

  // 7. Véhicule : tableau de bord réel (vitesse, rapport, compteur, voyants).
  // Véhicule dont la voie est libre devant (la flotte est garée en file : on évite de foncer dans la voisine).
  await J(() => {
    const j = window.__jeu, libre = (v) => { const q = v.position(), r = v.corps.rotation(), a = 2 * Math.atan2(r.y, r.w), fx = -Math.sin(a), fz = -Math.cos(a);
      return !j.flotte.some((u) => { if (u === v) return false; const o = u.position(), dx = o.x - q.x, dz = o.z - q.z, av = dx * fx + dz * fz; return av > 0 && av < 40 && Math.abs(dx * fz - dz * fx) < 4; }); };
    const v = j.flotte.find((x) => x.type !== "moto" && libre(x)) || j.flotte[j.flotte.length - 1], q = v.position();
    window.__vt = j.flotte.indexOf(v);
    j.joueur.teleporter(q.x + 2.5, q.y + 0.5, q.z);
  });
  await attendreJeu(0.5);
  await page.keyboard.press("KeyF"); await attendreJeu(0.5);
  ok("véhicule : tableau de bord affiché en conduite", await J(() => window.__jeu.etat.mode === "conduite" && !document.getElementById("tableau-bord").hidden));
  const odo0 = await J(() => window.__jeu.etat.vehicule.odometre);
  await page.keyboard.down("KeyW"); await attendreJeu(5);
  const tb = await J(() => ({ v: +document.getElementById("tb-vitesse").textContent, r: document.getElementById("tb-rapport").textContent, odo: window.__jeu.etat.vehicule.odometre }));
  await page.keyboard.up("KeyW");
  ok(`véhicule : vitesse ${tb.v} km/h, rapport ${tb.r}, compteur qui avance`, tb.v > 0 && tb.r === "D" && tb.odo > odo0);
  await page.keyboard.press("KeyL"); await attendreJeu(0.5);
  ok("véhicule : phares (L) → voyant allumé", await J(() => window.__jeu.etat.vehicule.phares && document.getElementById("v-phares").classList.contains("allume")));
  await page.keyboard.down("Space"); await attendreJeu(4); await page.keyboard.up("Space");
  await page.keyboard.press("KeyF"); await attendreJeu(0.5);
  ok("véhicule : sortie (F), tableau de bord masqué", await J(() => window.__jeu.etat.mode === "pied" && document.getElementById("tableau-bord").hidden));

  // 8. Dépanneuse : payante, livrée après le délai (pas d'apparition instantanée).
  const loin = await J(() => { const j = window.__jeu, p = j.joueur.position(); return j.flotte.findIndex((v) => { const q = v.position(); return Math.hypot(q.x - p.x, q.z - p.z) > 60; }); });
  if (loin >= 0) {
    await page.keyboard.press("Escape"); await attendre(300);
    await page.click('[data-onglet="vehicules"]'); await attendre(300);
    const a0 = await J(() => window.__jeu.etat.argent);
    await page.click(`[data-remorquer="${loin}"]`); await attendre(300);
    ok("dépanneuse : commandée et payée (15 000 FC)", await J((a) => window.__jeu.etat.argent === a - 15000 && window.__jeu.remorquages.length === 1, a0));
    const d0 = await J((i) => { const j = window.__jeu, p = j.joueur.position(), q = j.flotte[i].position(); return Math.hypot(q.x - p.x, q.z - p.z); }, loin);
    await page.keyboard.press("Escape"); await attendreJeu(2);
    const d1 = await J((i) => { const j = window.__jeu, p = j.joueur.position(), q = j.flotte[i].position(); return Math.hypot(q.x - p.x, q.z - p.z); }, loin);
    ok(`dépanneuse : pas d'apparition instantanée (${Math.round(d1)} m après 2 s)`, d1 > 50);
    await J(() => { window.__jeu.remorquages[0].t = 0.01; }); // on accélère le délai de 90 s pour le test
    await attendreJeu(1);
    const d2 = await J((i) => { const j = window.__jeu, p = j.joueur.position(), q = j.flotte[i].position(); return Math.hypot(q.x - p.x, q.z - p.z); }, loin);
    ok(`dépanneuse : véhicule livré au bord de la route près du joueur (${Math.round(d0)} m → ${Math.round(d2)} m)`, d2 < 40);
  }

  // 9. Téléphone à l'horizontale : boutons en véhicule, éditeur de disposition.
  const ctx = await nav.newContext({ ...devices["Pixel 7 landscape"] });
  const tel = await ctx.newPage();
  tel.on("pageerror", (e) => erreurs.push("téléphone : " + e.message));
  await tel.goto(base + "/jeu/?zone=limete&nouveau=1");
  await tel.waitForFunction(() => window.__jeu, null, { timeout: 180000 });
  await tel.waitForTimeout(2500);
  const vis = (sel) => tel.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0; }, sel);
  ok("téléphone : à pied, bouton « agir » visible, pédales masquées", (await vis('[data-id="interagir"]')) && !(await vis('[data-id="gaz"]')));
  await tel.evaluate(() => { const j = window.__jeu, v = j.flotte[0], q = v.position(); j.joueur.teleporter(q.x + 2.5, q.y + 0.5, q.z); });
  await jeu(tel, 0.5);
  await tel.locator('[data-id="vehicule"]').dispatchEvent("pointerdown"); await jeu(tel, 0.5);
  await tel.locator('[data-id="vehicule"]').dispatchEvent("pointerup");
  ok("téléphone : bouton F → au volant", await tel.evaluate(() => window.__jeu.etat.mode === "conduite"));
  await tel.waitForTimeout(500);
  ok("téléphone : en véhicule, accélérateur et frein visibles, « agir » masqué", (await vis('[data-id="gaz"]')) && (await vis('[data-id="frein"]')) && !(await vis('[data-id="interagir"]')));
  await tel.locator('[data-id="gaz"]').dispatchEvent("pointerdown");
  await jeu(tel, 4);
  const vt = await tel.evaluate(() => window.__jeu.etat.vehicule.vitesse());
  await tel.locator('[data-id="gaz"]').dispatchEvent("pointerup");
  ok(`téléphone : la pédale d'accélérateur fait avancer (${vt.toFixed(1)} m/s)`, vt > 0.5);
  // Éditeur de disposition : déplacer le joystick, enregistrer.
  await tel.evaluate(() => window.__jeu.menu.ouvrir("parametres"));
  await tel.click('[data-sous="tactile"]');
  await tel.click("[data-editer]");
  const j0 = await tel.locator('#tactile .joy').boundingBox();
  await tel.locator('#tactile .joy').dispatchEvent("pointerdown", { clientX: j0.x + 20, clientY: j0.y + 20, pointerId: 7 });
  await tel.locator('#tactile .joy').dispatchEvent("pointermove", { clientX: j0.x + 220, clientY: j0.y - 40, pointerId: 7 });
  await tel.locator('#tactile .joy').dispatchEvent("pointerup", { pointerId: 7 });
  await tel.click("#barre-edition button");
  ok("téléphone : joystick déplacé et disposition enregistrée", await tel.evaluate(() => {
    const r = JSON.parse(localStorage.getItem("kinshasa3d.reglages.v1")); return !!r.positions.paysage?.joy; }));
  await ctx.close();

  if (erreurs.length) console.log("Erreurs JavaScript :\n  " + erreurs.join("\n  "));
  ok("aucune erreur JavaScript", erreurs.length === 0);
  await nav.close();
  console.log("Tous les tests de l'interface sont passés.");
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });

// Test de bout en bout dans un vrai navigateur (Chromium via Playwright).
// Prérequis : serveur local lancé (python tools/jumeau/serveur_local.py 8080)
// et Playwright installé (npx playwright install chromium).
// Usage : node web/kinshasa/jeu/tests/e2e_navigateur.cjs [http://localhost:8080]
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const base = process.argv[2] || "http://localhost:8080";
  const navigateur = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 720 } });
  const erreurs = [];
  // Pile d'appel jointe aux erreurs de la console (pour savoir d'où elles viennent).
  await page.addInitScript(() => { const e = console.error; console.error = (...a) => e(...a, "| pile : " + (new Error().stack || "").split("\n").slice(2, 6).map((l) => l.trim()).join(" < ")); });
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  const etat = () => page.evaluate(() => {
    const j = window.__jeu;
    const p = j.etat.vehicule ? j.etat.vehicule.position() : j.joueur.position();
    return { x: p.x, z: p.z, mode: j.etat.mode, v: j.etat.vehicule ? j.etat.vehicule.vitesse() : 0,
      tuiles: j.monde.tuiles.size, trafic: j.sim.vehicules.length, pietons: j.sim.pietons.length,
      rendus: j.rendu.actifs.size, pietonsRendus: j.rendu.pietonsActifs.size };
  });
  const verifier = (nom, cond) => { assert.ok(cond, nom); console.log("ok -", nom); };

  // 1. Mode carte (Google Earth) : chargement sans erreur.
  await page.goto(base + "/#15/-4.3045/15.3105/0/50");
  await page.waitForTimeout(6000);
  verifier("carte : aucune erreur", erreurs.length === 0);

  // 2. Mode jeu : chargement, monde, circulation.
  await page.goto(base + "/jeu/?nouveau=1&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
  await page.waitForTimeout(5000);
  const e0 = await etat();
  verifier("jeu : tuiles chargées autour du joueur", e0.tuiles >= 9);
  verifier("jeu : circulation et piétons simulés", e0.trafic > 50 && e0.pietons > 50);
  verifier("jeu : véhicules et piétons affichés autour du joueur", e0.rendus > 0 && e0.pietonsRendus > 0);

  // 3. Marche.
  await page.keyboard.down("KeyW"); await page.waitForTimeout(4000); await page.keyboard.up("KeyW");
  const e1 = await etat();
  verifier("marche : le joueur se déplace", Math.hypot(e1.x - e0.x, e1.z - e0.z) > 0.5);

  // 4. Monter dans un véhicule, rouler, freiner, descendre.
  await page.evaluate(() => { const j = window.__jeu; const v = j.flotte[0].position(); j.joueur.teleporter(v.x + 2.5, v.y + 0.5, v.z); });
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF"); await page.waitForTimeout(500);
  verifier("véhicule : le joueur conduit", (await etat()).mode === "conduite");
  const e2 = await etat();
  // (5 s : le rendu logiciel de test, sans carte graphique, fait tourner le jeu au ralenti)
  await page.keyboard.down("KeyW"); await page.waitForTimeout(5000); await page.keyboard.up("KeyW");
  const e3 = await etat();
  verifier("conduite : le véhicule avance", Math.hypot(e3.x - e2.x, e3.z - e2.z) > 0.5);
  await page.keyboard.down("Space"); await page.waitForTimeout(4000); await page.keyboard.up("Space");
  verifier("conduite : le véhicule freine", Math.abs((await etat()).v) < 1);
  await page.keyboard.press("KeyF"); await page.waitForTimeout(400);
  verifier("véhicule : le joueur descend", (await etat()).mode === "pied");

  // 5. Caméras (V) et accroupissement (Ctrl).
  for (let i = 0; i < 4; i++) { await page.keyboard.press("KeyV"); await page.waitForTimeout(250); }
  verifier("caméras : retour à la 3e personne après 4 changements", await page.evaluate(() => window.__jeu.etat.camPied === 0));
  await page.keyboard.press("ControlLeft"); await page.waitForTimeout(300);
  verifier("accroupi", await page.evaluate(() => window.__jeu.joueur.accroupi));
  await page.keyboard.press("ControlLeft");

  // 6. Éditeur de personnage : style « Sapeur ».
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.click('[data-onglet="personnage"]');
  await page.click('#menu [data-style="sapeur"]');
  await page.waitForTimeout(500);
  verifier("éditeur : apparence appliquée et enregistrée", await page.evaluate(() =>
    JSON.parse(localStorage.getItem("kinshasa3d.personnage.v1")).haut === "#c2185b"));
  await page.keyboard.press("Escape"); await page.waitForTimeout(300);

  // 7. Prendre une moto-taxi (simulée) comme passager, puis descendre.
  const pris = await page.evaluate(() => {
    const j = window.__jeu;
    const p = j.joueur.position();
    const m = j.sim.vehicules.filter((v) => v.type === "moto" && !v.client && !v.passagers.length && v.etat === "route")
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!m) return false;
    m.v = 0; m.etat = "arret"; m.minuterie = 5;
    j.joueur.teleporter(m.x + 1.5, j.monde.hauteur(m.x, m.z) + 0.5, m.z);
    j.rendu.mettreAJour(0.016, m.x, m.z, 0);
    return j.prendreTransport();
  });
  verifier("moto-taxi : le joueur monte comme passager", pris && (await etat()).mode === "passager");
  await page.waitForTimeout(4000);
  await page.keyboard.press("KeyE"); await page.waitForTimeout(6000);
  verifier("moto-taxi : le joueur redescend", (await etat()).mode === "pied");

  // 8. Sauvegarde.
  await page.keyboard.press("KeyP"); await page.waitForTimeout(300);
  verifier("sauvegarde écrite", await page.evaluate(() => !!localStorage.getItem("kinshasa3d.sauvegarde.v1")));

  // 9. Deuxième zone : la Gombe (zone rectangulaire, lignes réelles 02, 06B, 11).
  await page.goto(base + "/jeu/?zone=gombe&nouveau=1&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
  await page.waitForTimeout(5000);
  const g = await page.evaluate(() => ({ titre: document.title, lignes: window.__jeu.sim.lignes.map((l) => l.ref) }));
  const eg = await etat();
  verifier("Gombe : zone chargée", g.titre.includes("Gombe") && eg.tuiles >= 9);
  verifier("Gombe : lignes réelles 02, 06B et 11", ["02", "06B", "11"].every((r) => g.lignes.includes(r)));
  verifier("Gombe : circulation affichée autour du joueur", eg.trafic > 50 && eg.rendus > 0 && eg.pietonsRendus > 0);
  await page.keyboard.down("KeyW"); await page.waitForTimeout(6000); await page.keyboard.up("KeyW");
  const eg2 = await etat();
  verifier("Gombe : le joueur marche", Math.hypot(eg2.x - eg.x, eg2.z - eg.z) > 1);
  await page.keyboard.press("KeyP"); await page.waitForTimeout(300);
  verifier("Gombe : sauvegarde séparée de celle de Limete", await page.evaluate(() =>
    !!localStorage.getItem("kinshasa3d.sauvegarde.v1.gombe") && JSON.parse(localStorage.getItem("kinshasa3d.sauvegarde.v1")).zone === "limete"));
  // 10. Troisième zone : Lingwala / Kasa-Vubu et ses monuments.
  await page.goto(base + "/jeu/?zone=centre&nouveau=1&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  const mc = await page.evaluate(() => Object.keys(window.__jeu.monuments).sort().join(","));
  const ec = await etat();
  verifier("Lingwala / Kasa-Vubu : stade, palais et hôpital construits", mc === "hopital,palais,stade");
  verifier("Lingwala / Kasa-Vubu : circulation affichée autour du joueur", ec.tuiles >= 9 && ec.trafic > 50 && ec.rendus > 0);
  // Collision : le joueur ne traverse pas la façade du stade.
  const bloque = await page.evaluate(async () => {
    const j = window.__jeu, s = j.monuments.stade;
    const pts = j.monde.manifest.monuments.stade.p;
    let far = [pts[0], pts[1]];
    for (let i = 0; i < pts.length; i += 2) if (Math.hypot(pts[i] - s.x, pts[i + 1] - s.z) > Math.hypot(far[0] - s.x, far[1] - s.z)) far = [pts[i], pts[i + 1]];
    const u = [(far[0] - s.x), (far[1] - s.z)], l = Math.hypot(...u);
    const x = far[0] + u[0] / l * 3, z = far[1] + u[1] / l * 3;
    j.joueur.teleporter(x, j.monde.hauteur(x, z) + 1.2, z);
    j.ctl.lacet = Math.atan2(u[0] / l, u[1] / l);   // regarder vers le stade
    return { x, z, cx: s.x, cz: s.z };
  });
  await page.keyboard.down("KeyW"); await page.waitForTimeout(7000); await page.keyboard.up("KeyW");
  const apres = await page.evaluate(() => { const q = window.__jeu.joueur.position(); return [q.x, q.z]; });
  const d0 = Math.hypot(bloque.x - bloque.cx, bloque.z - bloque.cz), d1 = Math.hypot(apres[0] - bloque.cx, apres[1] - bloque.cz);
  console.log(`   (distance au centre du stade : ${d0.toFixed(1)} m -> ${d1.toFixed(1)} m)`);
  verifier("Lingwala / Kasa-Vubu : le mur du stade arrête le joueur", d0 - d1 > 1 && d1 > d0 - 4);

  // 11. Quatrième zone : Kalamu (Matonge, Rond-point Victoire).
  await page.goto(base + "/jeu/?zone=kalamu&nouveau=1&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  const ek = await etat();
  const lk = await page.evaluate(() => ({ titre: document.title, lignes: window.__jeu.sim.lignes.map((l) => l.ref) }));
  verifier("Kalamu : zone chargée avec la ligne réelle 11", lk.titre.includes("Kalamu") && lk.lignes.includes("11") && ek.tuiles >= 9);
  verifier("Kalamu : circulation affichée autour du joueur", ek.trafic > 50 && ek.rendus > 0 && ek.pietonsRendus > 0);

  // 12. Changer de zone depuis le jeu.
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await page.click('[data-onglet="zones"]');
  await Promise.all([page.waitForNavigation(), page.click('#menu [data-zone="limete"]')]);
  await page.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
  verifier("changement de zone : retour à Limete", (await page.title()).includes("Limete"));

  // 13. Téléphone tenu à l'horizontale : commandes tactiles visibles, aucun élément ne se chevauche.
  const { devices } = require("playwright");
  for (const appareil of ["Pixel 7 landscape", "iPhone 13 landscape"]) {
    const ctx = await navigateur.newContext({ ...devices[appareil] });
    const tel = await ctx.newPage();
    tel.on("pageerror", (e) => erreurs.push(appareil + " : " + e.message));
    await tel.goto(base + "/jeu/?zone=limete&nouveau=1");
    await tel.waitForFunction(() => window.__jeu, null, { timeout: 120000 });
    await tel.waitForTimeout(2000);
    const r = await tel.evaluate(() => {
      const sel = ["#radar", "#haut-droite", "#btn-menu", "#gps-bandeau", "#objectif", "#interactions", "#tableau-bord", "#tactile .joy", "#tactile button", "#tourner"];
      const els = [];
      for (const s of sel) for (const e of document.querySelectorAll(s)) {
        if (e.closest("[hidden]") || getComputedStyle(e).display === "none") continue;
        const b = e.getBoundingClientRect();
        if (b.width && b.height) els.push({ n: s, b, e });
      }
      const pb = [];
      for (const a of els) if (a.b.left < -1 || a.b.top < -1 || a.b.right > innerWidth + 1 || a.b.bottom > innerHeight + 1) pb.push("hors écran " + a.n);
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], c = els[j];
        if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        if (a.b.left < c.b.right - 1 && c.b.left < a.b.right - 1 && a.b.top < c.b.bottom - 1 && c.b.top < a.b.bottom - 1) pb.push(a.n + " / " + c.n);
      }
      return { paysage: innerWidth > innerHeight, tactile: !document.getElementById("tactile").hidden, pb };
    });
    if (r.pb.length) console.log("   " + appareil + " : " + r.pb.join(", "));
    verifier(`téléphone à l'horizontale (${appareil}) : commandes visibles, rien ne se chevauche`, r.paysage && r.tactile && r.pb.length === 0);
    await ctx.close();
  }

  if (erreurs.length) console.log("Erreurs JavaScript :\n  " + erreurs.join("\n  "));
  verifier("aucune erreur JavaScript", erreurs.length === 0);
  await navigateur.close();
  console.log("Tous les tests navigateur sont passés.");
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });

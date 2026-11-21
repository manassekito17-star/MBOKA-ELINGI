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
  page.on("pageerror", (e) => erreurs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text()); });
  const etat = () => page.evaluate(() => {
    const j = window.__jeu;
    const p = j.etat.vehicule ? j.etat.vehicule.position() : j.joueur.position();
    return { x: p.x, z: p.z, mode: j.etat.mode, v: j.etat.vehicule ? j.etat.vehicule.vitesse() : 0,
      tuiles: j.monde.tuiles.size, trafic: j.trafic.vehicules.length, pietons: j.trafic.pietons.length };
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
  verifier("jeu : circulation et piétons présents", e0.trafic > 0 && e0.pietons > 0);

  // 3. Marche.
  await page.keyboard.down("KeyW"); await page.waitForTimeout(2000); await page.keyboard.up("KeyW");
  const e1 = await etat();
  verifier("marche : le joueur se déplace", Math.hypot(e1.x - e0.x, e1.z - e0.z) > 0.5);

  // 4. Monter dans un véhicule, rouler, freiner, descendre.
  await page.evaluate(() => { const j = window.__jeu; const v = j.flotte[0].position(); j.joueur.teleporter(v.x + 2.5, v.y + 0.5, v.z); });
  await page.waitForTimeout(400);
  await page.keyboard.press("KeyF"); await page.waitForTimeout(500);
  verifier("véhicule : le joueur conduit", (await etat()).mode === "conduite");
  const e2 = await etat();
  await page.keyboard.down("KeyW"); await page.waitForTimeout(3000); await page.keyboard.up("KeyW");
  const e3 = await etat();
  verifier("conduite : le véhicule avance", Math.hypot(e3.x - e2.x, e3.z - e2.z) > 0.5);
  await page.keyboard.down("Space"); await page.waitForTimeout(4000); await page.keyboard.up("Space");
  verifier("conduite : le véhicule freine", Math.abs((await etat()).v) < 1);
  await page.keyboard.press("KeyF"); await page.waitForTimeout(400);
  verifier("véhicule : le joueur descend", (await etat()).mode === "pied");

  // 5. Sauvegarde.
  await page.keyboard.press("KeyP"); await page.waitForTimeout(300);
  verifier("sauvegarde écrite", await page.evaluate(() => !!localStorage.getItem("kinshasa3d.sauvegarde.v1")));

  verifier("aucune erreur JavaScript", erreurs.length === 0);
  await navigateur.close();
  console.log("Tous les tests navigateur sont passés.");
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });

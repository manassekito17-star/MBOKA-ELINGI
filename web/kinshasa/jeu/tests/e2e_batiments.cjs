// Test de bout en bout des BÂTIMENTS REMARQUABLES : modèles à leur vraie position, niveaux de détail,
// terrassement, collisions, reconnaissance (nom à l'approche), fiche, GPS, vue cinématique, « Y aller »
// vers une autre zone, visionneuse de comparaison.
// Usage : node web/kinshasa/jeu/tests/e2e_batiments.cjs [http://localhost:8080]
const { chromium } = require("playwright");
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
  // Clics dans le menu : directement dans la page (le navigateur de test, sans carte graphique, est très lent).
  const jeu = (p, s) => p.evaluate((s) => window.__jeu.sim.t + s, s).then((fin) =>
    p.waitForFunction((fin) => window.__jeu.sim.t >= fin, fin, { timeout: 600000, polling: 200 }));

  // 1. Registre : chaque fiche a son identité, ses sources, sa fidélité élément par élément.
  const reg = await (await page.request.get(base + "/jeu/donnees/batiments.json")).json();
  for (const b of reg.batiments) {
    ok(`registre : ${b.id} complet (noms, GPS, commune, sources, fidélité, date)`, b.nom_officiel && b.nom_courant && b.gps?.lat && b.commune &&
      b.sources.length && b.fidelite.elements.length && b.date_verification && b.emprise.length);
    for (const id of b.references) {
      const ph = reg.photos.find((p) => p.id === id);
      ok(`  référence « ${id} » : licence libre et auteur cités`, ph && /CC/.test(ph.licence) && ph.auteur && ph.page.startsWith("https://commons.wikimedia.org/"));
    }
  }

  // 2. Zone Lingwala / Kasa-Vubu : hôpital du Cinquantenaire et stade des Martyrs.
  await page.goto(base + "/jeu/?zone=centre&nouveau=1&lieu=cinquantenaire&qualite=moyenne");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 240000 });
  await jeu(page, 1);
  const r = await J(() => {
    const j = window.__jeu;
    return j.remarquables.liste.map((b) => ({ id: b.id, niveaux: b.objet?.levels.length, x: b.objet?.position.x, z: b.objet?.position.z, bx: b.x, bz: b.z }));
  });
  for (const b of r) ok(`${b.id} : modèle chargé à sa position GPS, 3 niveaux de détail`, b.niveaux === 3 && Math.abs(b.x - b.bx) < 0.01 && Math.abs(b.z - b.bz) < 0.01);
  // Terrassement : le relief est plat sous le site.
  const plat = await J(() => {
    const j = window.__jeu, s = j.remarquables.liste.find((b) => b.id === "stade_martyrs"), e = s.emprises[0];
    const hs = [j.monde.hauteur(s.x, s.z)];
    for (let i = 0; i < e.length; i += 8) hs.push(j.monde.hauteur(s.x + (e[i] - s.x) * 0.7, s.z + (e[i + 1] - s.z) * 0.7));
    return Math.max(...hs) - Math.min(...hs);
  });
  ok(`terrassement : relief plat sous le stade (écart ${plat.toFixed(2)} m)`, plat < 0.3);
  // Bâtiments génériques retirés de l'emprise (rendu), empreintes gardées pour la carte.
  const gen = await J(() => {
    const j = window.__jeu, h = j.remarquables.liste.find((b) => b.id === "cinquantenaire");
    let carte = 0;
    for (const t of j.monde.tuiles.values()) for (const b of t.d.b) {
      const n = b.p.length / 2; let x = 0, z = 0;
      for (let i = 0; i < n; i++) { x += b.p[2 * i]; z += b.p[2 * i + 1]; }
      if (j.monde.exclusions.some((e) => { let c = false; for (let i = 0, k = e.length / 2 - 1; i < e.length / 2; k = i++) { const xi = e[2 * i], zi = e[2 * i + 1], xk = e[2 * k], zk = e[2 * k + 1]; if ((zi > z / n) !== (zk > z / n) && x / n < ((xk - xi) * (z / n - zi)) / (zk - zi) + xi) c = !c; } return c; })) carte++;
    }
    return { exclusions: j.monde.exclusions.length, carte };
  });
  ok(`emprises exclues du rendu générique (${gen.exclusions}), empreintes réelles gardées pour la carte (${gen.carte})`, gen.exclusions >= 2 && gen.carte > 10);

  // 3. Reconnaissance : nom à l'approche, actions, fiche, GPS, vue cinématique.
  // On efface l'annonce déjà faite à l'arrivée et on guette la nouvelle (elle reste 7 s à l'écran).
  await J(() => { document.querySelectorAll("#notifs .notif.lieu").forEach((n) => n.remove()); window.__jeu.remarquables.annonce.clear(); });
  const annonce = await page.waitForFunction(() => {
    const n = document.querySelector("#notifs .notif.lieu"); return n && n.textContent; }, null, { timeout: 120000, polling: 100 }).then((h) => h.jsonValue());
  ok("approche : « HÔPITAL DU CINQUANTENAIRE / Établissement hospitalier / Kasa-Vubu, Kinshasa, RDC »",
    /HÔPITAL DU CINQUANTENAIRE/.test(annonce) && /Établissement hospitalier/.test(annonce) && /Kasa-Vubu, Kinshasa, RDC/.test(annonce));
  const acts = await J(() => window.__jeu.actionsDisponibles().map((a) => a.texte));
  ok("interaction : « Fiche » et « Regarder le bâtiment » proposés devant l'hôpital", acts.some((t) => /^Fiche : Hôpital du Cinquantenaire/.test(t)) && acts.some((t) => /Regarder le bâtiment/.test(t)));
  await J(() => window.__jeu.actionsDisponibles().find((a) => /^Fiche/.test(a.texte)).faire());
  await page.waitForTimeout(800);
  ok("fiche : ouverte dans le menu « Lieux » (le jeu est en pause)", await J(() => window.__jeu.etat.pause && /Hôpital du Cinquantenaire/.test(document.querySelector(".fiche-lieu h3").textContent)));
  ok("fiche : statuts de fidélité affichés (photo, satellite, estimé, déduit…)", await J(() => document.querySelectorAll(".fiche-lieu .statut.photo").length > 3 && document.querySelectorAll(".fiche-lieu .statut.deduit").length > 0));
  await page.waitForFunction(() => [...document.querySelectorAll(".fiche-lieu .refs img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  ok("fiche : photo de référence affichée avec auteur et licence", await J(() => /Tite koya/.test(document.querySelector(".fiche-lieu figcaption").textContent) && /CC BY-SA 4\.0/.test(document.querySelector(".fiche-lieu figcaption").textContent)));
  await page.waitForFunction(() => /Inventaire de Kinshasa/.test(document.getElementById("inventaire-resume")?.textContent || ""), null, { timeout: 30000 });
  ok("fiche : résumé de l'inventaire de la ville (par priorité)", await J(() => /2\. Hôpital ou clinique/.test(document.getElementById("inventaire-resume").textContent)));
  await J((s) => document.querySelector(s).click(), '[data-lieu-fiche="stade_martyrs"]'); await page.waitForTimeout(300);
  await J((s) => document.querySelector(s).click(), '[data-lieu-gps="stade_martyrs"]'); await page.waitForTimeout(300);
  ok("fiche : « Destination GPS » trace l'itinéraire vers le stade", await J(() => window.__jeu.gps.dest?.nom === "Stade des Martyrs"));
  await J((s) => document.querySelector(s).click(), '[data-lieu-voir="stade_martyrs"]'); await page.waitForTimeout(300);
  await jeu(page, 0.5);
  ok("vue cinématique : la caméra tourne autour du stade, menu fermé", await J(() => !!window.__jeu.cinematique() && !window.__jeu.etat.pause));
  await page.keyboard.down("KeyW"); await jeu(page, 0.6); await page.keyboard.up("KeyW");
  ok("vue cinématique : un mouvement rend la main au joueur", await J(() => !window.__jeu.cinematique()));
  // Niveau de détail : loin, le modèle passe à la silhouette (LOD2).
  const lod = await J(() => {
    const j = window.__jeu, s = j.remarquables.liste.find((b) => b.id === "stade_martyrs").objet;
    const c = j.camera.clone(); c.position.set(s.position.x + 1500, 200, s.position.z); c.updateMatrixWorld(); s.update(c);
    const loin = s.getCurrentLevel();
    c.position.set(s.position.x + 60, 20, s.position.z); c.updateMatrixWorld(); s.update(c);
    return [loin, s.getCurrentLevel()];
  });
  ok(`niveaux de détail : silhouette au loin (niveau ${lod[0]}), modèle détaillé de près (niveau ${lod[1]})`, lod[0] === 2 && lod[1] === 0);

  // 4. « Y aller » vers une autre zone : la FIKIN (Limete), départ à l'entrée.
  await J(() => window.__jeu.menu.ouvrir("lieux", "fikin"));
  await page.waitForTimeout(500);
  await Promise.all([page.waitForNavigation({ timeout: 120000 }), page.click('[data-lieu-aller="fikin"]')]);
  await page.waitForFunction(() => window.__jeu, null, { timeout: 240000 });
  await jeu(page, 0.5);
  const f = await J(() => { const j = window.__jeu, b = j.remarquables.liste.find((x) => x.id === "fikin"), p = j.joueur.position();
    return { zone: location.search, objet: !!b.objet, d: Math.hypot(p.x - b.entreeZone.x, p.z - b.entreeZone.z) }; });
  ok(`« Y aller » : zone Limete chargée, FIKIN modélisée, départ à l'entrée (${f.d.toFixed(0)} m)`, /zone=limete/.test(f.zone) && f.objet && f.d < 60);

  // 5. Zone Kintambo : hôpital général de référence (volumétrie, apparence non vérifiée).
  await page.goto(base + "/jeu/?zone=kintambo&nouveau=1&lieu=kintambo_hgr&qualite=basse");
  await page.waitForFunction(() => window.__jeu, null, { timeout: 240000 });
  await jeu(page, 0.5);
  ok("Kintambo : zone et hôpital général de référence chargés", await J(() => !!window.__jeu.remarquables.liste.find((b) => b.id === "kintambo_hgr")?.objet));
  ok("Kintambo : fidélité « volumétrie » signalée (pas de photo libre)", reg.batiments.find((b) => b.id === "kintambo_hgr").fidelite.niveau === "volumetrie");

  // 6. Visionneuse : chaque modèle s'ouvre avec ses vues de contrôle.
  for (const b of reg.batiments) {
    const v = await nav.newPage({ viewport: { width: 1000, height: 640 } });
    v.on("pageerror", (e) => erreurs.push("visionneuse : " + e.message));
    await v.goto(`${base}/jeu/visionneuse.html?id=${b.id}`);
    await v.waitForFunction(() => window.__pret, null, { timeout: 120000 });
    ok(`visionneuse : ${b.id} (${Object.keys(b.vues).length} vues)`, await v.evaluate(() => document.querySelectorAll("#vues button").length) === Object.keys(b.vues).length);
    await v.close();
  }

  if (erreurs.length) console.log("Erreurs JavaScript :\n  " + erreurs.join("\n  "));
  ok("aucune erreur JavaScript", erreurs.length === 0);
  await nav.close();
  console.log("Tous les tests des bâtiments remarquables sont passés.");
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });

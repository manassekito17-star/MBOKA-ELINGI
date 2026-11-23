// Scénarios de test de la simulation urbaine (Node.js, sans navigateur) : npm test
// A : bus, arrêt, montée, départ        B : moto-taxi, prise en charge, dépose
// C : carrefour à feux, 30 véhicules     D : bouchon derrière un bus arrêté
// F : piétons sur un passage piéton      G : heures de pointe / heures creuses
// H : accident simulé (voie bloquée)     I : zone de la Gombe (réseau réel, lignes, feux)
// J : zone Lingwala / Kasa-Vubu (ligne réelle 11, feux réels)
// K : zone de Kalamu (Matonge, Rond-point Victoire)
// (Le scénario E — joueur qui marche, court, conduit — est testé dans le navigateur :
//  tests/e2e_navigateur.cjs.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Circulation } from "../js/simulation/circulation.js";

const ZONE = new URL("../zones/limete/", import.meta.url);
const lire = (f) => JSON.parse(fs.readFileSync(new URL(f, ZONE)));
const reseauReel = lire("reseau.json");
const transportsReels = lire("transports.json");

/** Invariant : aucun chevauchement entre véhicules d'une même voie (= aucune collision). */
function sansCollision(sim) {
  const voies = new Map();
  for (const v of sim.vehicules) {
    if (v.interfile) continue;
    const k = v.arc * 4 + v.voie;
    if (!voies.has(k)) voies.set(k, []);
    voies.get(k).push(v);
  }
  for (const l of voies.values()) {
    l.sort((a, b) => a.s - b.s);
    for (let i = 0; i + 1 < l.length; i++) {
      const ecart = l[i + 1].s - l[i].s - (l[i].long + l[i + 1].long) / 2;
      if (ecart < -0.05) return `chevauchement ${l[i].id}/${l[i + 1].id} : ${ecart.toFixed(2)} m`;
    }
  }
  return null;
}

function arcEntre(sim, x0, z0, x1, z1) {
  return sim.R.arcs.find((a) => {
    const p = a.pts[0], q = a.pts[a.pts.length - 1];
    return Math.hypot(p[0] - x0, p[1] - z0) < 1 && Math.hypot(q[0] - x1, q[1] - z1) < 1;
  });
}
const evts = (sim, type) => sim.evenements.filter((e) => e.type === type);

// ---------------------------------------------------------------------------
test("Scénario C : carrefour à feux, 30 véhicules en files, aucun passage au rouge", () => {
  const croix = [
    { p: [-250, 0, 0, 0], k: "primary", n: "Avenue Est-Ouest" }, { p: [0, 0, 250, 0], k: "primary", n: "Avenue Est-Ouest" },
    { p: [0, -250, 0, 0], k: "primary", n: "Avenue Nord-Sud" }, { p: [0, 0, 0, 250], k: "primary", n: "Avenue Nord-Sud" },
  ];
  const sim = new Circulation(croix, null, { auto: false, graine: 3 });
  assert.equal(sim.controleurs.length, 1, "un carrefour à feux");
  const approches = [[[-250, 0, 0, 0], [0, 0, 250, 0]], [[250, 0, 0, 0], [0, 0, -250, 0]],
    [[0, -250, 0, 0], [0, 0, 0, 250]], [[0, 250, 0, 0], [0, 0, 0, -250]]];
  let n = 0;
  for (let k = 0; k < 4 && n < 30; k++) {
    for (const [e, s] of approches) {
      const ae = arcEntre(sim, ...e), as = arcEntre(sim, ...s);
      for (const voie of [0, 1]) {
        if (n >= 30) break;
        if (sim.ajouterVehicule("voiture", ae.id, 10 + k * 22, voie, [ae.id, as.id])) n++;
      }
    }
  }
  assert.equal(n, 30);
  let fileMax = 0;
  for (let t = 0; t < 400; t++) {
    sim.pas(1);
    assert.equal(sansCollision(sim), null);
    const arretes = sim.vehicules.filter((v) => v.v < 0.5 && sim.R.arcs[v.arc].vers === sim.controleurs[0].noeuds[0]).length;
    fileMax = Math.max(fileMax, arretes);
  }
  const entrees = evts(sim, "entree_carrefour");
  assert.equal(new Set(entrees.map((e) => e.v)).size, 30, "les 30 véhicules ont traversé");
  assert.ok(entrees.every((e) => e.feu === "vert" || e.feu === "orange"), "aucune entrée au rouge");
  // À l'orange, seulement les véhicules trop proches pour s'arrêter.
  assert.ok(entrees.filter((e) => e.feu === "orange").length <= entrees.length * 0.2, "peu d'entrées à l'orange");
  assert.ok(fileMax >= 5, `des files se forment aux feux (max ${fileMax} véhicules arrêtés)`);
});

// ---------------------------------------------------------------------------
test("Scénario D : un bouchon se forme derrière un bus arrêté puis se résorbe", () => {
  const sim = new Circulation([{ p: [0, 0, 700, 0], k: "tertiary", n: "Avenue test" }], null, { auto: false, graine: 5 });
  const ligne = sim.ajouterLigne({ id: "T", ref: "T", nom: "Ligne test", trace: [0, 0, 700, 0], type: "bus", nbBus: 1,
    arrets: [{ id: "A1", nom: "Arrêt test", x: 300, z: 0 }] });
  assert.ok(ligne, "ligne créée");
  const bus = sim.vehicules.find((v) => v.role === "ligne");
  const arc = bus.arc;
  const p = sim.ajouterPieton(arc, 300, 1, { etat: "attenteBus", arret: "A1", ligne: "T" });
  sim.arrets.get("A1").attente.add(p);
  while (bus.s < 70) sim.pas(0.5);
  const voitures = [];
  for (let k = 0; k < 6; k++) voitures.push(sim.ajouterVehicule("voiture", arc, 8 + k * 9, 0, [arc]));
  assert.ok(voitures.every(Boolean));
  let fileMax = 0, departT = null, monte = false, resorbee = null;
  for (let t = 0; t < 300; t++) {
    sim.pas(0.5);
    assert.equal(sansCollision(sim), null);
    if (bus.etat === "arret" && bus.arretActuel === "A1") {
      const file = voitures.filter((v) => sim.vehicules.includes(v) && v.v < 0.5 && bus.s - v.s < 80).length;
      fileMax = Math.max(fileMax, file);
    }
    if (p.etat === "aBord") monte = true;
    if (departT === null && evts(sim, "depart_arret").length) departT = sim.t;
    if (departT !== null && resorbee === null && sim.t > departT + 30) {
      resorbee = voitures.filter((v) => sim.vehicules.includes(v)).every((v) => v.v > 2);
    }
  }
  assert.ok(monte, "le passager est monté");
  assert.ok(departT !== null, "le bus est reparti");
  assert.ok(fileMax >= 3, `file derrière le bus : ${fileMax} véhicules arrêtés`);
  assert.equal(resorbee, true, "30 s après le départ du bus, toutes les voitures roulent");
});

// ---------------------------------------------------------------------------
test("Scénario F : des piétons traversent, les véhicules s'arrêtent", () => {
  const route = [{ p: [0, 0, 500, 0], k: "tertiary", n: "Avenue test" }];
  const sim = new Circulation(route, { passages: [{ x: 250, z: 0, id: "c1" }] }, { auto: false, graine: 9 });
  assert.equal(sim.passages.length, 1);
  const [aller, retour] = [sim.R.arcs[0], sim.R.arcs[1]];
  let violations = 0, arretsDevant = 0;
  for (let t = 0; t < 600; t++) {
    if (t < 400 && t % 8 === 0) sim.ajouterVehicule(t % 16 ? "voiture" : "minibus", aller.id, 5, 0, [aller.id]);
    if (t < 400 && t % 10 === 5) sim.ajouterVehicule("taxi", retour.id, 5, 0, [retour.id]);
    if (t < 400 && t % 25 === 0) { const p = sim.ajouterPieton(aller.id, 250, t % 50 ? 1 : -1, { etat: "attenteTraversee" }); p.traversee = 0; }
    sim.pas(0.5);
    const c = sim.passages[0];
    const occupe = sim.pietons.some((p) => p.etat === "traverse" && p.traversee === 0);
    for (const v of sim.vehicules) {
      const tr = c.arcs.find((x) => x.arc === v.arc);
      if (!tr) continue;
      const surPassage = Math.abs(v.s - tr.s) < v.long / 2 + 1;
      if (occupe && surPassage && v.v > 1) violations++;
      if (occupe && v.v < 0.3 && tr.s - v.s > 0 && tr.s - v.s < 30) arretsDevant++;
    }
    assert.equal(sansCollision(sim), null);
  }
  const traversees = new Set(evts(sim, "traversee").map((e) => e.p)).size;
  assert.equal(traversees, 16, `les 16 piétons ont traversé (${traversees})`);
  assert.equal(violations, 0, "aucun véhicule ne roule sur le passage pendant une traversée");
  assert.ok(arretsDevant > 0, "des véhicules se sont arrêtés devant le passage");
});

// ---------------------------------------------------------------------------
test("Scénario A : un bus de la ligne réelle 02 dessert un arrêt, prend un passager et repart", () => {
  const sim = new Circulation(reseauReel, transportsReels, { auto: false, graine: 11, busParLigne: 2 });
  assert.ok(sim.lignes.length >= 1, "ligne 02 (OpenStreetMap) chargée");
  const ligne = sim.lignes[0];
  assert.match(ligne.nom, /Royal/);
  const bus = sim.vehicules.find((v) => v.role === "ligne" && v.arretsAVenir?.length);
  const st = bus.arretsAVenir[0];
  const arret = sim.arrets.get(st.id);
  const q = sim.R.arcProche(arret.x, arret.z);
  const p = sim.ajouterPieton(q.arc, q.s, 1, { etat: "attenteBus", arret: st.id, ligne: ligne.id });
  arret.attente.add(p);
  let t = 0;
  while (t < 1500 && !evts(sim, "depart_arret").some((e) => e.v === bus.id && e.arret === st.id)) { sim.pas(1); t++; }
  const arrivee = evts(sim, "arrivee_arret").find((e) => e.v === bus.id && e.arret === st.id);
  assert.ok(arrivee, `le bus arrive à l'arrêt « ${arret.nom} »`);
  assert.ok(evts(sim, "montee").some((e) => e.p === p.id && e.v === bus.id), "le passager monte");
  assert.ok(evts(sim, "depart_arret").some((e) => e.v === bus.id), "le bus repart");
  while (t < 3000 && p.etat === "aBord") { sim.pas(1); t++; }
  assert.equal(p.etat, "marche", "le passager est descendu plus loin");
  assert.ok(evts(sim, "descente").some((e) => e.p === p.id), "descente enregistrée");
});

// ---------------------------------------------------------------------------
test("Scénario B : une moto-taxi prend un client, le transporte et le dépose", () => {
  const sim = new Circulation(reseauReel, null, { auto: false, graine: 13 });
  const arc = sim.R.arcs.find((a) => a.rang >= 2 && a.long > 200 && a.voies === 1 && sim.R.noeuds[a.vers].sortants.length > 1);
  const dest = sim.R.noeudProche(sim.R.noeuds[arc.vers].x + 700, sim.R.noeuds[arc.vers].z, (n) => n.entrants.length > 0);
  const client = sim.ajouterPieton(arc.id, 150, 1, { etat: "attenteMoto", destination: dest });
  const moto = sim.ajouterVehicule("moto", arc.id, 10, 0, [arc.id]);
  sim._nouvelleDestination(moto, 100);
  const x0 = moto.x, z0 = moto.z;
  for (let t = 0; t < 900 && !evts(sim, "depose").length; t++) sim.pas(1);
  assert.ok(evts(sim, "reservation").some((e) => e.p === client.id && e.v === moto.id), "le client a fait signe à la moto");
  assert.ok(evts(sim, "prise_en_charge").some((e) => e.p === client.id), "prise en charge");
  assert.ok(evts(sim, "depose").some((e) => e.v === moto.id), "dépose");
  assert.equal(client.etat, "marche");
  const n = sim.R.noeuds[dest];
  assert.ok(Math.hypot(client.x - n.x, client.z - n.z) < 80, "déposé près de sa destination");
  assert.ok(Math.hypot(client.x - x0, client.z - z0) > 300, "le trajet a vraiment eu lieu");
});

// ---------------------------------------------------------------------------
test("Scénario G : la circulation varie entre heures de pointe et heures creuses", () => {
  const mesure = (heure) => {
    const sim = new Circulation(reseauReel, transportsReels, { heure, niveau: 1, graine: 17 });
    let vit = 0, n = 0;
    for (let t = 0; t < 400; t++) {
      sim.pas(1);
      if (t >= 250) { vit += sim.statistiques().vitesseAxes; n++; }
    }
    assert.equal(sansCollision(sim), null);
    return { vehicules: sim.vehicules.length, vitesse: vit / n };
  };
  const pointe = mesure(8), journee = mesure(13), nuit = mesure(3);
  test.diagnostic?.(JSON.stringify({ pointe, journee, nuit }));
  assert.ok(pointe.vehicules > journee.vehicules && journee.vehicules > nuit.vehicules,
    `nombre de véhicules : 8 h ${pointe.vehicules} > 13 h ${journee.vehicules} > 3 h ${nuit.vehicules}`);
  assert.ok(nuit.vitesse > pointe.vitesse, `vitesse sur les axes : nuit ${nuit.vitesse.toFixed(1)} > pointe ${pointe.vitesse.toFixed(1)} m/s`);
});

// ---------------------------------------------------------------------------
test("Scénario H : un accident simulé bloque une voie, la circulation s'adapte", () => {
  const sim = new Circulation(reseauReel, transportsReels, { heure: 13, niveau: 1, graine: 21 });
  for (let t = 0; t < 120; t++) sim.pas(1);
  const v = sim.provoquerAccident(0, 0, 60);
  assert.ok(v, "accident provoqué");
  for (let t = 0; t < 30; t++) {
    sim.pas(1);
    if (t >= 5) assert.equal(v.v < 0.1 || v.etat !== "accident", true, "le véhicule accidenté reste immobile");
    assert.equal(sansCollision(sim), null);
  }
  for (let t = 0; t < 60; t++) sim.pas(1);
  assert.ok(evts(sim, "fin_accident").some((e) => e.v === v.id), "l'accident est dégagé");
  assert.equal(sansCollision(sim), null);
});

// I : zone de la Gombe (réseau réel bien plus grand, lignes réelles dont une en boucle, feux réels OSM).
test("Scénario I : la Gombe — lignes réelles, feux réels, circulation fluide sans blocage", () => {
  const G = new URL("../zones/gombe/", import.meta.url);
  const lireG = (f) => JSON.parse(fs.readFileSync(new URL(f, G)));
  const reseau = lireG("reseau.json"), transports = lireG("transports.json");
  const sim = new Circulation(reseau, transports, { heure: 8, niveau: 1, graine: 5 });
  // Toutes les lignes réelles d'OpenStreetMap sont créées, y compris la 06B (tracé en boucle).
  assert.deepEqual(sim.lignes.map((l) => l.ref).sort(), transports.lignes.map((l) => l.ref).sort());
  assert.ok(sim.statistiques().feuxReels >= 1, "au moins un carrefour à feux réel (OSM)");
  sim.definirJoueur(1300, -1150, false);
  const bus = () => sim.vehicules.filter((v) => v.role === "ligne");
  let positions = new Map();
  for (let m = 1; m <= 12; m++) {
    for (let i = 0; i < 60; i++) sim.pas(1);
    assert.equal(sansCollision(sim), null);
    if (m === 7) positions = new Map(bus().map((v) => [v.id, [v.x, v.z]]));
  }
  // Sur les 5 dernières minutes, chaque bus de ligne a avancé (aucun bus bloqué).
  for (const v of bus()) {
    const p = positions.get(v.id);
    if (p) assert.ok(Math.hypot(v.x - p[0], v.z - p[1]) > 30, `bus ${v.id} (${v.ligne}) immobile`);
  }
  const st = sim.statistiques();
  assert.ok(st.vehicules > 250, `véhicules : ${st.vehicules}`);
  assert.ok(st.vitesseAxes > 3, `vitesse sur les axes : ${(st.vitesseAxes * 3.6).toFixed(0)} km/h`);
});

// J : zone Lingwala / Kasa-Vubu (Stade des Martyrs, Palais du Peuple, Hôpital du Cinquantenaire).
test("Scénario J : Lingwala / Kasa-Vubu — ligne réelle, feux réels, circulation sans blocage", () => {
  const C = new URL("../zones/centre/", import.meta.url);
  const lireC = (f) => JSON.parse(fs.readFileSync(new URL(f, C)));
  const reseau = lireC("reseau.json"), transports = lireC("transports.json"), manifest = lireC("manifest.json");
  // Les contours réels des trois monuments sont dans la zone.
  for (const k of ["stade", "palais", "hopital_site", "hopital_principal"]) assert.ok(manifest.monuments[k]?.p.length >= 6, k);
  const sim = new Circulation(reseau, transports, { heure: 17, niveau: 1, graine: 9 });
  assert.deepEqual(sim.lignes.map((l) => l.ref).sort(), transports.lignes.map((l) => l.ref).sort());
  assert.ok(sim.statistiques().feuxReels >= 1);
  sim.definirJoueur(380, -180, false);
  for (let m = 1; m <= 10; m++) {
    for (let i = 0; i < 60; i++) sim.pas(1);
    assert.equal(sansCollision(sim), null);
  }
  const st = sim.statistiques();
  assert.ok(st.vehicules > 250 && st.vitesseAxes > 3, JSON.stringify(st));
});

// K : zone de Kalamu (Matonge, Rond-point Victoire) — aucun feu cartographié : tous simulés.
test("Scénario K : Kalamu — ligne réelle 11, circulation à l'heure de pointe sans blocage", () => {
  const Z = new URL("../zones/kalamu/", import.meta.url);
  const lireZ = (f) => JSON.parse(fs.readFileSync(new URL(f, Z)));
  const reseau = lireZ("reseau.json"), transports = lireZ("transports.json");
  const sim = new Circulation(reseau, transports, { heure: 17, niveau: 1, graine: 4 });
  assert.deepEqual(sim.lignes.map((l) => l.ref), transports.lignes.map((l) => l.ref));
  assert.equal(sim.statistiques().feuxReels, 0);
  sim.definirJoueur(-290, -960, false);
  for (let m = 1; m <= 8; m++) {
    for (let i = 0; i < 60; i++) sim.pas(1);
    assert.equal(sansCollision(sim), null);
  }
  const st = sim.statistiques();
  assert.ok(st.vehicules > 250 && st.vitesseAxes > 3, JSON.stringify(st));
});

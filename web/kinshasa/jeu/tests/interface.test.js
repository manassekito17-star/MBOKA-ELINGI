// Tests des systèmes reliés à l'interface (sans navigateur) : GPS, missions.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { Reseau } from "../js/simulation/reseau.js";
import { GPS } from "../js/gps.js";
import { Missions } from "../js/missions.js";

const lire = (z, f) => JSON.parse(fs.readFileSync(new URL(`../zones/${z}/${f}`, import.meta.url)));

test("GPS : itinéraire sur le réseau réel de la Gombe, distance et manœuvre, arrivée", () => {
  const g = new GPS(new Reseau(lire("gombe", "reseau.json")));
  g.definir(-1135, 1320, "Cathédrale Notre-Dame du Congo");
  assert.ok(g.calculer(1300, -1150, true), "itinéraire trouvé");
  assert.ok(g.points.length > 10);
  g.mettreAJour(0.1, 1300, -1150, true);
  assert.ok(g.restant > 3000 && g.restant < 8000, `distance ${g.restant}`);
  assert.ok(["gauche", "droite", "arrivee"].includes(g.prochaine.sens));
  // En suivant le tracé, la distance restante diminue, puis on arrive.
  let avant = g.restant, arrive = null;
  for (const p of g.points.slice(1)) { const r = g.mettreAJour(0.1, p[0], p[1], true); if (r?.arrivee) { arrive = r.arrivee; break; } assert.ok(g.restant <= avant + 40); avant = g.restant; }
  assert.equal(arrive?.nom, "Cathédrale Notre-Dame du Congo");
});

test("Missions : offres sur des lieux réels, véhicule requis, réussite et récompense", () => {
  const lieux = lire("gombe", "lieux.json");
  const m = new Missions(lieux, 7);
  const offres = m.proposer(1300, -1150, null);
  assert.ok(offres.length >= 3, "au moins 3 offres");
  for (const o of offres) for (const e of o.etapes) assert.ok(lieux.some((l) => l[0] === e.l[0] && l[1] === e.l[1] && l[2] === e.l[2]), "lieu réel");
  const taxi = offres.find((o) => o.type === "taxi");
  assert.equal(m.possible(taxi, null).ok, false);
  assert.equal(m.possible(taxi, "taxi").ok, true);
  const course = offres.find((o) => o.type === "course");
  m.demarrer(course);
  assert.equal(m.mettreAJour(1, { x: 1300, z: -1150, vitesse: 0, typeVehicule: null }), null);
  const e = course.etapes[0].l;
  const r = m.mettreAJour(1, { x: e[0] + 3, z: e[1], vitesse: 0, typeVehicule: null });
  assert.equal(r.reussie, true);
  assert.ok(r.recompense >= course.recompense);
  assert.equal(m.stats.reussies, 1);
  // Taxi : l'arrêt doit se faire à l'arrêt (vitesse faible) et dans le bon véhicule ; temps limité.
  m.demarrer(taxi);
  const A = taxi.etapes[0].l;
  assert.equal(m.mettreAJour(1, { x: A[0], z: A[1], vitesse: 8, typeVehicule: "taxi" }), null, "pas à 8 m/s");
  assert.ok(m.mettreAJour(1, { x: A[0], z: A[1], vitesse: 0.5, typeVehicule: "taxi" }).etape, "client à bord");
  const echec = m.mettreAJour(taxi.delai + 5, { x: 0, z: 0, vitesse: 0, typeVehicule: "taxi" });
  assert.equal(echec.echec, true);
});

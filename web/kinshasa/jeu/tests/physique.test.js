// Tests automatiques de la physique (Node.js, sans navigateur) : npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Physique } from "../js/physique.js";
import { Vehicule, TYPES } from "../js/vehicules.js";
import { Projection, Relief, Trajet, dansPolygone } from "../js/geo.js";

async function mondePlat() {
  const ph = await Physique.creer();
  const n = 21;
  ph.ajouterRelief(new Float32Array(n * n), n, 400);
  return ph;
}
function simuler(ph, v, secondes, acc, dir, frein = 0) {
  const dt = 1 / 60;
  for (let i = 0; i < secondes * 60; i++) {
    v.commander(acc, dir, frein, dt);
    v.mettreAJour(dt);
    ph.pas(dt);
  }
}
const scene = new THREE.Scene();

test("projection : aller-retour géographique précis au centimètre", () => {
  const P = new Projection(-4.374384, 15.345467);
  const { x, z } = P.versLocal(15.3555, -4.3655);
  const g = P.versGeo(x, z);
  assert.ok(Math.abs(g.lon - 15.3555) < 1e-9 && Math.abs(g.lat + 4.3655) < 1e-9);
  assert.ok(x > 1000 && z < -900, "nord-est => x positif, z négatif");
});

test("relief : interpolation bilinéaire", () => {
  const r = new Relief(new Float32Array([0, 10, 0, 10]), 2, 100);
  assert.equal(r.hauteur(0, 0), 5);
  // Zone rectangulaire (ex. Gombe) : 3 colonnes est-ouest × 2 rangées nord-sud, pas de 10 m.
  const rr = new Relief(new Float32Array([0, 1, 2, 10, 11, 12]), 3, 10, 2);
  assert.equal(rr.hauteur(-10, -5), 0);
  assert.equal(rr.hauteur(10, 5), 12);
  assert.equal(rr.hauteur(0, 0), 6);
});

test("trajet et polygone", () => {
  const t = new Trajet([0, 0, 10, 0, 10, 10]);
  assert.equal(t.longueur, 20);
  const p = t.point(15);
  assert.deepEqual([p.x, p.z], [10, 5]);
  assert.ok(dansPolygone(5, 5, [0, 0, 10, 0, 10, 10, 0, 10]));
  assert.ok(!dansPolygone(15, 5, [0, 0, 10, 0, 10, 10, 0, 10]));
});

for (const type of Object.keys(TYPES)) {
  test(`véhicule ${type} : roule, tourne et freine`, async () => {
    const ph = await mondePlat();
    const v = new Vehicule(ph, scene, type, 0, 0, 0, 0);
    simuler(ph, v, 1, 0, 0);                       // posé au sol, frein à main
    const y0 = v.position().y;
    assert.ok(y0 > -0.5 && y0 < 2, `posé sur le sol (y=${y0.toFixed(2)})`);
    simuler(ph, v, 4, 1, 0);
    const vit = v.vitesse();
    assert.ok(vit > 4, `accélère vers l'avant (${vit.toFixed(1)} m/s)`);
    assert.ok(v.position().z < -5, "l'avant est vers -Z (nord)");
    const a0 = v.angle();
    simuler(ph, v, 2, 0.5, 1);
    const da = v.angle() - a0;
    assert.ok(Math.abs(da) > 0.15, `tourne (Δangle=${da.toFixed(2)})`);
    simuler(ph, v, 4, 0, 0, 1);
    assert.ok(Math.abs(v.vitesse()) < 1.5, `freine (${v.vitesse().toFixed(2)} m/s)`);
    // Retenir le sens du braquage pour les commandes.
    test.diagnostic?.(`${type}: dir=+1 => Δangle ${da > 0 ? "positif (gauche)" : "négatif (droite)"}`);
  });
}

test("collision : un véhicule est arrêté par un mur", async () => {
  const ph = await mondePlat();
  // Mur de 20 m de large à 25 m devant.
  const t = [];
  const q = [[-10, -1, -25], [10, -1, -25], [10, 6, -25], [-10, -1, -25], [10, 6, -25], [-10, 6, -25]];
  for (const p of q) t.push(...p);
  for (const p of [...q].reverse()) t.push(...p);
  ph.ajouterMaillageFixe(new Float32Array(t));
  const v = new Vehicule(ph, scene, "voiture", 0, 0, 0, 0);
  simuler(ph, v, 8, 1, 0);
  assert.ok(v.position().z > -25, `ne traverse pas le mur (z=${v.position().z.toFixed(1)})`);
});

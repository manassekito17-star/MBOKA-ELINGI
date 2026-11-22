// Environnement : ciel physique, soleil (position réelle à la latitude de
// Kinshasa, -4,3°), cycle jour/nuit accéléré, ombres, nuages, brume, pluie,
// éclairage public la nuit.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

const LAT = (-4.35 * Math.PI) / 180;
export const METEOS = ["Dégagé", "Nuageux", "Pluie"];

export class Environnement {
  constructor(scene, renderer, qualite) {
    this.scene = scene;
    this.heure = 10;           // heure locale (0–24)
    this.vitesseTemps = 60;    // 1 s réelle = 60 s de jeu (1 jour = 24 min)
    this.meteo = 0;
    this.pluie01 = 0;
    this.ciel = new Sky();
    this.ciel.scale.setScalar(4500);
    scene.add(this.ciel);
    const u = this.ciel.material.uniforms;
    u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.8;
    this.soleil = new THREE.DirectionalLight(0xfff1dc, 3);
    this.soleil.castShadow = qualite !== "basse";
    const ts = qualite === "haute" ? 4096 : 2048;
    this.soleil.shadow.mapSize.set(ts, ts);
    const c = this.soleil.shadow.camera;
    c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 1; c.far = 600;
    this.soleil.shadow.bias = -0.0004;
    this.soleil.shadow.normalBias = 0.05;
    scene.add(this.soleil, this.soleil.target);
    this.ambiance = new THREE.HemisphereLight(0xcfe3ff, 0x6b5843, 0.8);
    scene.add(this.ambiance);
    scene.fog = new THREE.Fog(0xd9d2c4, 200, 1400);
    this.renderer = renderer;
    this.qualite = qualite;
    // Reflets : carte d'environnement calculée à partir du ciel (vitres, tôle, eau, carrosseries).
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sceneCiel = new THREE.Scene();
    this.cielReflets = new Sky();
    this.cielReflets.scale.setScalar(1000);
    this.sceneCiel.add(this.cielReflets);
    this.prochainReflet = 0;
    this._nuages();
    this._pluie();
    this.lumieresRue = [];
    for (let i = 0; i < (qualite === "basse" ? 4 : 10); i++) {
      const l = new THREE.PointLight(0xffd59a, 0, 28, 1.6);
      scene.add(l);
      this.lumieresRue.push(l);
    }
  }

  _nuages() {
    const toile = document.createElement("canvas");
    toile.width = toile.height = 256;
    const ctx = toile.getContext("2d");
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, r = 15 + Math.random() * 40;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(toile);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    this.matNuages = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false, fog: false });
    this.nuages = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), this.matNuages);
    this.nuages.rotation.x = Math.PI / 2;
    this.nuages.position.y = 900;
    this.scene.add(this.nuages);
  }

  _pluie() {
    const n = 6000;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80;
      p.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    this.gouttes = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab7c4, transparent: true, opacity: 0.45 }));
    this.gouttes.visible = false;
    this.gouttes.frustumCulled = false;
    this.scene.add(this.gouttes);
  }

  /** Direction du soleil pour l'heure locale (équinoxe, latitude de Kinshasa). */
  directionSoleil(h) {
    const angleHoraire = ((h - 12) / 12) * Math.PI;
    const elev = Math.asin(Math.cos(LAT) * Math.cos(angleHoraire));
    const az = Math.atan2(Math.sin(angleHoraire), Math.cos(angleHoraire) * Math.sin(LAT));
    return new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, az + Math.PI);
  }

  estNuit() { return this.heure < 6.3 || this.heure > 18.3; }

  mettreAJour(dt, centre, camera, lampadaires) {
    this.heure = (this.heure + (dt * this.vitesseTemps) / 3600) % 24;
    const d = this.directionSoleil(this.heure);
    const jour = THREE.MathUtils.smoothstep(d.y, -0.08, 0.15);
    this.pluie01 += ((this.meteo === 2 ? 1 : 0) - this.pluie01) * Math.min(1, dt * 0.5);
    const couvert = Math.max(this.meteo === 1 ? 0.55 : 0, this.pluie01);
    const u = this.ciel.material.uniforms;
    u.sunPosition.value.copy(d);
    u.turbidity.value = 6 + couvert * 12;
    u.rayleigh.value = 1.6 - couvert * 1.0;
    this.soleil.position.copy(centre).addScaledVector(d, 300);
    this.soleil.target.position.copy(centre);
    this.soleil.intensity = 3.2 * jour * (1 - couvert * 0.7);
    this.soleil.color.setHSL(0.09, 0.6, 0.55 + 0.4 * THREE.MathUtils.smoothstep(d.y, 0, 0.4));
    // Avec la carte d'environnement (lumière du ciel), l'éclairage d'ambiance simple est réduit.
    this.ambiance.intensity = (0.12 + 0.75 * jour) * (this.scene.environment ? 0.3 : 1);
    this.ambiance.color.setHSL(0.6, 0.4, 0.45 + 0.4 * jour);
    const brume = new THREE.Color().setHSL(0.09, 0.2 * jour, 0.05 + 0.75 * jour * (1 - couvert * 0.3));
    this.scene.fog.color.copy(brume);
    this.scene.fog.near = 120 - couvert * 90;
    this.scene.fog.far = 1400 - couvert * 1000;
    this.renderer.toneMappingExposure = (0.45 + 0.5 * jour * (1 - 0.4 * couvert)) * (this.scene.environment ? 0.85 : 1);
    this.matNuages.opacity = 0.25 + couvert * 0.6;
    this.matNuages.color.setScalar(0.25 + 0.75 * jour - couvert * 0.25);
    this.nuages.position.x = centre.x; this.nuages.position.z = centre.z;
    // Mise à jour des reflets du ciel (toutes les ~10 min de jeu ; une seule fois en qualité basse).
    this.prochainReflet -= dt;
    // (aussi dès que la lumière change nettement : lever, coucher du soleil, saut d'heure)
    if (this.prochainReflet <= 0 || Math.abs(jour - (this.jourReflet ?? -1)) > 0.08 || Math.abs(couvert - (this.couvertReflet ?? -1)) > 0.15) {
      this.prochainReflet = this.qualite === "basse" ? 120 : 10;
      this.jourReflet = jour; this.couvertReflet = couvert;
      const r = this.cielReflets.material.uniforms;
      for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) r[k].value = u[k].value;
      r.sunPosition.value.copy(d);
      const ancien = this.scene.environment;
      this.scene.environment = this.pmrem.fromScene(this.sceneCiel, 0, 1, 2000).texture;
      this.scene.environmentIntensity = 0.15 + 0.5 * jour;
      if (ancien) ancien.dispose();
    }
    this.matNuages.map.offset.x += dt * 0.002;
    // Pluie autour de la caméra.
    this.gouttes.visible = this.pluie01 > 0.05;
    if (this.gouttes.visible) {
      this.gouttes.position.set(camera.position.x, camera.position.y - 20, camera.position.z);
      const pos = this.gouttes.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        let y = pos.getY(i) - dt * 22;
        if (y < 0) y += 40;
        pos.setY(i, y); pos.setY(i + 1, y - 0.7);
      }
      pos.needsUpdate = true;
      this.gouttes.material.opacity = 0.45 * this.pluie01;
    }
    // Éclairage public : les lampadaires les plus proches reçoivent une vraie lumière.
    const nuit = 1 - jour;
    if (lampadaires) {
      const proches = lampadaires.map((l) => [l, (l.x - centre.x) ** 2 + (l.z - centre.z) ** 2])
        .sort((a, b) => a[1] - b[1]).slice(0, this.lumieresRue.length);
      this.lumieresRue.forEach((L, i) => {
        const p = proches[i];
        L.intensity = p && nuit > 0.3 ? 40 * nuit : 0;
        if (p) L.position.set(p[0].x, p[0].y - 0.4, p[0].z);
      });
    }
    return { nuit, couvert };
  }

  heureTexte() {
    const h = Math.floor(this.heure), m = Math.floor((this.heure % 1) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
}

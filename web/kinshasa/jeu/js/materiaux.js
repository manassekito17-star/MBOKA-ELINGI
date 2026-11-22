// Matériaux PBR photographiques (Poly Haven, CC0) : albédo + normale + ARM
// (occlusion, rugosité, métal). Coordonnées UV en MÈTRES : chaque texture est
// répétée selon sa taille réelle (materiaux.json), donc une brique garde sa
// taille quelle que soit la façade.
// Effets partagés : sol mouillé (pluie), fenêtres allumées la nuit.
import * as THREE from "three";

const DOSSIER = "assets/textures/";

export class Materiaux {
  constructor(renderer, qualite) {
    this.qualite = qualite;
    this.suffixe = qualite === "basse" ? "_512" : "";
    this.aniso = Math.min(qualite === "basse" ? 2 : 8, renderer.capabilities.getMaxAnisotropy());
    this.chargeur = new THREE.TextureLoader();
    this.uniformes = { uMouille: { value: 0 }, uNuit: { value: 0 } };
    this.cache = new Map();
  }

  async charger() {
    this.catalogue = await (await fetch(DOSSIER + "materiaux.json")).json();
    const t = (nom, fichier, couleur) => new Promise((ok) => {
      this.chargeur.load(`${DOSSIER}${nom}/${fichier}${this.suffixe}.jpg`, (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = this.aniso;
        if (couleur) tex.colorSpace = THREE.SRGBColorSpace;
        // Taille d'affichage (m) : réelle, sauf textures à motif trop visible une fois répété.
        const s = 1 / ({ crepi_use: 3.2, terre: 2.5 }[nom] || this.catalogue[nom]?.taille_m || 2);
        tex.repeat.set(s, s);
        ok(tex);
      }, undefined, () => ok(null));
    });
    this.textures = {};
    await Promise.all(Object.keys(this.catalogue).map(async (nom) => {
      const [map, normalMap, arm] = await Promise.all([t(nom, "couleur", true), t(nom, "normale"), t(nom, "arm")]);
      this.textures[nom] = { map, normalMap, arm };
    }));
    this._creer();
  }

  /** Matériau PBR d'une texture : options = { teinte, rugosite, metal, normale, mouillable, couleurs (sommets) }. */
  pbr(nom, o = {}) {
    const tx = this.textures[nom] || {};
    const m = new THREE.MeshStandardMaterial({
      map: tx.map || null,
      normalMap: this.qualite === "basse" ? null : tx.normalMap || null,
      roughnessMap: tx.arm || null,
      metalnessMap: o.metal ? tx.arm || null : null,
      aoMap: tx.arm || null,
      aoMapIntensity: 0.8,
      color: o.teinte ?? 0xffffff,
      roughness: o.rugosite ?? 1,
      metalness: o.metal ?? 0,
      vertexColors: !!o.couleurs,
      side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    });
    if (m.normalMap) m.normalScale.set(o.normale ?? 1, o.normale ?? 1);
    if (o.mouillable) this._mouillable(m);
    return m;
  }

  /** Pluie : surfaces horizontales plus sombres et plus brillantes (sol mouillé). */
  _mouillable(m) {
    const u = this.uniformes;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uMouille = u.uMouille;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uMouille;")
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.08, uMouille * 0.85);`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb *= 1.0 - 0.35 * uMouille;`);
    };
    m.customProgramCacheKey = () => "mouille";
  }

  _creer() {
    const M = (this.m = {});
    // Façades : crépi clair teinté par bâtiment (couleurs de sommets), crépi sali, brique, parpaing, béton.
    M.crepi = this.pbr("crepi", { couleurs: true, normale: 0.8 });
    M.crepiUse = this.pbr("crepi_use", { couleurs: true, normale: 0.8 });
    M.brique = this.pbr("brique", { couleurs: true });
    M.parpaing = this.pbr("parpaing", { couleurs: true });
    M.beton = this.pbr("beton", { couleurs: true, mouillable: true });
    M.tole = this.pbr("tole", { couleurs: true, metal: 1, rugosite: 1, double: true });
    M.toleRouille = this.pbr("tole_rouille", { couleurs: true, metal: 1, double: true });
    M.tuile = this.pbr("tuile", { couleurs: true, double: true });
    M.rideau = this.pbr("rideau", { couleurs: true, metal: 1 });
    M.metal = this.pbr("metal", { couleurs: true, metal: 1 });
    // Sols et routes.
    M.asphalte = this.pbr("asphalte", { couleurs: true, mouillable: true });
    M.laterite = this.pbr("laterite", { couleurs: true, mouillable: true });
    M.terre = this.pbr("terre", { couleurs: true, mouillable: true });
    M.paves = this.pbr("paves", { couleurs: true, mouillable: true });
    M.herbe = this.pbr("herbe", { couleurs: true });
    M.ecorce = this.pbr("ecorce_palmier", {});
    // Verre : reflets du ciel (carte d'environnement), fenêtres allumées la nuit
    // (couleur d'instance : rouge = allumée).
    const u = this.uniformes;
    M.vitre = new THREE.MeshStandardMaterial({ color: 0x24323b, roughness: 0.04, metalness: 0.85, envMapIntensity: 1.3 });
    M.vitre.onBeforeCompile = (sh) => {
      sh.uniforms.uNuit = u.uNuit;
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uNuit;")
        .replace("#include <color_fragment>", "")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          #ifdef USE_INSTANCING_COLOR
            totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * step(0.5, vColor.r) * uNuit * 1.4;
          #endif`);
    };
    M.vitre.customProgramCacheKey = () => "vitre";
    // Mur-rideau des tours : verre réfléchissant avec meneaux (texture dessinée).
    M.murRideau = new THREE.MeshStandardMaterial({ map: this._meneaux(), roughness: 0.06, metalness: 0.9, envMapIntensity: 1.4, color: 0x8fa6b3 });
    M.cadre = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6, metalness: 0.1 });
    M.cadreAlu = new THREE.MeshStandardMaterial({ color: 0xa9adb1, roughness: 0.35, metalness: 0.8 });
    M.ferForge = new THREE.MeshStandardMaterial({ color: 0x23272a, roughness: 0.5, metalness: 0.7, side: THREE.DoubleSide });
    M.clim = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.45, metalness: 0.2 });
    M.reservoir = new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.55, vertexColors: false });
    M.reservoirBleu = new THREE.MeshStandardMaterial({ color: 0x2b5fa8, roughness: 0.5 });
    M.porte = this.pbr("metal", { teinte: 0x7a2c22, metal: 1 });
    M.fers = new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.8, metalness: 0.6 });
  }

  /** Texture du mur-rideau : panneaux de verre 1,5 m × 3,5 m séparés par des meneaux clairs. */
  _meneaux() {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 256;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#6f8696"); g.addColorStop(1, "#4b5f6c");
    x.fillStyle = g; x.fillRect(0, 0, 128, 256);
    x.fillStyle = "#c9cdd0";
    x.fillRect(0, 0, 128, 10);        // allège / nez de dalle
    x.fillRect(0, 0, 5, 256);         // meneau
    x.fillStyle = "rgba(255,255,255,0.06)";
    x.fillRect(5, 10, 40, 246);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(1 / 1.5, 1 / 3.5);
    t.anisotropy = this.aniso;
    return t;
  }
}

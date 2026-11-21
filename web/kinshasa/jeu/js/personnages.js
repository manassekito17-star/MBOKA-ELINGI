// Personnages humains 3D animés (Quaternius, licence CC0) : joueur et piétons.
// Une seule copie du modèle et des animations en mémoire ; chaque personnage est
// un clone (SkeletonUtils) avec ses propres couleurs de peau et de vêtements.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const DOSSIER = "assets/personnages/";
const cache = {};

export async function chargerPersonnages() {
  const l = new GLTFLoader();
  const [homme, femme, anims] = await Promise.all([
    l.loadAsync(DOSSIER + "Human_Male.gltf"),
    l.loadAsync(DOSSIER + "Human_Female.gltf"),
    l.loadAsync(DOSSIER + "UAL1_Standard.glb"),
  ]);
  const tex = new THREE.TextureLoader();
  cache.homme = homme.scene;
  cache.femme = femme.scene;
  cache.masques = {
    homme: tex.load(DOSSIER + "T_Male_ClothesMask.png"),
    femme: tex.load(DOSSIER + "T_Female_ClothesMask.png"),
  };
  for (const m of Object.values(cache.masques)) { m.flipY = false; m.colorSpace = THREE.NoColorSpace; }
  // On ne garde que les rotations des os (+ position du bassin) : les proportions
  // du personnage sont conservées quelle que soit l'animation.
  cache.clips = {};
  for (const c of anims.animations) {
    const pistes = c.tracks.filter((t) => t.name.endsWith(".quaternion") || t.name.startsWith("pelvis.position"));
    cache.clips[c.name.replace(/_Loop$/, "")] = new THREE.AnimationClip(c.name, c.duration, pistes);
  }
  return Object.keys(cache.clips);
}

const TEINTS = [0x3b2518, 0x4a2e1d, 0x5c3a24, 0x6b4630];

/**
 * Crée un personnage. options : { femme, peau, haut, bas, chaussures, motifWax }
 * Les vêtements sont colorés par un masque (haut / manches / pantalon / chaussures).
 */
export function creerPersonnage(options = {}) {
  const femme = !!options.femme;
  const racine = SkeletonUtils.clone(femme ? cache.femme : cache.homme);
  const masque = cache.masques[femme ? "femme" : "homme"];
  const couleurs = {
    peau: new THREE.Color(options.peau ?? TEINTS[Math.floor(Math.random() * TEINTS.length)]),
    haut: new THREE.Color(options.haut ?? new THREE.Color().setHSL(Math.random(), 0.6, 0.45)),
    bas: new THREE.Color(options.bas ?? [0x1f2a44, 0x2b2b2b, 0x8a7a5c, 0x34495e][Math.floor(Math.random() * 4)]),
    chaussures: new THREE.Color(options.chaussures ?? 0x1a1410),
    motif: new THREE.Color().setHSL(Math.random(), 0.75, 0.5),
  };
  const wax = options.motifWax ?? Math.random() < 0.3;
  racine.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;
    const ancien = o.material;
    if (!/Superhero/.test(ancien.name)) {
      if (/Hair/.test(ancien.name)) { o.material = ancien.clone(); o.material.color.set(0x14100c); }
      return;
    }
    const m = ancien.clone();
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uMasque: { value: masque }, uPeau: { value: couleurs.peau }, uHaut: { value: couleurs.haut },
        uBas: { value: couleurs.bas }, uChaus: { value: couleurs.chaussures }, uMotif: { value: couleurs.motif },
        uWax: { value: wax ? 1 : 0 },
      });
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vUvP;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvUvP = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec2 vUvP; uniform sampler2D uMasque; uniform vec3 uPeau, uHaut, uBas, uChaus, uMotif; uniform float uWax;`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          vec3 mk = texture2D(uMasque, vUvP).rgb;
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float detail = clamp(lum / 0.08, 0.6, 1.4);
          vec3 c = uPeau * detail;
          if (mk.b > 0.25 && mk.b < 0.75) c = uChaus;
          if (mk.b >= 0.75) c = uBas * mix(1.0, detail, 0.3);
          if (mk.r > 0.5) {
            vec3 h = uHaut;
            if (uWax > 0.5) { vec2 g = fract(vUvP * 26.0) - 0.5; h = mix(h, uMotif, 1.0 - smoothstep(0.05, 0.09, abs(length(g) - 0.28))); }
            c = h * mix(1.0, detail, 0.3);
          }
          diffuseColor.rgb = c;`);
    };
    m.customProgramCacheKey = () => "perso" + (wax ? 1 : 0);
    o.material = m;
  });
  const objet = new THREE.Group();
  racine.rotation.y = Math.PI;               // modèle tourné vers -Z (avant du jeu)
  objet.add(racine);
  const melangeur = new THREE.AnimationMixer(racine);
  const actions = {};
  for (const [nom, clip] of Object.entries(cache.clips)) actions[nom] = melangeur.clipAction(clip);
  let courante = null;
  return {
    objet,
    jouer(nom, fondu = 0.25, vitesse = 1) {
      const a = actions[nom];
      if (!a) return;
      a.timeScale = vitesse;
      if (courante === a) return;
      a.reset().fadeIn(fondu).play();
      if (courante) courante.fadeOut(fondu);
      courante = a;
    },
    mettreAJour(dt) { melangeur.update(dt); },
  };
}

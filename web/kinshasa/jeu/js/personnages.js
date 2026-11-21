// Personnages humains 3D animés (modèles et 43 animations Quaternius, licence CC0).
// Une seule copie du modèle et des animations en mémoire ; chaque personnage est
// un clone (SkeletonUtils) avec sa propre apparence :
//   sexe, teint, coiffure, barbe, haut (couleur, motif wax / rayures / carreaux,
//   manches, col), bas (pantalon ou pagne), chaussures, accessoires
//   (casquette, lunettes, sac à dos, chaîne).
// Limite connue : le modèle de base n'a ni expressions faciales ni doigts animés
// séparément (pas de « blendshapes »).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const DOSSIER = "assets/personnages/";
const cache = { coiffures: {} };

export const COIFFURES = {
  aucune: { nom: "Crâne rasé" },
  rasee: { nom: "Coupe courte", fichier: "Hair_Buzzed" },
  rasee_f: { nom: "Coupe courte (femme)", fichier: "Hair_BuzzedFemale" },
  raie: { nom: "Raie sur le côté", fichier: "Hair_SimpleParted" },
  longue: { nom: "Cheveux longs / tissage", fichier: "Hair_Long" },
  chignons: { nom: "Chignons", fichier: "Hair_Buns" },
};
export const TEINTS = ["#2b1a10", "#3b2518", "#4a2e1d", "#5c3a24", "#6b4630", "#7d5538"];
export const MOTIFS = { uni: 0, wax: 1, rayures: 2, carreaux: 3 };

/** Styles vestimentaires congolais contemporains (préréglages). */
export const STYLES = {
  wax: { nom: "Chemise en wax", haut: "#d9822b", motif: "wax", motifCouleur: "#1c6e8c", bas: "#2c3e66", chaussures: "#efefea", manches: false },
  sapeur: { nom: "Sapeur (la Sape)", haut: "#c2185b", motif: "uni", bas: "#c2185b", chaussures: "#3b2316", manches: true, col: true, accessoires: { lunettes: true, chaine: false, casquette: false, sac: false } },
  leopards: { nom: "Maillot des Léopards", haut: "#1565c0", motif: "rayures", motifCouleur: "#f9a825", bas: "#111111", chaussures: "#f5f5f5", manches: false, accessoires: { casquette: true } },
  etudiant: { nom: "Étudiant", haut: "#f2f2f2", motif: "uni", bas: "#1f2a44", chaussures: "#222222", manches: true, col: true, accessoires: { sac: true } },
  mama: { nom: "Mama en pagne", femme: true, haut: "#e65100", motif: "wax", motifCouleur: "#1b5e20", bas: "#e65100", pagne: true, chaussures: "#5d4037", manches: false, coiffure: "chignons" },
  ville: { nom: "Tenue de ville", haut: "#37474f", motif: "carreaux", motifCouleur: "#90a4ae", bas: "#263238", chaussures: "#1b1b1b", manches: true },
};

export const APPARENCE_DEFAUT = {
  femme: false, teint: TEINTS[2], coiffure: "rasee", barbe: false,
  haut: "#d9822b", motif: "wax", motifCouleur: "#1c6e8c", manches: false, col: false,
  bas: "#2c3e66", pagne: false, chaussures: "#efefea",
  accessoires: { casquette: false, lunettes: false, sac: false, chaine: false },
};

export async function chargerPersonnages() {
  const l = new GLTFLoader();
  const coiffures = Object.values(COIFFURES).filter((c) => c.fichier).map((c) => c.fichier).concat(["Hair_Beard"]);
  const [homme, femme, anims, ...poils] = await Promise.all([
    l.loadAsync(DOSSIER + "Human_Male.gltf"),
    l.loadAsync(DOSSIER + "Human_Female.gltf"),
    l.loadAsync(DOSSIER + "UAL1_Standard.glb"),
    ...coiffures.map((c) => l.loadAsync(DOSSIER + c + ".gltf")),
  ]);
  coiffures.forEach((c, i) => { cache.coiffures[c] = poils[i].scene; });
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

/** Apparence aléatoire mais vraisemblable pour un habitant de Kinshasa (déterministe selon `graine`). */
export function apparenceAleatoire(graine = Math.random() * 1e9) {
  let s = Math.floor(graine) >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const femme = r() < 0.5;
  const hsl = (h, sa, li) => "#" + new THREE.Color().setHSL(h, sa, li).getHexString();
  const motifs = ["uni", "uni", "wax", "rayures", "carreaux"];
  const pagne = femme && r() < 0.5;
  const haut = hsl(r(), 0.35 + r() * 0.55, 0.3 + r() * 0.4);
  return {
    femme, teint: TEINTS[Math.floor(r() * TEINTS.length)],
    coiffure: femme ? ["longue", "chignons", "rasee_f"][Math.floor(r() * 3)] : ["rasee", "rasee", "aucune", "raie"][Math.floor(r() * 4)],
    barbe: !femme && r() < 0.25,
    haut, motif: motifs[Math.floor(r() * motifs.length)], motifCouleur: hsl(r(), 0.7, 0.45),
    manches: r() < 0.3, col: r() < 0.2,
    bas: pagne ? haut : ["#1f2a44", "#2b2b2b", "#8a7a5c", "#34495e", "#4e342e"][Math.floor(r() * 5)],
    pagne, chaussures: ["#1a1410", "#efefea", "#5d4037", "#263238"][Math.floor(r() * 4)],
    accessoires: { casquette: !femme && r() < 0.15, lunettes: r() < 0.1, sac: r() < 0.15, chaine: !femme && r() < 0.1 },
  };
}

/** Crée un personnage animé avec une apparence (voir APPARENCE_DEFAUT). */
export function creerPersonnage(apparence = {}) {
  const ap = { ...APPARENCE_DEFAUT, ...apparence, accessoires: { ...APPARENCE_DEFAUT.accessoires, ...(apparence.accessoires || {}) } };
  const racine = SkeletonUtils.clone(ap.femme ? cache.femme : cache.homme);
  racine.updateMatrixWorld(true);
  const masque = cache.masques[ap.femme ? "femme" : "homme"];
  const u = {
    uMasque: { value: masque }, uPeau: { value: new THREE.Color(ap.teint) }, uHaut: { value: new THREE.Color(ap.haut) },
    uBas: { value: new THREE.Color(ap.bas) }, uChaus: { value: new THREE.Color(ap.chaussures) },
    uMotif: { value: new THREE.Color(ap.motifCouleur) }, uTypeMotif: { value: MOTIFS[ap.motif] ?? 0 },
    uManches: { value: ap.manches ? 1 : 0 }, uCol: { value: ap.col ? 1 : 0 }, uPagne: { value: ap.pagne ? 1 : 0 },
  };
  let tete = null;
  racine.traverse((o) => {
    if (o.isBone && o.name === "Head") tete = o;
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
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vUvP;")
        .replace("#include <uv_vertex>", "#include <uv_vertex>\nvUvP = uv;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec2 vUvP; uniform sampler2D uMasque; uniform vec3 uPeau, uHaut, uBas, uChaus, uMotif;
          uniform float uTypeMotif, uManches, uCol, uPagne;
          vec3 motif(vec3 a, vec3 b, float t, vec2 uv) {
            if (t > 0.5 && t < 1.5) { vec2 g = fract(uv * 26.0) - 0.5; return mix(a, b, 1.0 - smoothstep(0.05, 0.09, abs(length(g) - 0.28))); }
            if (t > 1.5 && t < 2.5) return mix(a, b, step(0.55, fract(uv.y * 40.0)));
            if (t > 2.5) return mix(a, b, 0.45 * (step(0.5, fract(uv.x * 30.0)) + step(0.5, fract(uv.y * 30.0))));
            return a;
          }`)
        .replace("#include <map_fragment>", `#include <map_fragment>
          vec3 mk = texture2D(uMasque, vUvP).rgb;
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float detail = clamp(lum / 0.08, 0.6, 1.4);
          vec3 c = uPeau * detail;
          float manche = step(0.75, mk.g), col = step(0.25, mk.g) * (1.0 - manche);
          if (mk.b > 0.25 && mk.b < 0.75) c = uChaus;
          if (mk.b >= 0.75) c = (uPagne > 0.5 ? motif(uBas, uMotif, 1.0, vUvP) : uBas) * mix(1.0, detail, 0.3);
          if (mk.r > 0.5 || manche * uManches > 0.5 || col * uCol > 0.5) c = motif(uHaut, uMotif, uTypeMotif, vUvP) * mix(1.0, detail, 0.3);
          diffuseColor.rgb = c;`);
    };
    m.customProgramCacheKey = () => "perso2";
    o.material = m;
  });
  // Coiffure, barbe et accessoires accrochés à l'os de la tête ou du buste.
  const attacher = (os, obj) => {
    obj.applyMatrix4(os.matrixWorld.clone().invert());
    os.add(obj);
  };
  const cheveux = 0x14100c;
  const ajouterCoiffure = (fichier) => {
    const src = cache.coiffures[fichier];
    if (!src || !tete) return;
    const h = src.clone(true);
    h.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color?.set(cheveux); o.castShadow = true; } });
    attacher(tete, h);
  };
  if (COIFFURES[ap.coiffure]?.fichier) ajouterCoiffure(COIFFURES[ap.coiffure].fichier);
  if (ap.barbe && !ap.femme) ajouterCoiffure("Hair_Beard");
  if (tete) {
    const pt = new THREE.Vector3().setFromMatrixPosition(tete.matrixWorld);   // position de la tête au repos
    const acc = ap.accessoires;
    const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
    if (acc.casquette) {
      const g = new THREE.Group();
      const calotte = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(ap.motifCouleur));
      const visiere = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.1), mat(ap.motifCouleur));
      visiere.position.set(0, 0.005, 0.12);
      g.add(calotte, visiere);
      g.position.set(pt.x, pt.y + 0.085, pt.z + 0.005);
      attacher(tete, g);
    }
    if (acc.lunettes) {
      const g = new THREE.Group();
      for (const sx of [-0.035, 0.035]) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.028, 0.008), mat(0x0d0d0d, { metalness: 0.5, roughness: 0.1 }));
        v.position.set(sx, 0, 0);
        g.add(v);
      }
      g.position.set(pt.x, pt.y + 0.045, pt.z + 0.105);
      attacher(tete, g);
    }
    let buste = null;
    racine.traverse((o) => { if (o.isBone && o.name === "spine_03") buste = o; });
    if (buste && acc.sac) {
      const sac = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.14), mat(0x2e3b4e));
      const pb = new THREE.Vector3().setFromMatrixPosition(buste.matrixWorld);
      sac.position.set(pb.x, pb.y - 0.05, pb.z - 0.2);
      sac.castShadow = true;
      attacher(buste, sac);
    }
    if (buste && acc.chaine) {
      const ch = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 6, 24), mat(0xe6b422, { metalness: 0.9, roughness: 0.25 }));
      const pb = new THREE.Vector3().setFromMatrixPosition(buste.matrixWorld);
      ch.position.set(pb.x, pb.y + 0.1, pb.z + 0.06);
      ch.rotation.x = Math.PI / 2.3;
      attacher(buste, ch);
    }
  }
  const objet = new THREE.Group();
  racine.rotation.y = Math.PI;               // modèle tourné vers -Z (avant du jeu)
  objet.add(racine);
  const melangeur = new THREE.AnimationMixer(racine);
  const actions = {};
  for (const [nom, clip] of Object.entries(cache.clips)) actions[nom] = melangeur.clipAction(clip);
  let courante = null, nomCourant = "";
  return {
    objet,
    apparence: ap,
    get anim() { return nomCourant; },
    jouer(nom, fondu = 0.25, vitesse = 1, decalage = 0) {
      const a = actions[nom];
      if (!a) return;
      a.timeScale = vitesse;
      if (courante === a) return;
      a.reset();
      if (decalage) a.time = decalage % a.getClip().duration;
      a.fadeIn(fondu).play();
      if (courante) courante.fadeOut(fondu);
      courante = a;
      nomCourant = nom;
    },
    /** Joue une animation une seule fois puis revient à `ensuite`. */
    unique(nom, ensuite = "Idle", vitesse = 1) {
      const a = actions[nom];
      if (!a) return 0;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      this.jouer(nom, 0.15, vitesse);
      const duree = a.getClip().duration / vitesse;
      setTimeout(() => { if (courante === a) this.jouer(ensuite, 0.25); }, duree * 1000);
      return duree;
    },
    mettreAJour(dt) { melangeur.update(dt); },
    liberer() { melangeur.stopAllAction(); melangeur.uncacheRoot(racine); },
  };
}

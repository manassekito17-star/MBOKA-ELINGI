// Post-traitement (qualité « haute » uniquement, pour les PC à carte graphique) :
//  - occlusion ambiante à l'écran (GTAO) : coins, pieds de murs, dessous des toits plus sombres ;
//  - halo des lumières (bloom), surtout la nuit (lampadaires, phares, fenêtres allumées) ;
//  - anticrénelage SMAA ; puis tonalité ACES et sRGB (OutputPass).
// Désactivable avec ?post=0. Chargé dynamiquement : rien n'est téléchargé en qualité basse ou moyenne.
import * as THREE from "three";

export async function creerPostTraitement(renderer, scene, camera) {
  const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { SMAAPass }, { OutputPass }] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/GTAOPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/SMAAPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ]);
  const w = innerWidth, h = innerHeight;
  const cible = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, cible);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, w, h);
  ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 });
  ao.blendIntensity = 0.85;
  // Le ciel, les nuages et les objets transparents ne doivent pas recevoir d'occlusion
  // (sinon une bande claire apparaît dans le ciel) : on les masque pendant le calcul.
  const masquer = ao.overrideVisibility.bind(ao);
  ao.overrideVisibility = () => {
    masquer();
    scene.traverse((o) => { if (o.userData.sansAO || o.material?.transparent || o.isSprite) o.visible = false; });
  };
  composer.addPass(ao);
  const halo = new UnrealBloomPass(new THREE.Vector2(w, h), 0.25, 0.5, 0.92);
  composer.addPass(halo);
  composer.addPass(new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio()));
  composer.addPass(new OutputPass());
  return {
    rendre(nuit) {
      halo.strength = nuit ? 0.55 : 0.18;
      halo.threshold = nuit ? 0.75 : 0.95;
      composer.render();
    },
    taille(l, ht) { composer.setSize(l, ht); },
  };
}

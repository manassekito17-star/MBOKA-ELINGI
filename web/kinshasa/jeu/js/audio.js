// Ambiance sonore synthétisée en direct (Web Audio) : aucun fichier à télécharger.
// Rumeur de la ville, klaxons lointains, moteur (selon la vitesse), pluie.
export class Audio {
  constructor() {
    this.ctx = null;
    this.actif = false;
  }

  /** Doit être appelé après un geste de l'utilisateur (règle des navigateurs). */
  demarrer() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.maitre = ctx.createGain();
    this.maitre.gain.value = 0.6;
    this.maitre.connect(ctx.destination);
    const bruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = bruit.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
    const source = (gain, freq, type) => {
      const s = ctx.createBufferSource();
      s.buffer = bruit; s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain;
      s.connect(f).connect(g).connect(this.maitre);
      s.start();
      return g;
    };
    this.ville = source(0.35, 500, "lowpass");
    this.pluie = source(0, 3000, "highpass");
    this.moteurOsc = ctx.createOscillator();
    this.moteurOsc.type = "sawtooth";
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 400;
    this.moteur = ctx.createGain(); this.moteur.gain.value = 0;
    this.moteurOsc.connect(f).connect(this.moteur).connect(this.maitre);
    this.moteurOsc.start();
    this.actif = true;
  }

  klaxon(distance = 100) {
    if (!this.actif) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "square"; o.frequency.value = 380 + Math.random() * 120;
    const v = Math.min(0.12, 6 / distance);
    g.gain.setValueAtTime(v, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(this.maitre);
    o.start(); o.stop(ctx.currentTime + 0.4);
  }

  /** Sirène (police, ambulance) : intensité 0..1 selon la distance. */
  sirene(intensite) {
    if (!this.actif) return;
    const ctx = this.ctx;
    if (!this.sireneOsc) {
      this.sireneOsc = ctx.createOscillator();
      this.sireneOsc.type = "triangle";
      this.sireneGain = ctx.createGain();
      this.sireneGain.gain.value = 0;
      this.sireneOsc.connect(this.sireneGain).connect(this.maitre);
      this.sireneOsc.start();
    }
    const t = ctx.currentTime;
    this.sireneGain.gain.setTargetAtTime(0.08 * intensite, t, 0.2);
    this.sireneOsc.frequency.setTargetAtTime(Math.floor(t * 1.5) % 2 ? 720 : 960, t, 0.05);
  }

  mettreAJour(dt, { enVoiture, regime, pluie, nuit }) {
    if (!this.actif) return;
    const t = this.ctx.currentTime;
    this.ville.gain.setTargetAtTime(0.35 * (1 - 0.6 * nuit), t, 0.5);
    this.pluie.gain.setTargetAtTime(0.5 * pluie, t, 0.5);
    this.moteur.gain.setTargetAtTime(enVoiture ? 0.06 + 0.06 * regime : 0, t, 0.1);
    this.moteurOsc.frequency.setTargetAtTime(45 + regime * 140, t, 0.1);
    if (Math.random() < dt * 0.15 * (1 - nuit)) this.klaxon(60 + Math.random() * 200);
  }

  basculer() {
    if (!this.ctx) return this.demarrer();
    this.maitre.gain.value = this.maitre.gain.value > 0 ? 0 : 0.6;
  }
}

// Menu pause : chaque bouton appelle une vraie fonction du jeu (rien de décoratif).
// Le jeu est réellement en pause pendant que le menu est ouvert (simulation, physique, heure).
import { ACTIONS, nomTouche, nomBoutonManette } from "./controles.js";
import { CATEGORIES } from "./minicarte.js";
import { fc } from "./hud.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const PEINTURES = [0xf2f2f2, 0x1b1c1e, 0x8d9196, 0x7a1515, 0x1d3a6b, 0x2e7d32, 0xf6c21c, 0xd84315, 0x6a1b9a, 0x00838f];
const hex = (n) => "#" + n.toString(16).padStart(6, "0");

export function creerMenu(ctx) {
  const menu = $("menu"), contenu = $("menu-contenu");
  let onglet = null, sousOnglet = "commandes", vueCarte = null;

  let lieuChoisi = null, inventaire = null;
  function ouvrir(o = "reprendre", sel = null) {
    if (!ctx.peutOuvrir()) return;
    menu.hidden = false;
    ctx.pause(true);
    document.exitPointerLock?.();
    if (sel) lieuChoisi = sel;
    afficher(o === "reprendre" ? "carte" : o);
  }
  function fermer() {
    menu.hidden = true;
    ctx.pause(false);
    vueCarte = null;
  }
  const ouvert = () => !menu.hidden;

  menu.querySelector(".menu-onglets").addEventListener("click", (e) => {
    const b = e.target.closest("[data-onglet]");
    if (!b) return;
    if (b.dataset.onglet === "reprendre") fermer(); else afficher(b.dataset.onglet);
  });

  function infos() {
    $("menu-infos").innerHTML = `<b style="color:#7ee07e;font-size:20px">${fc(ctx.etat.argent)}</b> · banque ${fc(ctx.etat.banque)}<br>${esc(ctx.env.heureTexte())} · ${esc(ctx.zoneNom)}`;
    $("menu-pied").innerHTML = `<span><kbd>Échap</kbd> reprendre</span><span><kbd>Retour arrière</kbd> / B : retour</span><span>Pause : le temps, la circulation et la physique sont arrêtés.</span>`;
  }

  function afficher(o) {
    onglet = o;
    for (const b of menu.querySelectorAll("[data-onglet]")) b.classList.toggle("actif", b.dataset.onglet === o);
    infos();
    vueCarte = null;
    contenu.onclick = null;
    ({ carte: ongletCarte, lieux: ongletLieux, personnage: ongletPersonnage, vehicules: ongletVehicules, missions: ongletMissions, transports: ongletTransports,
      zones: ongletZones, parametres: ongletParametres, sauvegarde: ongletSauvegarde, quitter: ongletQuitter }[o] || ongletCarte)();
  }

  // --- Lieux remarquables : fiche de chaque bâtiment modélisé individuellement ------------
  const STATUTS = { photo: "photo", osm: "OSM", satellite: "satellite", estime: "estimé", deduit: "déduit", absent: "absent" };
  function ongletLieux() {
    const tous = ctx.registre.batiments;
    if (!tous.length) { contenu.innerHTML = `<p class="note">Aucun bâtiment remarquable n'est encore modélisé.</p>`; return; }
    const p = ctx.positionJoueur();
    const ici = (b) => ctx.remarquables.liste.find((x) => x.id === b.id);
    if (!tous.some((b) => b.id === lieuChoisi)) lieuChoisi = (tous.find((b) => ici(b)) || tous[0]).id;
    const b = tous.find((x) => x.id === lieuChoisi), r = ici(b);
    const photos = (b.references || []).map((id) => ctx.registre.photos.find((ph) => ph.id === id)).filter(Boolean);
    const dist = r ? Math.round(Math.hypot(r.x - p.x, r.z - p.z)) : null;
    contenu.innerHTML = `<div class="lieux-grille">
      <div class="lieux-liste">${tous.map((x) => `<button class="btn ${x.id === lieuChoisi ? "principal" : ""}" data-lieu-fiche="${x.id}">
        <b>${esc(x.nom_courant)}</b><small>${esc(x.categorie_libelle)} · ${esc(x.commune)}${ici(x) ? "" : " · autre zone"}</small></button>`).join("")}
        <p class="note">Bâtiments reproduits un par un d'après des références vérifiables. Les autres bâtiments de la ville gardent leur forme réelle (empreinte), avec une apparence générique.</p>
        <div class="note" id="inventaire-resume">Inventaire de la ville…</div></div>
      <div class="fiche fiche-lieu">
        <h3>${esc(b.nom_courant)}</h3>
        <p class="sous-titre">${esc(b.nom_officiel)}${b.autres_noms?.length ? " · " + esc(b.autres_noms.join(" · ")) : ""}</p>
        <div class="ligne"><span>Catégorie</span><b>${esc(b.categorie_libelle)}</b></div>
        <div class="ligne"><span>Adresse</span><b>${esc(b.adresse)}</b></div>
        <div class="ligne"><span>Commune</span><b>${esc(b.commune)}, Kinshasa</b></div>
        <div class="ligne"><span>Coordonnées GPS</span><b>${b.gps.lat.toFixed(5)}, ${b.gps.lon.toFixed(5)}</b></div>
        ${dist !== null ? `<div class="ligne"><span>Distance</span><b>${dist >= 1000 ? (dist / 1000).toFixed(1).replace(".", ",") + " km" : dist + " m"}</b></div>` : ""}
        <div class="ligne"><span>Vérifié le</span><b>${esc(b.date_verification)}</b></div>
        <p>${esc(b.description)}</p>
        <div>${r ? `<button class="btn principal" data-lieu-gps="${b.id}">Destination GPS</button>` : `<button class="btn principal" data-lieu-aller="${b.id}">Y aller (zone ${esc(b.zone)})</button>`}
          ${r?.objet ? `<button class="btn" data-lieu-voir="${b.id}">Regarder le bâtiment</button>` : ""}
          ${b.modele ? `<a class="btn" href="visionneuse.html?id=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">Modèle 3D et comparaison</a>` : ""}</div>
        <h4>Fidélité : <span class="niveau ${esc(b.fidelite.niveau)}">${esc(b.fidelite.niveau)}</span></h4>
        <p class="note">${esc(b.fidelite.resume)}</p>
        <ul class="elements">${b.fidelite.elements.map((e) => `<li><span class="statut ${esc(e.statut)}">${STATUTS[e.statut] || esc(e.statut)}</span>${esc(e.element)}</li>`).join("")}</ul>
        ${(b.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join("")}
        <h4>Photos de référence</h4>
        ${photos.length ? `<div class="refs">${photos.map((ph) => `<figure><img src="${esc(ph.fichier)}" alt="${esc(ph.montre)}" loading="lazy">
          <figcaption><a href="${esc(ph.page)}" target="_blank" rel="noopener">${esc(ph.auteur)}</a>, ${esc(ph.licence)}, ${esc(ph.date)}</figcaption></figure>`).join("")}</div>`
          : `<p class="note">Aucune photo sous licence libre trouvée pour ce bâtiment : son apparence n'est pas vérifiée.</p>`}
        <h4>Sources</h4>
        <ul class="sources">${b.sources.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, "").slice(0, 70))}</a></li>`).join("")}</ul>
      </div></div>`;
    // Inventaire automatique (Overture) : ce qui reste à reproduire, par ordre de priorité.
    (inventaire ||= fetch("donnees/inventaire_batiments.json").then((r) => r.json()).catch(() => null)).then((inv) => {
      const el = $("inventaire-resume");
      if (!el) return;
      if (!inv) { el.textContent = ""; return; }
      el.innerHTML = `<b>Inventaire de Kinshasa</b> (${inv.lieux.length} lieux, Overture Maps) :<br>` +
        Object.entries(inv.resume).map(([k, v]) => `${v.priorite}. ${esc(k)} : ${v.modelises} / ${v.total}`).join("<br>");
    });
    contenu.onclick = (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.lieuFiche) { lieuChoisi = t.dataset.lieuFiche; ongletLieux(); }
      if (t.dataset.lieuGps) { ctx.allerVers(b); ongletLieux(); }
      if (t.dataset.lieuAller) ctx.allerVers(b);
      if (t.dataset.lieuVoir) ctx.regarderBatiment(r);
    };
  }

  // --- Carte de la zone (vraies données), destination GPS au clic ---------------------
  function ongletCarte() {
    const p = ctx.positionJoueur();
    contenu.innerHTML = `<div class="carte-grille"><canvas id="grande-carte"></canvas><div class="legende">
      <p class="note">Glisser : déplacer · molette / pincer ou +/− : zoom · <b>clic : destination GPS</b></p>
      <div><button class="btn" data-z="1">+</button><button class="btn" data-z="-1">−</button><button class="btn" data-recentrer>Me centrer</button>
      ${ctx.gps.dest ? `<button class="btn danger" data-effacer-gps>Effacer la destination</button>` : ""}</div>
      ${Object.entries(CATEGORIES).map(([k, c]) => `<label><input type="checkbox" data-filtre="${k}" ${ctx.carte.filtres[k] ? "checked" : ""}><span class="pastille" style="background:${c.couleur}">${c.glyphe}</span>${c.nom}</label>`).join("")}
      <label><input type="checkbox" data-filtre="bus" ${ctx.carte.filtres.bus ? "checked" : ""}><span class="pastille" style="background:#1565c0">B</span>Arrêts de bus (bleu : réels, gris : simulés)</label>
      <label><span class="pastille" style="background:#2e7d32">🚗</span>Vos véhicules</label>
      <p class="note">Routes, bâtiments, eau et lieux : données réelles (OpenStreetMap / Overture). Trafic et arrêts « simulés » : simulés.</p>
      <div id="recherche-lieux"><input id="cherche-lieu" placeholder="Chercher un lieu de la zone…" style="width:100%;padding:6px;border-radius:6px;border:1px solid #444;background:#222;color:#eee">
      <div id="resultats-lieux"></div></div></div></div>`;
    const cv = $("grande-carte");
    vueCarte = { cx: p.x, cz: p.z, echelle: 0.35 };
    const dessiner = () => {
      if (!vueCarte) return;
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.max(10, r.width * dpr); cv.height = Math.max(10, r.height * dpr);
      ctx.carte.dessiner(cv.getContext("2d"), cv.width, cv.height, { cx: vueCarte.cx, cz: vueCarte.cz, angle: 0, echelle: vueCarte.echelle * dpr,
        joueur: { ...ctx.positionJoueur(), cap: ctx.capJoueur() }, gps: ctx.gps, flotte: ctx.flotte, destination: ctx.gps.dest, mission: ctx.cibleMission(), nordEnHaut: true, grande: true });
    };
    requestAnimationFrame(dessiner);
    const vers = (ex, ey) => {
      const r = cv.getBoundingClientRect();
      return { x: vueCarte.cx + (ex - r.left - r.width / 2) / vueCarte.echelle, z: vueCarte.cz + (ey - r.top - r.height / 2) / vueCarte.echelle };
    };
    let glisse = null, bouge = 0;
    const pointeurs = new Map();
    cv.addEventListener("pointerdown", (e) => { try { cv.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } pointeurs.set(e.pointerId, [e.clientX, e.clientY]); glisse = [e.clientX, e.clientY]; bouge = 0; });
    cv.addEventListener("pointermove", (e) => {
      if (!pointeurs.has(e.pointerId)) return;
      const avant = pointeurs.get(e.pointerId);
      pointeurs.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointeurs.size === 2) {           // pincer pour zoomer
        const [a, b] = [...pointeurs.values()];
        const autre = [...pointeurs.entries()].find(([id]) => id !== e.pointerId)[1];
        const d1 = Math.hypot(avant[0] - autre[0], avant[1] - autre[1]), d2 = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d1 > 0) vueCarte.echelle = Math.max(0.05, Math.min(4, vueCarte.echelle * d2 / d1));
        bouge += 10;
      } else if (glisse) {
        vueCarte.cx -= (e.clientX - glisse[0]) / vueCarte.echelle;
        vueCarte.cz -= (e.clientY - glisse[1]) / vueCarte.echelle;
        bouge += Math.abs(e.clientX - glisse[0]) + Math.abs(e.clientY - glisse[1]);
        glisse = [e.clientX, e.clientY];
      }
      dessiner();
    });
    cv.addEventListener("pointerup", (e) => {
      pointeurs.delete(e.pointerId);
      if (bouge < 6 && glisse) {
        const q = vers(e.clientX, e.clientY);
        const nom = ctx.carte.rueProche(q.x, q.z) || "Point choisi sur la carte";
        ctx.gps.definir(q.x, q.z, nom);
        ctx.notifier(`Destination GPS : ${nom}`, { type: "info" });
        ongletCarte();
        return;
      }
      glisse = null;
    });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); vueCarte.echelle = Math.max(0.05, Math.min(4, vueCarte.echelle * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); dessiner(); }, { passive: false });
    contenu.querySelector(".legende").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b?.dataset.z) { vueCarte.echelle = Math.max(0.05, Math.min(4, vueCarte.echelle * (b.dataset.z === "1" ? 1.4 : 1 / 1.4))); dessiner(); }
      if (b && "recentrer" in b.dataset) { const p2 = ctx.positionJoueur(); vueCarte.cx = p2.x; vueCarte.cz = p2.z; dessiner(); }
      if (b && "effacerGps" in b.dataset) { ctx.gps.effacer(); ongletCarte(); }
      const r = e.target.closest("[data-lieu]");
      if (r) { const [x, z, n] = JSON.parse(r.dataset.lieu); ctx.gps.definir(x, z, n); ctx.notifier(`Destination GPS : ${n}`, { type: "info" }); ongletCarte(); }
    });
    contenu.querySelector(".legende").addEventListener("change", (e) => {
      const f = e.target.dataset.filtre;
      if (f) { ctx.carte.filtres[f] = e.target.checked; dessiner(); }
    });
    $("cherche-lieu").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const res = q.length < 2 ? [] : ctx.carte.lieux.filter((l) => l.n.toLowerCase().includes(q)).slice(0, 8);
      $("resultats-lieux").innerHTML = res.map((l) => `<button class="btn" style="display:block;width:100%;text-align:left" data-lieu='${esc(JSON.stringify([l.x, l.z, l.n]))}'>${esc(l.n)}</button>`).join("");
    });
  }

  // --- Personnage : éditeur (existant) + statistiques réelles ---------------------------
  function ongletPersonnage() {
    const j = ctx.joueur, s = ctx.stats;
    contenu.innerHTML = `<div class="cartes" style="grid-template-columns:minmax(260px,1fr) minmax(300px,2fr)">
      <div class="fiche"><h3>Statistiques</h3>
        ${[["Santé", `${Math.round(j.sante)} %`], ["Endurance", `${Math.round(j.endurance)} %`], ["Argent liquide", fc(ctx.etat.argent)], ["Compte en banque", fc(ctx.etat.banque)],
          ["Distance à pied", `${(s.pied / 1000).toFixed(2)} km`], ["Distance en véhicule", `${(s.vehicule / 1000).toFixed(2)} km`],
          ["Missions réussies", ctx.missions.stats.reussies], ["Missions échouées", ctx.missions.stats.echouees], ["Gains des missions", fc(ctx.missions.stats.gains)],
          ["Temps de jeu", `${Math.floor(s.temps / 60)} min`]].map(([a, b]) => `<div class="ligne"><span>${a}</span><b>${b}</b></div>`).join("")}
      </div><div class="fiche" id="hote-editeur"></div></div>`;
    ctx.monterEditeur($("hote-editeur"));
  }

  // --- Véhicules : caractéristiques, état, GPS, repeindre, remorquage (payant, différé) ---
  function ongletVehicules() {
    const p = ctx.positionJoueur();
    contenu.innerHTML = `<p class="note">Vos véhicules sont garés dans la ville : on ne les fait pas apparaître d'un coup. Utilisez le GPS pour les rejoindre,
      ou la dépanneuse (payante, livraison après 1 min 30 de jeu).</p><div class="cartes">${ctx.flotte.map((v, i) => {
      const t = ctx.TYPES[v.type], q = v.position(), d = Math.hypot(q.x - p.x, q.z - p.z), conduit = ctx.etat.vehicule === v;
      const remorque = ctx.remorquages.find((r) => r.v === v);
      return `<div class="fiche"><h3><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${hex(v.couleur)};margin-right:6px;vertical-align:middle"></span>${esc(t.nom)}</h3>
        ${[["Vitesse maximale", `${Math.round(t.vmax * 3.6)} km/h`], ["Masse", `${t.masse.toLocaleString("fr-FR")} kg`], ["Places", ctx.PLACES[v.type].length],
          ["Carburant", `${Math.round(v.carburant * 100)} %`], ["État mécanique", `${Math.round(v.sante)} %`], ["Compteur", `${(v.odometre / 1000).toFixed(1)} km`],
          ["Distance", conduit ? "vous le conduisez" : `${Math.round(d)} m`]].map(([a, b]) => `<div class="ligne"><span>${a}</span><b>${b}</b></div>`).join("")}
        <div>${conduit ? "" : `<button class="btn" data-gps="${i}">Itinéraire GPS</button>`}
        ${conduit || d < 60 || remorque ? "" : `<button class="btn" data-remorquer="${i}" ${ctx.etat.argent < 15000 ? "disabled" : ""}>Dépanneuse (${fc(15000)})</button>`}
        ${remorque ? `<span class="note">Dépanneuse en route : ${Math.ceil(remorque.t)} s</span>` : ""}</div>
        <p class="note">Repeindre (${fc(25000)}, à moins de 15 m du véhicule) :</p>
        <div class="couleurs">${PEINTURES.map((c) => `<button title="Repeindre" data-peindre="${i}:${c}" style="background:${hex(c)}" ${d > 15 && !conduit ? "disabled" : ""}></button>`).join("")}</div>
      </div>`;
    }).join("")}</div>`;
    contenu.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.gps) { const v = ctx.flotte[+b.dataset.gps], q = v.position(); ctx.gps.definir(q.x, q.z, ctx.TYPES[v.type].nom); ctx.notifier(`GPS : ${ctx.TYPES[v.type].nom}`, { type: "info" }); ongletVehicules(); }
      if (b.dataset.remorquer) { ctx.remorquer(ctx.flotte[+b.dataset.remorquer]); ongletVehicules(); }
      if (b.dataset.peindre) {
        const [i, c] = b.dataset.peindre.split(":").map(Number);
        if (ctx.etat.argent < 25000) { ctx.notifier("Pas assez d'argent pour repeindre.", { type: "alerte" }); return; }
        ctx.etat.argent -= 25000;
        ctx.flotte[i].repeindre(c);
        ctx.notifier(`${ctx.TYPES[ctx.flotte[i].type].nom} repeint : ${fc(25000)}`, { type: "succes" });
        ctx.sauvegarder(true);
        ongletVehicules();
      }
    };
  }

  // --- Missions --------------------------------------------------------------------------
  function ongletMissions() {
    const m = ctx.missions, p = ctx.positionJoueur(), typeV = ctx.etat.vehicule?.type ?? null;
    if (!m.offres.length) m.proposer(p.x, p.z, typeV);
    const a = m.active;
    contenu.innerHTML = `${a ? `<div class="fiche" style="border-color:rgba(242,178,51,.6)"><h3>Mission en cours : ${esc(a.titre)}</h3>
        <p>${esc(a.etapes[a.i].texte)}</p><p>Temps restant : <b>${Math.ceil(a.restant)} s</b> · Récompense : <b>${fc(a.recompense)}</b></p>
        <button class="btn" data-gps-mission>Itinéraire GPS</button><button class="btn danger" data-abandonner>Abandonner</button></div>` : ""}
      <h3 style="color:#f2b233">Missions proposées autour de vous</h3>
      <p class="note">Destinations : lieux réels de la zone. Clients, délais et récompenses : éléments de jeu.</p>
      <div class="cartes">${m.offres.map((o, i) => {
        const ok = m.possible(o, typeV);
        return `<div class="fiche"><h3>${esc(o.titre)}</h3>${o.etapes.map((e) => `<p>• ${esc(e.texte)}</p>`).join("")}
          <div class="ligne"><span>Récompense</span><b>${fc(o.recompense)}</b></div><div class="ligne"><span>Délai</span><b>${Math.floor(o.delai / 60)} min ${o.delai % 60} s</b></div>
          ${ok.ok ? "" : `<p class="raison">${esc(ok.raison)}</p>`}
          <button class="btn principal" data-demarrer="${i}" ${!ok.ok || a ? "disabled" : ""}>Démarrer</button></div>`;
      }).join("")}</div>
      <button class="btn" data-actualiser>Nouvelles propositions</button>`;
    contenu.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.demarrer) { ctx.demarrerMission(m.offres[+b.dataset.demarrer]); fermer(); }
      if ("abandonner" in b.dataset) { ctx.abandonnerMission(); ongletMissions(); }
      if ("gpsMission" in b.dataset) { ctx.guiderMission(); fermer(); }
      if ("actualiser" in b.dataset) { m.proposer(p.x, p.z, typeV); ongletMissions(); }
    };
  }

  function ongletTransports() { contenu.innerHTML = `<div id="hote-transports"></div>`; ctx.monterTransports($("hote-transports")); }
  function ongletZones() { contenu.innerHTML = `<div id="hote-zones"></div>`; ctx.monterZones($("hote-zones")); }

  // --- Paramètres : commandes, graphismes, audio, tactile -------------------------------
  function ongletParametres() {
    contenu.innerHTML = `<div class="sous-onglets">${[["commandes", "Commandes"], ["manette", "Manette"], ["graphismes", "Graphismes"], ["audio", "Audio"], ["tactile", "Écran tactile"], ["aide", "Aide et données"]]
      .map(([k, n]) => `<button class="btn ${sousOnglet === k ? "principal" : ""}" data-sous="${k}">${n}</button>`).join("")}</div><div id="sous-contenu"></div>`;
    contenu.onclick = (e) => { const b = e.target.closest("[data-sous]"); if (b) { sousOnglet = b.dataset.sous; ongletParametres(); } };
    const sc = $("sous-contenu");
    if (sousOnglet === "commandes") {
      sc.innerHTML = `<p class="note">Cliquez sur « Modifier » puis appuyez sur la nouvelle touche. Les réglages sont enregistrés dans ce navigateur.</p>
        <table class="tableau-touches">${Object.entries(ACTIONS).map(([k, a]) => `<tr><td>${esc(a.nom)}</td><td>${ctx.ctl.carte[k].map((c) => `<kbd>${esc(nomTouche(c))}</kbd>`).join("")}</td>
        <td><button class="btn" data-modifier="${k}">Modifier</button></td></tr>`).join("")}</table>
        <button class="btn danger" data-reinit>Rétablir les touches par défaut</button>`;
      sc.onclick = (e) => {
        const b = e.target.closest("button");
        if (b?.dataset.modifier) {
          b.textContent = "Appuyez sur une touche…";
          ctx.ctl.capturer((code) => { if (code !== "Escape") ctx.ctl.assigner(b.dataset.modifier, code); ongletParametres(); });
        }
        if (b && "reinit" in b.dataset) { ctx.ctl.reinitialiser(); ongletParametres(); }
      };
    } else if (sousOnglet === "manette") {
      sc.innerHTML = `<p class="note">${ctx.ctl.manette.connectee ? "Manette détectée." : "Aucune manette détectée : branchez-la puis appuyez sur un bouton."} Disposition standard (Xbox / PlayStation) :</p>
        <table class="tableau-touches"><tr><td>Joystick gauche</td><td>Se déplacer · diriger</td></tr><tr><td>Joystick droit</td><td>Caméra</td></tr>
        <tr><td>RT / R2 · LT / L2</td><td>Accélérer · freiner / reculer</td></tr>
        ${Object.entries(ACTIONS).filter(([, a]) => a.manette !== undefined).map(([, a]) => `<tr><td><kbd>${esc(nomBoutonManette(a.manette))}</kbd></td><td>${esc(a.nom)}</td></tr>`).join("")}</table>`;
    } else if (sousOnglet === "graphismes") {
      sc.innerHTML = `
        <div class="reglage"><span>Qualité (recharge la zone)</span><select id="r-qualite">${["basse", "moyenne", "haute"].map((q) => `<option ${q === ctx.qualite ? "selected" : ""}>${q}</option>`).join("")}</select><button class="btn" data-appliquer-qualite>Appliquer</button></div>
        <div class="reglage"><span>Champ de vision</span><input type="range" id="r-fov" min="50" max="90" value="${ctx.camera.fov}"><b id="v-fov">${ctx.camera.fov}°</b></div>
        <div class="reglage"><span>Ombres</span><select id="r-ombres"><option value="1" ${ctx.ombres() ? "selected" : ""}>activées</option><option value="0" ${ctx.ombres() ? "" : "selected"}>désactivées</option></select><span></span></div>
        <div class="reglage"><span>Densité de circulation (simulée)</span><select id="r-trafic">${["faible", "moyenne", "intense"].map((n, i) => `<option value="${i}" ${ctx.sim.niveau === i ? "selected" : ""}>${n}</option>`).join("")}</select><span></span></div>
        <p class="note">Qualité « haute » : occlusion ambiante, halo et anticrénelage (PC avec carte graphique). « Basse » : téléphone.</p>`;
      $("r-fov").oninput = (e) => { ctx.camera.fov = +e.target.value; ctx.camera.updateProjectionMatrix(); $("v-fov").textContent = e.target.value + "°"; ctx.reglages.fov = +e.target.value; ctx.enregistrerReglages(); };
      $("r-ombres").onchange = (e) => { ctx.ombres(e.target.value === "1"); ctx.reglages.ombres = e.target.value === "1"; ctx.enregistrerReglages(); };
      $("r-trafic").onchange = (e) => { ctx.sim.niveau = +e.target.value; };
      sc.querySelector("[data-appliquer-qualite]").onclick = () => { ctx.sauvegarder(true); ctx.reglages.qualite = $("r-qualite").value; ctx.enregistrerReglages(); location.href = `?zone=${ctx.zone}&qualite=${$("r-qualite").value}`; };
    } else if (sousOnglet === "audio") {
      const a = ctx.audio;
      sc.innerHTML = `<div class="reglage"><span>Volume général</span><input type="range" id="r-vol" min="0" max="100" value="${Math.round(ctx.reglages.volume * 100)}"><b id="v-vol">${Math.round(ctx.reglages.volume * 100)} %</b></div>
        <div class="reglage"><span>Ambiance de la ville</span><input type="range" id="r-amb" min="0" max="100" value="${Math.round(ctx.reglages.ambiance * 100)}"><b id="v-amb">${Math.round(ctx.reglages.ambiance * 100)} %</b></div>
        <p class="note">Sons synthétisés en direct : rumeur de la ville, moteur, klaxons, pluie, sirènes. ${a.actif ? "" : "Le son démarre au premier clic ou à la première touche."}</p>`;
      $("r-vol").oninput = (e) => { ctx.reglages.volume = e.target.value / 100; $("v-vol").textContent = e.target.value + " %"; ctx.appliquerAudio(); ctx.enregistrerReglages(); };
      $("r-amb").oninput = (e) => { ctx.reglages.ambiance = e.target.value / 100; $("v-amb").textContent = e.target.value + " %"; ctx.appliquerAudio(); ctx.enregistrerReglages(); };
    } else if (sousOnglet === "tactile") {
      sc.innerHTML = `<p class="note">${ctx.mobile ? "Déplacez les boutons du téléphone où vous voulez et réglez leur taille." : "Ces réglages concernent les écrans tactiles (téléphone, tablette)."}</p>
        <div class="reglage"><span>Taille des boutons</span><input type="range" id="r-taille" min="44" max="84" value="${ctx.reglages.tailleBoutons}"><b id="v-taille">${ctx.reglages.tailleBoutons} px</b></div>
        <button class="btn principal" data-editer ${ctx.mobile ? "" : "disabled"}>Modifier la disposition</button><button class="btn" data-reinit-tactile>Disposition par défaut</button>`;
      $("r-taille").oninput = (e) => { ctx.reglages.tailleBoutons = +e.target.value; $("v-taille").textContent = e.target.value + " px"; ctx.appliquerTactile(); ctx.enregistrerReglages(); };
      sc.onclick = (e) => {
        const b = e.target.closest("button");
        if (b && "editer" in b.dataset && !b.disabled) { fermer(); ctx.editerTactile(); }
        if (b && "reinitTactile" in b.dataset) { ctx.reglages.positions = {}; ctx.appliquerTactile(); ctx.enregistrerReglages(); ctx.notifier("Disposition tactile par défaut rétablie.", { type: "info" }); }
      };
    } else {
      sc.innerHTML = `<div class="fiche"><h3>Données : réelles, simulées, estimées</h3><p class="note">${$("attribution").textContent}</p>
        <p>Bâtiments, routes et noms de rues, lieux, lignes de bus cartographiées, arrêts nommés, passages piétons et feux cartographiés : <b>réels</b> (OpenStreetMap / Overture).</p>
        <p>Circulation, piétons, feux non cartographiés, lignes de minibus M1, G1, G2, C1, C2, K1, K2, horaires, prix, missions et clients : <b>simulés</b>.</p>
        <p>Hauteur de la plupart des bâtiments, style des bâtiments, espèces et position de certains arbres, murs de clôture : <b>estimés</b>.</p></div>`;
    }
  }

  function ongletSauvegarde() {
    const s = ctx.derniereSauvegarde();
    contenu.innerHTML = `<div class="fiche"><h3>Sauvegarde (${esc(ctx.zoneNom)})</h3>
      <p>Sauvegarde automatique toutes les 15 s. Dernière sauvegarde : <b>${s ? new Date(s).toLocaleTimeString("fr-FR") : "aucune"}</b>.</p>
      <p class="note">Enregistré dans ce navigateur : position, argent, banque, véhicules (position, carburant, état, compteur, couleur), heure, météo, statistiques.</p>
      <button class="btn principal" data-sauver>Sauvegarder maintenant</button>
      <button class="btn" data-charger>Recharger la dernière sauvegarde</button>
      <button class="btn danger" data-nouvelle>Nouvelle partie dans cette zone</button></div>`;
    contenu.onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if ("sauver" in b.dataset) { ctx.sauvegarder(false); ongletSauvegarde(); }
      if ("charger" in b.dataset) location.href = `?zone=${ctx.zone}`;
      if ("nouvelle" in b.dataset && confirm("Effacer la sauvegarde de cette zone et recommencer ?")) { ctx.effacerSauvegarde(); location.href = `?zone=${ctx.zone}&nouveau=1`; }
    };
  }

  function ongletQuitter() {
    contenu.innerHTML = `<div class="fiche"><h3>Quitter la partie</h3><p>La partie est sauvegardée avant de quitter.</p>
      <button class="btn principal" data-carte>Retour à la carte satellite de Kinshasa</button><button class="btn" data-annuler>Annuler</button></div>`;
    contenu.onclick = (e) => {
      const b = e.target.closest("button");
      if (b && "carte" in b.dataset) { ctx.sauvegarder(true); location.href = ctx.lienCarte(); }
      if (b && "annuler" in b.dataset) fermer();
    };
  }

  /** Rafraîchit l'onglet ouvert (ex. compte à rebours de la dépanneuse). */
  function rafraichir() { if (ouvert() && onglet === "vehicules") ongletVehicules(); }

  return { ouvrir, fermer, ouvert, afficher, rafraichir, onglet: () => onglet };
}

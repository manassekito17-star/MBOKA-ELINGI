/* Kinshasa 3D — jumeau numérique (visionneuse web).
 * Données réelles uniquement : OpenStreetMap, Overture Maps, Google Open Buildings,
 * Copernicus DEM. Rien n'est inventé ; chaque bâtiment porte son niveau de confiance.
 * Rendu : MapLibre GL JS (WebGL) + tuiles vectorielles PMTiles chargées par morceaux.
 */
"use strict";

const BASE = new URL(".", location.href).href;
const DONNEES = BASE + "donnees/";
const DEPART = { center: [15.3, -4.33], zoom: 11.2, pitch: 0, bearing: 0 };

const protocole = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocole.tile);

// --- Catégories de lieux (regroupement des catégories Overture) -------------
const GROUPES = [
  { id: "sante", nom: "Santé", couleur: "#e53935", mots: ["hospital", "health", "clinic", "pharmac", "doctor", "medical", "dentist"] },
  { id: "education", nom: "Écoles et universités", couleur: "#1e88e5", mots: ["college", "universit", "school", "learning", "education"] },
  { id: "religion", nom: "Lieux de culte", couleur: "#8e24aa", mots: ["worship", "religious", "church", "mosque"] },
  { id: "commerce", nom: "Commerces et marchés", couleur: "#43a047", mots: ["store", "shop", "mall", "market", "supermarket"] },
  { id: "hotel", nom: "Hôtels", couleur: "#fb8c00", mots: ["hotel", "lodging", "guest_house"] },
  { id: "resto", nom: "Restaurants et bars", couleur: "#ec407a", mots: ["restaurant", "bar", "lounge", "eatery", "club", "cafe", "food"] },
  { id: "finance", nom: "Banques", couleur: "#fdd835", mots: ["bank", "financial", "atm"] },
  { id: "admin", nom: "Administration", couleur: "#26c6da", mots: ["government", "civic", "embassy", "police", "town_hall"] },
  { id: "transport", nom: "Transport et carburant", couleur: "#bdbdbd", mots: ["gas_station", "fuel", "travel", "airport", "bus", "train", "automotive", "parking"] },
];
const AUTRE = { id: "autre", nom: "Autres", couleur: "#9e9d97" };

function groupeExpr() {
  const cas = ["case"];
  for (const g of GROUPES) {
    cas.push(["any", ...g.mots.map((m) => ["in", m, ["coalesce", ["get", "categorie"], ""]])], g.id);
  }
  cas.push(AUTRE.id);
  return cas;
}
function groupeDe(cat) {
  cat = cat || "";
  return GROUPES.find((g) => g.mots.some((m) => cat.includes(m))) || AUTRE;
}

// --- Couleurs des bâtiments ---------------------------------------------------
const FACADES = ["#efe9dc", "#f4f2ec", "#e3d6bf", "#d9d6d0", "#ecd3bd", "#cfdbe3", "#e8dcb0", "#d7c4a8"];
const COULEUR_APPARENCE = [
  "case",
  [">=", ["get", "hauteur"], 30], "#8fa3b3",        // tours : verre et béton
  [">=", ["get", "hauteur"], 15], "#c9c4ba",        // immeubles
  ["match", ["%", ["coalesce", ["get", "v"], 0], 8], 0, FACADES[0], 1, FACADES[1], 2, FACADES[2], 3, FACADES[3],
    4, FACADES[4], 5, FACADES[5], 6, FACADES[6], FACADES[7]],
];
const COULEUR_CONFIANCE = [
  "case",
  ["all", ["==", ["get", "empreinte"], "confirmee"], ["==", ["get", "hauteur_statut"], "documentee"]], "#2e7d32",
  ["==", ["get", "empreinte"], "confirmee"], "#9ccc65",
  "#ffa726",
];
let modeConfiance = false;

// --- Style de la carte ----------------------------------------------------------
const style = {
  version: 8,
  glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
  sources: {
    k: { type: "vector", url: "pmtiles://" + DONNEES + "kinshasa.pmtiles" },
    satellite: { type: "raster", tileSize: 256, maxzoom: 15,
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg"],
      attribution: "Sentinel-2 cloudless 2016 par EOX IT Services GmbH (données Copernicus Sentinel modifiées 2016, CC BY 4.0)" },
    relief: { type: "raster-dem", tiles: [DONNEES + "relief/{z}/{x}/{y}.png"], tileSize: 256, encoding: "terrarium",
      minzoom: 8, maxzoom: 13, bounds: [15.1, -4.62, 15.65, -4.25],
      attribution: "Relief : Copernicus DEM GLO-30" },
  },
  sky: { "sky-color": "#9cc4e8", "horizon-color": "#e9dfcf", "fog-color": "#e3d9c8", "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.7, "fog-ground-blend": 0.3 },
  terrain: { source: "relief", exaggeration: 1.0 },
  layers: [
    { id: "fond", type: "background", paint: { "background-color": "#c9b79c" } },
    { id: "ombrage", type: "hillshade", source: "relief",
      paint: { "hillshade-shadow-color": "#6b5a45", "hillshade-highlight-color": "#efe4d2", "hillshade-exaggeration": 0.35 } },
    { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" },
      paint: { "raster-saturation": 0.1, "raster-contrast": 0.1 } },
    { id: "sol", type: "fill", source: "k", "source-layer": "sol",
      paint: { "fill-color": ["match", ["get", "type"],
        ["park", "recreation", "golf", "cemetery", "agriculture", "horticulture"], "#9fbf7d",
        ["industrial", "transportation", "military"], "#bdb6aa", "#cbbfa8"], "fill-opacity": 0.7 } },
    { id: "eau", type: "fill", source: "k", "source-layer": "eau", filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#5d8fa8" } },
    { id: "eau-lignes", type: "line", source: "k", "source-layer": "eau", filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#5d8fa8", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 5] } },
    { id: "routes-bord", type: "line", source: "k", "source-layer": "routes",
      filter: ["in", ["get", "classe"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#6e655a", "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10, 2, 18, 70] } },
    { id: "routes", type: "line", source: "k", "source-layer": "routes",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": ["match", ["get", "classe"], ["motorway", "trunk"], "#f6c25b", "primary", "#f8d98b",
          ["secondary", "tertiary"], "#ffffff", ["path", "footway", "steps", "pedestrian", "track"], "#d8c7a8", "#f1ece2"],
        "line-width": ["interpolate", ["exponential", 2], ["zoom"], 10,
          ["match", ["get", "classe"], ["motorway", "trunk", "primary"], 1.6, ["secondary", "tertiary"], 1.0, 0.4],
          18, ["match", ["get", "classe"], ["motorway", "trunk", "primary"], 60, ["secondary", "tertiary"], 40,
            ["path", "footway", "steps", "track"], 8, 22]],
      } },
    { id: "limites", type: "line", source: "k", "source-layer": "limites", filter: ["==", ["get", "niveau"], "locality"],
      paint: { "line-color": "#5b2c06", "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 0.15],
        "line-width": 1.5, "line-dasharray": [3, 2] } },
    { id: "batiments", type: "fill-extrusion", source: "k", "source-layer": "batiments", minzoom: 13,
      paint: {
        "fill-extrusion-color": COULEUR_APPARENCE,
        "fill-extrusion-height": ["get", "hauteur"],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      } },
    { id: "batiment-choisi", type: "fill-extrusion", source: "k", "source-layer": "batiments", minzoom: 13,
      filter: ["==", ["id"], -1],
      paint: { "fill-extrusion-color": "#f2b233", "fill-extrusion-height": ["+", ["get", "hauteur"], 0.3] } },
    { id: "routes-noms", type: "symbol", source: "k", "source-layer": "routes", minzoom: 14,
      filter: ["has", "nom"],
      layout: { "symbol-placement": "line", "text-field": ["get", "nom"], "text-font": ["Noto Sans Regular"],
        "text-size": 12, "text-max-angle": 30 },
      paint: { "text-color": "#3a3229", "text-halo-color": "#fffdf7", "text-halo-width": 1.4 } },
    { id: "lieux", type: "circle", source: "k", "source-layer": "lieux", minzoom: 13,
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 18, 7],
        "circle-color": ["match", groupeExpr(), ...GROUPES.flatMap((g) => [g.id, g.couleur]), AUTRE.couleur],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5, "circle-pitch-alignment": "viewport" } },
    { id: "lieux-noms", type: "symbol", source: "k", "source-layer": "lieux", minzoom: 16,
      layout: { "text-field": ["get", "nom"], "text-font": ["Noto Sans Medium"], "text-size": 12,
        "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true },
      paint: { "text-color": "#1d1b18", "text-halo-color": "#fffdf7", "text-halo-width": 1.5 } },
    { id: "communes-noms", type: "symbol", source: "k", "source-layer": "limites", maxzoom: 14,
      filter: ["==", ["get", "niveau"], "locality"],
      layout: { "text-field": ["upcase", ["get", "nom"]], "text-font": ["Noto Sans Medium"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 11, 13, 15], "text-letter-spacing": 0.08,
        "symbol-placement": "point" },
      paint: { "text-color": "#4a2a0c", "text-halo-color": "#f6efe2", "text-halo-width": 2 } },
  ],
};

const carte = new maplibregl.Map({
  container: "carte", style, ...DEPART, maxPitch: 85, hash: true,
  maxBounds: [[14.9, -4.8], [15.9, -4.05]],
  attributionControl: { compact: true,
    customAttribution: "© contributeurs OpenStreetMap (ODbL) · © Overture Maps Foundation · Google Open Buildings (CC BY 4.0) · Copernicus DEM" },
});
carte.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
carte.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
carte.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "bottom-right");

// --- Vues ----------------------------------------------------------------------
const VUES = {
  ciel: () => carte.flyTo({ ...DEPART, duration: 2500 }),
  "3d": () => carte.easeTo({ pitch: 60, zoom: Math.max(carte.getZoom(), 15.5), duration: 1500 }),
  pieton: () => carte.easeTo({ pitch: 82, zoom: Math.max(carte.getZoom(), 18.3), duration: 1800 }),
};
document.querySelectorAll("#outils [data-vue]").forEach((b) => b.addEventListener("click", () => VUES[b.dataset.vue]()));
document.getElementById("plein").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
});

// --- Mode de couleur (apparence / confiance) -----------------------------------
const legende = document.getElementById("legende");
document.getElementById("couleurs").addEventListener("click", (e) => {
  modeConfiance = !modeConfiance;
  e.currentTarget.classList.toggle("actif", modeConfiance);
  carte.setPaintProperty("batiments", "fill-extrusion-color", modeConfiance ? COULEUR_CONFIANCE : COULEUR_APPARENCE);
  legende.hidden = !modeConfiance;
  legende.innerHTML = `
    <strong>Niveau de confiance des bâtiments</strong>
    <div><span class="pastille" style="background:#2e7d32"></span>Contour et hauteur documentés (OSM)</div>
    <div><span class="pastille" style="background:#9ccc65"></span>Contour cartographié (OSM), hauteur estimée</div>
    <div><span class="pastille" style="background:#ffa726"></span>Contour détecté par satellite, hauteur estimée</div>`;
});

// --- Vue satellite (image Sentinel-2 2016 : licence CC BY 4.0, 10 m par pixel) ----
document.getElementById("satellite").addEventListener("click", (e) => {
  const on = carte.getLayoutProperty("satellite", "visibility") !== "visible";
  e.currentTarget.classList.toggle("actif", on);
  carte.setLayoutProperty("satellite", "visibility", on ? "visible" : "none");
  for (const l of ["sol", "eau"]) carte.setPaintProperty(l, "fill-opacity", on ? 0.25 : l === "sol" ? 0.7 : 1);
  carte.setPaintProperty("ombrage", "hillshade-exaggeration", on ? 0 : 0.35);
});

// --- Passage au mode jeu : uniquement dans les zones jouables déjà préparées ----
const ZONES_JOUABLES = [
  { id: "limete", nom: "Limete (Tour de l'Échangeur)", centre: [15.345467, -4.374384], dx: 1550, dz: 1550 },
  { id: "gombe", nom: "Gombe (centre-ville, boulevard du 30 Juin)", centre: [15.30485, -4.312], dx: 4550, dz: 1950 },
];
document.getElementById("jouer").addEventListener("click", () => {
  const c = carte.getCenter();
  const ecart = (z) => ({
    x: (c.lng - z.centre[0]) * 111320 * Math.cos((z.centre[1] * Math.PI) / 180),
    z: (c.lat - z.centre[1]) * 111320,
  });
  const z = ZONES_JOUABLES.find((z) => { const e = ecart(z); return Math.abs(e.x) < z.dx && Math.abs(e.z) < z.dz; });
  if (z) {
    location.href = `jeu/?zone=${z.id}&lat=${c.lat.toFixed(6)}&lon=${c.lng.toFixed(6)}`;
    return;
  }
  const proche = ZONES_JOUABLES.slice().sort((a, b) => Math.hypot(ecart(a).x, ecart(a).z) - Math.hypot(ecart(b).x, ecart(b).z))[0];
  if (confirm(`Le mode jeu n'est disponible que dans ces zones : ${ZONES_JOUABLES.map((z) => z.nom).join(" ; ")}.\n\nAller à la plus proche : ${proche.nom} ?`)) {
    carte.flyTo({ center: proche.centre, zoom: 16, pitch: 60, duration: 2500 });
  }
});

// --- Filtres de lieux ------------------------------------------------------------
const filtresListe = document.getElementById("filtres-liste");
const actifs = new Set([...GROUPES.map((g) => g.id), AUTRE.id]);
for (const g of [...GROUPES, AUTRE]) {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" checked><span class="pastille" style="background:${g.couleur}"></span>${g.nom}`;
  l.querySelector("input").addEventListener("change", (e) => {
    e.target.checked ? actifs.add(g.id) : actifs.delete(g.id);
    const f = ["in", groupeExpr(), ["literal", [...actifs]]];
    carte.setFilter("lieux", f);
    carte.setFilter("lieux-noms", f);
  });
  filtresListe.appendChild(l);
}
document.getElementById("filtres-ouvrir").addEventListener("click", () => { filtresListe.hidden = !filtresListe.hidden; });

// --- Fiche d'information ---------------------------------------------------------
const fiche = document.getElementById("fiche");
const ficheContenu = document.getElementById("fiche-contenu");
document.getElementById("fiche-fermer").addEventListener("click", () => {
  fiche.hidden = true;
  carte.setFilter("batiment-choisi", ["==", ["id"], -1]);
});
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ficheBatiment(f, lngLat) {
  const p = f.properties;
  const conf = p.empreinte === "confirmee"
    ? `<span class="badge ok">Contour cartographié</span>` : `<span class="badge sat">Contour détecté par satellite</span>`;
  const haut = p.hauteur_statut === "documentee"
    ? `<span class="badge ok">documentée</span>` : `<span class="badge est">estimée</span>`;
  ficheContenu.innerHTML = `
    <h2>${esc(p.nom) || "Bâtiment"}</h2>${conf}
    <dl>
      <dt>Hauteur</dt><dd>${esc(p.hauteur)} m ${haut}</dd>
      ${p.etages != null ? `<dt>Étages</dt><dd>${esc(p.etages)}</dd>` : ""}
      ${p.categorie ? `<dt>Catégorie</dt><dd>${esc(p.categorie)}</dd>` : ""}
      <dt>Source</dt><dd>${esc(p.source)}</dd>
      <dt>Position</dt><dd>${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}</dd>
    </dl>`;
  fiche.hidden = false;
}
function ficheLieu(f) {
  const p = f.properties;
  const g = groupeDe(p.categorie);
  const [lng, lat] = f.geometry.coordinates;
  ficheContenu.innerHTML = `
    <h2>${esc(p.nom)}</h2><span class="badge" style="background:${g.couleur};color:#111">${g.nom}</span>
    <dl>
      <dt>Catégorie</dt><dd>${esc(p.categorie || "non précisée")}</dd>
      ${p.adresse ? `<dt>Adresse</dt><dd>${esc(p.adresse)}</dd>` : ""}
      <dt>Fiabilité</dt><dd>${p.fiabilite != null ? Math.round(p.fiabilite * 100) + " % (Overture)" : "—"}</dd>
      <dt>Position</dt><dd>${lat.toFixed(5)}, ${lng.toFixed(5)}</dd>
    </dl>`;
  fiche.hidden = false;
}
carte.on("click", (e) => {
  const lieux = carte.queryRenderedFeatures(e.point, { layers: ["lieux"] });
  if (lieux.length) return ficheLieu(lieux[0]);
  const b = carte.queryRenderedFeatures(e.point, { layers: ["batiments"] });
  if (b.length) {
    ficheBatiment(b[0], e.lngLat);
    if (b[0].id != null) carte.setFilter("batiment-choisi", ["==", ["id"], b[0].id]);
  }
});
for (const l of ["lieux", "batiments"]) {
  carte.on("mouseenter", l, () => { carte.getCanvas().style.cursor = "pointer"; });
  carte.on("mouseleave", l, () => { carte.getCanvas().style.cursor = ""; });
}

// --- Recherche ---------------------------------------------------------------------
const q = document.getElementById("q");
const res = document.getElementById("resultats");
let index = [];
fetch(DONNEES + "index.json").then((r) => r.json()).then((d) => {
  index = d.map((e) => ({ ...e, k: normaliser(e.n) }));
});
function normaliser(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
}
const TYPES = { commune: "Commune", quartier: "Quartier", rue: "Avenue / rue" };
const RANG = { commune: 0, quartier: 1, rue: 2, lieu: 3 };
let selection = -1;
let trouves = [];
q.addEventListener("input", () => {
  const t = normaliser(q.value.trim());
  selection = -1;
  if (t.length < 2) { res.innerHTML = ""; return; }
  const mots = t.split(/\s+/);
  trouves = index.filter((e) => mots.every((m) => e.k.includes(m)))
    .sort((a, b) => (a.k.startsWith(mots[0]) ? 0 : 1) - (b.k.startsWith(mots[0]) ? 0 : 1) || RANG[a.t] - RANG[b.t] || a.n.length - b.n.length)
    .slice(0, 30);
  res.innerHTML = trouves.map((e, i) =>
    `<li role="option" data-i="${i}">${esc(e.n)}<span class="type">${TYPES[e.t] || groupeDe(e.s).nom}</span></li>`).join("");
});
q.addEventListener("keydown", (e) => {
  const items = res.querySelectorAll("li");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    selection = Math.max(0, Math.min(items.length - 1, selection + (e.key === "ArrowDown" ? 1 : -1)));
    items.forEach((li, i) => li.setAttribute("aria-selected", i === selection));
    e.preventDefault();
  } else if (e.key === "Enter" && trouves.length) {
    aller(trouves[Math.max(selection, 0)]);
  } else if (e.key === "Escape") {
    res.innerHTML = "";
  }
});
res.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) aller(trouves[+li.dataset.i]);
});
let marqueur = null;
function aller(e) {
  res.innerHTML = "";
  q.value = e.n;
  q.blur();
  marqueur?.remove();
  if (e.b) {
    carte.fitBounds([[e.b[0], e.b[1]], [e.b[2], e.b[3]]], { padding: 60, pitch: 45, duration: 2500, maxZoom: 15.5 });
  } else {
    carte.flyTo({ center: e.c, zoom: e.t === "rue" ? 16.5 : 17.6, pitch: 62, bearing: carte.getBearing(), duration: 2800 });
    marqueur = new maplibregl.Marker({ color: "#f2b233" }).setLngLat(e.c).addTo(carte);
  }
}

// --- Statistiques affichées --------------------------------------------------------
const stats = document.getElementById("stats");
function majStats() {
  const z = carte.getZoom();
  stats.textContent = z < 13
    ? "Zoomez pour afficher les 1 381 865 bâtiments réels de Kinshasa"
    : `Zoom ${z.toFixed(1)} · inclinaison ${Math.round(carte.getPitch())}° · cliquez sur un bâtiment ou un lieu`;
}
carte.on("moveend", majStats);
carte.on("load", majStats);

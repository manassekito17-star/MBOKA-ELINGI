// Façades et toits des bâtiments de Kinshasa, sans texture (léger pour mobile).
// COLOR.rgb = couleur de base ; COLOR.a = type de surface :
//   1.0 mur | 0.5 toit plat en béton | 0.0 toit en tôle ondulée
// UV (murs) : x = distance le long de la façade (m), y = hauteur (m)
// UV (toits) : coordonnées monde x/z (m)
shader_type spatial;
render_mode cull_back;

uniform float floor_height = 3.1;
uniform float window_spacing = 3.4;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	vec3 c = COLOR.rgb;
	float dist = length(VERTEX);
	float rough = 0.9;
	float metal = 0.0;
	if (COLOR.a > 0.75) {
		vec2 uv = UV;
		float floor_idx = floor(uv.y / floor_height);
		float fy = fract(uv.y / floor_height);
		float fx = fract(uv.x / window_spacing);
		float cell = hash(vec2(floor(uv.x / window_spacing), floor_idx));
		// Fenêtres (certaines avec volets/grilles de couleur), fondu au loin.
		float win = step(0.38, fy) * step(fy, 0.78) * step(0.28, fx) * step(fx, 0.72);
		win *= step(0.12, cell) * (1.0 - smoothstep(180.0, 320.0, dist));
		vec3 glass = mix(vec3(0.06, 0.08, 0.10), vec3(0.18, 0.32, 0.38), step(0.7, cell));
		// Soubassement rouge (poussière de latérite) et bandeau de dalle.
		float plinth = 1.0 - smoothstep(0.35, 0.75, uv.y);
		float slab = step(0.94, fy) * step(1.0, uv.y);
		c = mix(c, vec3(0.50, 0.27, 0.16), plinth * 0.55);
		c = mix(c, c * 0.78, slab);
		// Traces de pluie verticales.
		float streak = hash(vec2(floor(uv.x * 2.0), 3.0));
		c *= 1.0 - 0.10 * streak * (1.0 - fy);
		c = mix(c, glass, win);
		rough = mix(0.92, 0.25, win);
	} else if (COLOR.a > 0.25) {
		// Toit-terrasse en béton, taches d'humidité.
		float n = hash(floor(UV * 0.5));
		c *= 0.85 + 0.15 * n;
		rough = 0.95;
	} else {
		// Tôle ondulée : ondulations + rouille.
		float wave = sin(UV.x * 9.0) * 0.5 + 0.5;
		float rust = hash(floor(UV * 0.8));
		c = mix(c, vec3(0.45, 0.24, 0.12), step(0.78, rust) * 0.45);
		c *= 0.82 + 0.18 * wave;
		rough = 0.55;
		metal = 0.35;
	}
	ALBEDO = pow(c, vec3(2.2));  // sRGB -> linéaire
	ROUGHNESS = rough;
	METALLIC = metal;
}

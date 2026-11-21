// Façades et toits des bâtiments, sans texture (léger pour mobile).
// COLOR.rgb = couleur de base ; COLOR.a = type de surface :
//   1.0  mur                      0.97 mur de façade sur rue (porte, garage)
//   0.85 mur de clôture (sans fenêtre)
//   0.5  toit plat en béton / sous-face de toit
//   0.15 toit en tuiles (terre cuite ou ardoise)
//   0.0  toit en tôle ondulée
// UV  (murs) : x = distance le long du contour (m), y = hauteur (m)
// UV2 (murs) : x = position sur CE mur (m), y = longueur de ce mur (m)
shader_type spatial;
render_mode cull_back;

uniform float floor_height = 3.1;

varying vec3 world_pos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float box(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec3 c = COLOR.rgb;
	float dist = length(VERTEX);
	float rough = 0.9;
	float metal = 0.0;
	if (COLOR.a > 0.8) {
		float len = UV2.y;
		float along = UV2.x;
		float h = UV.y;
		float fl = floor(h / floor_height);
		float fy = fract(h / floor_height);
		float detail = 1.0 - smoothstep(160.0, 300.0, dist);
		// Soubassement et bandeau d'étage.
		float plinth = 1.0 - smoothstep(0.25, 0.45, h);
		c = mix(c, c * 0.62, plinth);
		c = mix(c, c * 0.85, step(0.95, fy) * step(1.0, h));
		if (COLOR.a > 0.92 && COLOR.a < 0.94 && fl >= 1.0) {
			// Façade à hublots ronds cerclés de rouge (Hôpital du Cinquantenaire).
			float n = max(1.0, floor(len / 3.0));
			float fx = fract(along / (len / n));
			vec2 d = vec2((fx - 0.5) * (len / n), (fy - 0.5) * floor_height);
			float r = length(d);
			float ring = step(r, 1.12) * step(0.78, r);
			float inner = step(r, 0.78);
			c = mix(c, vec3(0.62, 0.11, 0.10), ring * detail);
			c = mix(c, vec3(0.10, 0.12, 0.15) + 0.15 * step(0.0, d.y), inner * detail);
			rough = mix(rough, 0.2, inner);
		} else if (len > 1.5 && COLOR.a > 0.9) {
			float n = max(1.0, floor(len / 3.3));
			float sp = len / n;
			float idx = floor(along / sp);
			float fx = fract(along / sp);
			vec2 q = vec2(fx, fy);
			bool front = COLOR.a < 0.985;
			float door_cell = floor(n * 0.5);
			float glass_tone = hash(vec2(floor(world_pos.x * 0.1), floor(world_pos.z * 0.1)));
			vec3 glass = mix(vec3(0.10, 0.14, 0.18), vec3(0.45, 0.58, 0.70), clamp(fy * 1.3 - 0.2, 0.0, 1.0) * 0.6 + glass_tone * 0.2);
			vec3 frame_col = vec3(0.96, 0.96, 0.95);
			if (front && fl < 0.5 && idx == door_cell) {
				// Porte d'entrée avec encadrement et petit auvent.
				float fr = box(q, vec2(0.28, 0.0), vec2(0.72, 0.76));
				float dr = box(q, vec2(0.32, 0.0), vec2(0.68, 0.72));
				c = mix(c, frame_col, fr * detail);
				c = mix(c, vec3(0.30, 0.20, 0.13) * (0.85 + 0.15 * step(0.5, fract(fx * 6.0))), dr * detail);
				c = mix(c, vec3(0.85, 0.75, 0.4), box(q, vec2(0.62, 0.34), vec2(0.65, 0.38)) * detail);
				rough = mix(rough, 0.5, dr);
			} else if (front && fl < 0.5 && idx == 0.0 && n >= 3.0 && hash(c.rg) > 0.45) {
				// Porte de garage sectionnelle.
				float g = box(q, vec2(0.06, 0.0), vec2(0.94, 0.70));
				vec3 gc = vec3(0.32, 0.33, 0.35) * (0.9 + 0.1 * step(0.5, fract(fy * 9.0)));
				c = mix(c, frame_col, box(q, vec2(0.03, 0.0), vec2(0.97, 0.73)) * detail);
				c = mix(c, gc, g * detail);
				metal = mix(metal, 0.3, g);
			} else {
				// Fenêtre avec cadre blanc, appui et vitrage reflétant le ciel.
				float fr = box(q, vec2(0.22, 0.27), vec2(0.78, 0.82));
				float w = box(q, vec2(0.26, 0.31), vec2(0.74, 0.79));
				float mullion = 1.0 - step(0.015, abs(fx - 0.5));
				float sill = box(q, vec2(0.20, 0.24), vec2(0.80, 0.27));
				c = mix(c, frame_col, max(fr, sill) * detail);
				c = mix(c, mix(glass, frame_col, mullion), w * detail);
				rough = mix(rough, 0.12, w * detail);
				metal = mix(metal, 0.2, w * detail);
			}
		}
	} else if (COLOR.a > 0.25) {
		// Toit-terrasse en béton / sous-face du débord.
		float n = hash(floor(UV * 0.5));
		c *= 0.88 + 0.12 * n;
		rough = 0.95;
	} else if (COLOR.a > 0.08) {
		// Tuiles : rangées horizontales selon la hauteur + variation par tuile.
		float rows = fract(world_pos.y * 3.2);
		float tile = hash(floor(vec2(world_pos.x + world_pos.z, world_pos.y * 3.2) * vec2(3.0, 1.0)));
		c *= 0.78 + 0.22 * smoothstep(0.0, 0.85, rows);
		c *= 0.92 + 0.12 * tile;
		rough = 0.7;
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

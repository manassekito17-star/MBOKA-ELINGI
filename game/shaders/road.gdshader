// Routes : asphalte (COLOR.a = 1) avec marquage, ou terre/latérite (COLOR.a = 0).
// UV.x = position en travers (0..1), UV.y = distance le long de la route (m).
// COLOR.r = 1 si la route a un marquage central.
shader_type spatial;
render_mode cull_disabled;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void fragment() {
	float n = noise(UV * vec2(6.0, 0.6)) * 0.6 + noise(UV * vec2(20.0, 2.0)) * 0.4;
	float dist = length(VERTEX);
	vec3 c;
	if (COLOR.a > 0.5) {
		c = vec3(0.46, 0.46, 0.47) * (0.85 + 0.25 * n);
		// Bords usés et marquage blanc discontinu au centre.
		float edge = smoothstep(0.42, 0.5, abs(UV.x - 0.5));
		c = mix(c, vec3(0.36, 0.27, 0.20), edge * 0.35);
		float dash = step(0.5, fract(UV.y / 6.0)) * (1.0 - step(0.012, abs(UV.x - 0.5)));
		c = mix(c, vec3(0.92, 0.92, 0.88), dash * COLOR.r * (1.0 - smoothstep(60.0, 120.0, dist)));
		ROUGHNESS = 0.85;
	} else {
		c = mix(vec3(0.58, 0.33, 0.20), vec3(0.70, 0.45, 0.28), n);
		// Ornières sombres.
		float rut = 1.0 - smoothstep(0.0, 0.08, abs(abs(UV.x - 0.5) - 0.2));
		c *= 1.0 - rut * 0.15;
		ROUGHNESS = 1.0;
	}
	ALBEDO = pow(c, vec3(2.2));
}

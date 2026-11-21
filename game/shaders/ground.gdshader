// Sol de Kinshasa : sable et latérite, plaques d'herbe sèche.
// COLOR.g > 0.5 => zone verte (pelouse, parc).
shader_type spatial;

varying vec3 world_pos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void vertex() { world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 p = world_pos.xz;
	float n = noise(p * 0.05) * 0.5 + noise(p * 0.3) * 0.3 + noise(p * 2.0) * 0.2;
	vec3 sand = mix(vec3(0.66, 0.50, 0.36), vec3(0.74, 0.58, 0.42), n);
	vec3 laterite = vec3(0.62, 0.36, 0.22);
	vec3 dry_grass = vec3(0.46, 0.48, 0.25);
	vec3 c = mix(sand, laterite, smoothstep(0.55, 0.8, noise(p * 0.02 + 7.0)) * 0.6);
	c = mix(c, dry_grass, smoothstep(0.6, 0.85, noise(p * 0.04 + 3.0)) * 0.5);
	if (COLOR.g > 0.5) {
		c = mix(vec3(0.25, 0.42, 0.16), vec3(0.36, 0.52, 0.20), n);
	}
	// Couleurs écrites en sRGB -> conversion en linéaire.
	ALBEDO = pow(c, vec3(2.2));
	ROUGHNESS = 1.0;
}

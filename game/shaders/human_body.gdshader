// Corps humain : teint de peau réglable + vêtements peints par masque
// (masque généré par tools/characters/prepare_characters.py).
shader_type spatial;

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap;
uniform sampler2D rough_tex : hint_roughness_g, filter_linear_mipmap;
uniform sampler2D mask_tex : filter_linear;

uniform vec3 skin_tone : source_color = vec3(0.36, 0.22, 0.14);
uniform vec3 shirt_color : source_color = vec3(0.9, 0.5, 0.1);
uniform vec3 pattern_color : source_color = vec3(0.1, 0.2, 0.6);
uniform vec3 pants_color : source_color = vec3(0.1, 0.12, 0.2);
uniform vec3 shoe_color : source_color = vec3(0.08, 0.06, 0.05);
uniform float long_sleeves = 0.0;
uniform float high_collar = 0.0;
uniform int shirt_pattern = 0;   // 0 uni, 1 wax (pois), 2 rayures, 3 carreaux
uniform int pants_pattern = 0;   // 0 uni, 1 pagne wax
uniform float ref_lum = 0.30;

vec3 apply_pattern(vec3 a, vec3 b, int mode, vec2 uv) {
	if (mode == 1) {
		vec2 g = fract(uv * 26.0) - 0.5;
		float ring = abs(length(g) - 0.28);
		return mix(a, b, 1.0 - smoothstep(0.05, 0.09, ring));
	} else if (mode == 2) {
		return mix(a, b, step(0.55, fract(uv.y * 40.0)));
	} else if (mode == 3) {
		float s = step(0.5, fract(uv.x * 30.0)) + step(0.5, fract(uv.y * 30.0));
		return mix(a, b, 0.45 * s);
	}
	return a;
}

void fragment() {
	vec3 base = texture(albedo_tex, UV).rgb;
	float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
	float detail = clamp(lum / ref_lum, 0.55, 1.45);
	vec3 c = skin_tone * detail;
	float rough = texture(rough_tex, UV).g;
	vec4 m = texture(mask_tex, UV);
	float cloth_detail = mix(1.0, detail, 0.3);
	float pants = step(0.75, m.b);
	float shoes = step(0.25, m.b) * (1.0 - pants);
	float sleeve = step(0.75, m.g);
	float collar = step(0.25, m.g) * (1.0 - sleeve);
	float shirt = max(max(step(0.5, m.r), sleeve * long_sleeves), collar * high_collar);
	if (shoes > 0.5) { c = shoe_color * cloth_detail; rough = 0.45; }
	if (pants > 0.5) { c = apply_pattern(pants_color, pattern_color, pants_pattern, UV) * cloth_detail; rough = 0.9; }
	if (shirt > 0.5) { c = apply_pattern(shirt_color, pattern_color, shirt_pattern, UV) * cloth_detail; rough = 0.88; }
	ALBEDO = c;
	ROUGHNESS = rough;
	NORMAL_MAP = texture(normal_tex, UV).rgb;
}

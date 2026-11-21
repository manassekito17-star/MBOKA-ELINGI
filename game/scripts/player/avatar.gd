class_name Avatar
extends Node3D
## Personnage humain 3D réaliste (corps riggé + 43 animations, Quaternius, CC0).
## Teint de peau, vêtements (couleurs, motifs wax, manches) et coiffure réglables.
## Animations : attente, marche, jogging, sprint, saut, discussion, conduite.

const ANIM_GLB := "res://assets/animations/UAL1_Standard.glb"
const HAIR_MALE := ["Hair_Buzzed", "Hair_Buzzed", "Hair_SimpleParted", "Hair_Beard"]
const HAIR_FEMALE := ["Hair_Buns", "Hair_Long", "Hair_BuzzedFemale"]

const LOOPS := ["Idle", "Walk", "Walk_Formal", "Jog_Fwd", "Sprint", "Jump", "Idle_Talking", "Sitting_Idle",
	"Sitting_Talking", "Driving", "Dance", "Crouch_Idle", "Crouch_Fwd", "Push", "Swim_Fwd", "Swim_Idle", "Idle_Torch",
	"Pistol_Idle", "Spell_Simple_Idle"]

static var _libs := {}          # chemin squelette -> AnimationLibrary
static var _body_shader: Shader
static var _anim_source: AnimationLibrary

var skin := Color(0.36, 0.22, 0.14)
var shirt := Color(0.95, 0.55, 0.08)
var pants := Color(0.12, 0.14, 0.24)
var shoes := Color(0.08, 0.06, 0.05)
var pattern := Color(0.1, 0.25, 0.65)
var shirt_pattern := 0
var pants_pattern := 0
var long_sleeves := false
var high_collar := false
var female := false
var hair := ""
var scale_factor := 1.0
var braids := false             # tresses plaquées (personnage principal)
var earring := false
var pose := ""                  # animation imposée (ex. "Idle_Talking")

var anim: AnimationPlayer
var _model: Node3D
var _state := ""


func setup(p_skin: Color, p_shirt: Color, p_pants: Color, p_scale := 1.0, p_female := false) -> Avatar:
	skin = p_skin
	shirt = p_shirt
	pants = p_pants
	scale_factor = p_scale
	female = p_female
	return self


## Tenue aléatoire mais réaliste pour un habitant de Kinshasa.
func randomize_look(rng: RandomNumberGenerator) -> Avatar:
	female = rng.randf() < 0.5
	var tones := [Color(0.24, 0.15, 0.10), Color(0.30, 0.19, 0.12), Color(0.36, 0.23, 0.15), Color(0.42, 0.28, 0.18)]
	skin = tones[rng.randi() % tones.size()]
	shirt = Color.from_hsv(rng.randf(), rng.randf_range(0.35, 0.9), rng.randf_range(0.45, 0.95))
	pattern = Color.from_hsv(rng.randf(), rng.randf_range(0.5, 0.9), rng.randf_range(0.4, 0.9))
	pants = [Color(0.10, 0.12, 0.22), Color(0.15, 0.15, 0.16), Color(0.55, 0.48, 0.36), Color(0.20, 0.30, 0.45)][rng.randi() % 4]
	shirt_pattern = [0, 0, 1, 2, 3][rng.randi() % 5]
	if female and rng.randf() < 0.55:
		pants_pattern = 1   # pagne en tissu wax
		pants = Color.from_hsv(rng.randf(), 0.75, 0.75)
	long_sleeves = rng.randf() < 0.3
	scale_factor = rng.randf_range(0.94, 1.05)
	return self


func _ready() -> void:
	scale = Vector3.ONE * scale_factor
	var scene: PackedScene = load("res://assets/characters/Human_%s.gltf" % ("Female" if female else "Male"))
	_model = scene.instantiate()
	_model.rotation.y = PI    # les modèles glTF regardent vers +Z ; le jeu utilise -Z
	add_child(_model)
	var skel: Skeleton3D = _model.find_children("*", "Skeleton3D", true, false)[0]
	_apply_materials()
	_attach_hair(skel)
	anim = AnimationPlayer.new()
	_model.add_child(anim)
	var key := str(_model.get_path_to(skel))
	if not _libs.has(key):
		_libs[key] = _build_library(key)
	anim.add_animation_library("", _libs[key])
	_play(pose if pose != "" else "Idle", 0.0)


func _apply_materials() -> void:
	if _body_shader == null:
		_body_shader = load("res://shaders/human_body.gdshader")
	var who := "Female" if female else "Male"
	var base := "res://assets/characters/T_Superhero_%s" % who
	for mi: MeshInstance3D in _model.find_children("*", "MeshInstance3D", true, false):
		for s in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(s)
			var mname := mat.resource_name if mat else ""
			if mname.contains("Superhero"):
				var sm := ShaderMaterial.new()
				sm.shader = _body_shader
				sm.set_shader_parameter("albedo_tex", load(base + ("_Dark_BaseColor.png" if female else "_Dark.png")))
				sm.set_shader_parameter("normal_tex", load(base + "_Normal.png"))
				sm.set_shader_parameter("rough_tex", load(base + "_Roughness.png"))
				sm.set_shader_parameter("mask_tex", load("res://assets/characters/T_%s_ClothesMask.png" % who))
				sm.set_shader_parameter("skin_tone", skin)
				sm.set_shader_parameter("shirt_color", shirt)
				sm.set_shader_parameter("pattern_color", pattern)
				sm.set_shader_parameter("pants_color", pants)
				sm.set_shader_parameter("shoe_color", shoes)
				sm.set_shader_parameter("long_sleeves", 1.0 if long_sleeves else 0.0)
				sm.set_shader_parameter("high_collar", 1.0 if high_collar else 0.0)
				sm.set_shader_parameter("shirt_pattern", shirt_pattern)
				sm.set_shader_parameter("pants_pattern", pants_pattern)
				mi.set_surface_override_material(s, sm)
			elif mname.contains("Hair") and mat is BaseMaterial3D:
				var hm: BaseMaterial3D = mat.duplicate()
				hm.albedo_color = Color(0.12, 0.09, 0.07)
				mi.set_surface_override_material(s, hm)


func _attach_hair(skel: Skeleton3D) -> void:
	if braids:
		_attach_braids(skel)
		return
	if hair == "":
		var list := HAIR_FEMALE if female else HAIR_MALE
		hair = list[absi(hash(get_instance_id())) % list.size()]
	var path := "res://assets/characters/%s.gltf" % hair
	if not ResourceLoader.exists(path):
		return
	var head := skel.find_bone("Head")
	if head < 0:
		return
	var att := BoneAttachment3D.new()
	att.bone_name = "Head"
	skel.add_child(att)
	var h: Node3D = (load(path) as PackedScene).instantiate()
	# Coiffure exportée « origine à 0 » : on annule la pose de repos de la tête.
	h.transform = skel.get_bone_global_rest(head).affine_inverse()
	att.add_child(h)
	for mi: MeshInstance3D in h.find_children("*", "MeshInstance3D", true, false):
		for s in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(s)
			if mat is BaseMaterial3D:
				var hm: BaseMaterial3D = mat.duplicate()
				hm.albedo_color = Color(0.10, 0.08, 0.06)
				mi.set_surface_override_material(s, hm)


## Tresses plaquées (« cornrows ») ramenées en arrière, et boucle d'oreille,
## construites en code autour du crâne (coordonnées du modèle en pose de repos).
func _attach_braids(skel: Skeleton3D) -> void:
	var head := skel.find_bone("Head")
	if head < 0:
		return
	var att := BoneAttachment3D.new()
	att.bone_name = "Head"
	skel.add_child(att)
	var holder := Node3D.new()
	holder.transform = skel.get_bone_global_rest(head).affine_inverse()
	att.add_child(holder)
	var center := Vector3(0, 1.716, -0.012)
	var radii := Vector3(0.083, 0.098, 0.104)
	var bead := SphereMesh.new()
	bead.radius = 0.0125
	bead.height = 0.022
	bead.radial_segments = 6
	bead.rings = 3
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rows := 7
	for r in rows:
		var x := lerpf(-0.062, 0.062, float(r) / (rows - 1))
		var side := sqrt(maxf(0.0, 1.0 - pow(x / radii.x, 2.0)))
		var steps := 26
		for i in steps:
			# De la ligne du front (devant) jusqu'à la nuque (derrière).
			var a := lerpf(deg_to_rad(38), deg_to_rad(215), float(i) / (steps - 1))
			var p := center + Vector3(x, cos(a - PI / 2.0 + PI / 2.0) * 0.0, 0)
			p = center + Vector3(x, sin(a) * radii.y * side, cos(a) * radii.z * side) * 1.03
			var tw := Basis(Vector3.RIGHT, a + i * 0.7)
			st.append_from(bead, 0, Transform3D(tw, p))
	# Tresses ramenées et attachées derrière la tête.
	for k in 6:
		var start := center + Vector3(lerpf(-0.04, 0.04, k / 5.0), -0.035, -radii.z * 1.02)
		for i in 14:
			var p := start + Vector3(0, -i * 0.017, -i * 0.006)
			st.append_from(bead, 0, Transform3D(Basis(Vector3.RIGHT, i * 0.8), p))
	var braid_mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = braid_mesh
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.06, 0.045, 0.035)
	m.roughness = 0.75
	mi.material_override = m
	holder.add_child(mi)
	if earring:
		var ring := TorusMesh.new()
		ring.inner_radius = 0.006
		ring.outer_radius = 0.009
		ring.rings = 12
		ring.ring_segments = 6
		var er := MeshInstance3D.new()
		er.mesh = ring
		var gm := StandardMaterial3D.new()
		gm.albedo_color = Color(0.95, 0.75, 0.3)
		gm.metallic = 0.9
		gm.roughness = 0.25
		er.material_override = gm
		er.transform = Transform3D(Basis(Vector3.FORWARD, PI / 2.0), center + Vector3(0.082, -0.03, 0.0))
		holder.add_child(er)


## Copie les animations de la bibliothèque en les adaptant au squelette du personnage.
static func _build_library(skel_path: String) -> AnimationLibrary:
	if _anim_source == null:
		var src: Node = (load(ANIM_GLB) as PackedScene).instantiate()
		var ap: AnimationPlayer = src.find_children("*", "AnimationPlayer", true, false)[0]
		_anim_source = ap.get_animation_library(ap.get_animation_library_list()[0])
		src.free()
	var lib := AnimationLibrary.new()
	for name in _anim_source.get_animation_list():
		var a: Animation = _anim_source.get_animation(name).duplicate(true)
		for t in range(a.get_track_count() - 1, -1, -1):
			var p := str(a.track_get_path(t))
			var bone := p.get_slice(":", 1)
			# On garde les rotations ; les translations seulement pour le bassin/racine
			# (les proportions du personnage sont ainsi respectées).
			if a.track_get_type(t) == Animation.TYPE_POSITION_3D and not bone in ["pelvis", "root"]:
				a.remove_track(t)
				continue
			if a.track_get_type(t) == Animation.TYPE_SCALE_3D:
				a.remove_track(t)
				continue
			a.track_set_path(t, NodePath("%s:%s" % [skel_path, bone]))
		if name.ends_with("") or name in ["Sword_Idle"]:
			a.loop_mode = Animation.LOOP_LINEAR
		lib.add_animation(name, a)
	return lib


func set_pose(anim_name: String) -> void:
	pose = anim_name
	if anim:
		_play(anim_name, 0.25)


## speed : vitesse horizontale (m/s). airborne : en l'air (saut).
func animate(_delta: float, speed: float, airborne := false) -> void:
	if anim == null or pose != "":
		return
	if airborne:
		_play("Jump", 0.15)
	elif speed < 0.25:
		_play("Idle", 0.25)
	elif speed < 2.6:
		_play("Walk", 0.25, speed / 1.35)
	elif speed < 6.5:
		_play("Jog_Fwd", 0.25, speed / 3.6)
	else:
		_play("Sprint", 0.25, speed / 6.8)


func _play(anim_name: String, blend: float, speed_scale := 1.0) -> void:
	anim.speed_scale = clampf(speed_scale, 0.5, 1.8)
	if _state == anim_name:
		return
	if not anim.has_animation(anim_name):
		return
	_state = anim_name
	anim.play(anim_name, blend)

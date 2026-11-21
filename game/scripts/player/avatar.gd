class_name Avatar
extends Node3D
## Personnage humain stylisé, construit en code (en attendant les vrais
## modèles 3D animés de la phase 3). Animation de marche procédurale.

var skin := Color(0.33, 0.21, 0.14)
var shirt := Color(0.95, 0.45, 0.10)
var pants := Color(0.15, 0.17, 0.25)
var shoes := Color(0.10, 0.08, 0.07)
var hair := Color(0.05, 0.04, 0.04)
var scale_factor := 1.0

var _phase := 0.0
var _arm_l: Node3D
var _arm_r: Node3D
var _leg_l: Node3D
var _leg_r: Node3D
var _torso: Node3D
var _speed := 0.0


func setup(p_skin: Color, p_shirt: Color, p_pants: Color, p_scale := 1.0) -> Avatar:
	skin = p_skin
	shirt = p_shirt
	pants = p_pants
	scale_factor = p_scale
	return self


func _ready() -> void:
	scale = Vector3.ONE * scale_factor
	var m_skin := _m(skin)
	var m_shirt := _m(shirt)
	var m_pants := _m(pants)
	var m_shoes := _m(shoes)
	_torso = Node3D.new()
	add_child(_torso)
	_part(_torso, _caps(0.24, 0.72), Vector3(0, 1.22, 0), m_shirt)
	_part(_torso, _caps(0.15, 0.3), Vector3(0, 1.0, 0), m_pants)
	var head := SphereMesh.new()
	head.radius = 0.13
	head.height = 0.28
	head.radial_segments = 12
	head.rings = 6
	_part(_torso, head, Vector3(0, 1.72, 0), m_skin)
	var cap := SphereMesh.new()
	cap.radius = 0.135
	cap.height = 0.16
	cap.is_hemisphere = true
	_part(_torso, cap, Vector3(0, 1.75, 0), _m(hair))
	_arm_l = _limb(Vector3(-0.3, 1.5, 0), 0.06, 0.62, m_shirt, m_skin)
	_arm_r = _limb(Vector3(0.3, 1.5, 0), 0.06, 0.62, m_shirt, m_skin)
	_leg_l = _limb(Vector3(-0.11, 0.92, 0), 0.085, 0.86, m_pants, m_shoes)
	_leg_r = _limb(Vector3(0.11, 0.92, 0), 0.085, 0.86, m_pants, m_shoes)


## speed : vitesse horizontale (m/s). airborne : en l'air (saut).
func animate(delta: float, speed: float, airborne := false) -> void:
	_speed = lerpf(_speed, speed, clampf(delta * 8.0, 0.0, 1.0))
	_phase += delta * (2.0 + _speed * 1.9)
	var amp := clampf(_speed / 6.0, 0.0, 1.0) * 0.75
	if airborne:
		amp = 0.0
	var s := sin(_phase)
	_leg_l.rotation.x = s * amp
	_leg_r.rotation.x = -s * amp
	_arm_l.rotation.x = -s * amp * 0.8
	_arm_r.rotation.x = s * amp * 0.8
	_torso.position.y = absf(cos(_phase)) * 0.05 * amp
	if airborne:
		_leg_l.rotation.x = 0.4
		_leg_r.rotation.x = -0.2
		_arm_l.rotation.z = -0.6
		_arm_r.rotation.z = 0.6
	else:
		_arm_l.rotation.z = -0.06
		_arm_r.rotation.z = 0.06


func _limb(pivot: Vector3, r: float, length: float, upper: Material, end: Material) -> Node3D:
	var n := Node3D.new()
	n.position = pivot
	add_child(n)
	_part(n, _caps(r, length), Vector3(0, -length * 0.5, 0), upper)
	var tip := SphereMesh.new()
	tip.radius = r * 1.15
	tip.height = r * 2.0
	tip.radial_segments = 8
	tip.rings = 4
	_part(n, tip, Vector3(0, -length + 0.02, -0.03), end)
	return n


func _caps(r: float, h: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = maxf(h, r * 2.0)
	c.radial_segments = 10
	c.rings = 2
	return c


func _part(parent: Node3D, mesh: Mesh, pos: Vector3, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)


func _m(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.8
	return m

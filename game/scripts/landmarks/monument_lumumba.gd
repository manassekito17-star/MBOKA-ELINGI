class_name MonumentLumumba
extends Node3D
## Monument à Patrice Emery Lumumba (Limete, Kinshasa) : statue en bronze,
## bras droit levé, sur un haut piédestal. Modèle simplifié et stylisé,
## dimensions estimées : à affiner avec des photos de référence.

func _ready() -> void:
	var stone := StandardMaterial3D.new()
	stone.albedo_color = Color(0.85, 0.83, 0.78)
	stone.roughness = 0.8
	var bronze := StandardMaterial3D.new()
	bronze.albedo_color = Color(0.30, 0.22, 0.14)
	bronze.metallic = 0.7
	bronze.roughness = 0.45

	# Socle à gradins + piédestal.
	_box(Vector3(16, 0.6, 16), Vector3(0, 0.3, 0), stone)
	_box(Vector3(11, 0.6, 11), Vector3(0, 0.9, 0), stone)
	_box(Vector3(5.0, 9.0, 5.0), Vector3(0, 5.7, 0), stone)
	var body := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(5.0, 10.2, 5.0)
	cs.shape = bs
	cs.position.y = 5.1
	body.add_child(cs)
	add_child(body)

	# Statue (≈ 6 m) : jambes, corps en veste, tête, bras droit levé.
	var base_y := 10.2
	_capsule(0.38, 3.0, Vector3(-0.45, base_y + 1.5, 0), Basis(), bronze)
	_capsule(0.38, 3.0, Vector3(0.45, base_y + 1.5, 0), Basis(), bronze)
	_capsule(0.85, 2.6, Vector3(0, base_y + 4.0, 0), Basis(), bronze)
	var head := SphereMesh.new()
	head.radius = 0.42
	head.height = 0.95
	_mesh(head, Vector3(0, base_y + 5.75, 0), Basis(), bronze)
	_capsule(0.24, 2.4, Vector3(1.05, base_y + 5.9, 0), Basis(Vector3.FORWARD, deg_to_rad(-12)), bronze)
	_capsule(0.24, 2.2, Vector3(-1.0, base_y + 3.9, 0), Basis(Vector3.FORWARD, deg_to_rad(8)), bronze)

	var l := Label3D.new()
	l.text = "Monument Patrice Lumumba"
	l.font_size = 72
	l.outline_size = 14
	l.pixel_size = 0.015
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = Vector3(0, 19.5, 0)
	l.visibility_range_end = 220.0
	add_child(l)


func _box(size: Vector3, pos: Vector3, mat: Material) -> void:
	var b := BoxMesh.new()
	b.size = size
	_mesh(b, pos, Basis(), mat)


func _capsule(r: float, h: float, pos: Vector3, basis: Basis, mat: Material) -> void:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	c.radial_segments = 10
	c.rings = 3
	_mesh(c, pos, basis, mat)


func _mesh(m: Mesh, pos: Vector3, basis: Basis, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.transform = Transform3D(basis, pos)
	add_child(mi)

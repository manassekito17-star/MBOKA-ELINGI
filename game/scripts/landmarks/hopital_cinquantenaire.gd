class_name HopitalCinquantenaire
extends Node3D
## Hôpital du Cinquantenaire (Kasa-Vubu, Kinshasa), inauguré en 2014.
## Reproduit d'après des photos du site :
##  - grands blocs blancs à hublots ronds cerclés de rouge (façade : shader) ;
##  - ailes basses en brique rouge, fenêtres hautes à cadre blanc ;
##  - entrée monumentale : deux piliers en pierre grise, marquise blanche,
##    lettres dorées « HÔPITAL DU CINQUANTENAIRE », croix rouge sur fond bleu ;
##  - grand parvis gris clair, lampadaires blancs, verrière en arc.
## Contours des bâtiments : réels (satellite) ; hauteurs : estimées.

var city: CityBuilder
var view_from := Vector3.ZERO   # point de vue devant le portail (tests / cinématique)
var view_to := Vector3.ZERO


func setup(p_city: CityBuilder) -> HopitalCinquantenaire:
	city = p_city
	return self


func _ready() -> void:
	var main := city.find_building("hopital_principal")
	var site := city.shape("hopital_site")
	if main.is_empty() or site.size() < 3:
		return
	var poly: PackedVector2Array = main["poly"]
	var h: float = main["h"]
	var c := Vector2.ZERO
	for p in poly:
		c += p
	c /= poly.size()
	# Direction de l'entrée : vers la route principale la plus proche du site.
	var road := city.nearest_road_point(c, ["trunk", "primary", "secondary", "tertiary"])
	var out := (road - c).normalized()
	# Le portail est placé sur la limite du terrain, dans cette direction.
	var gate := c
	for i in 400:
		var q := c + out * float(i)
		if not Geometry2D.is_point_in_polygon(q, site):
			gate = c + out * float(maxi(i - 4, 0))
			break
	var fwd := Vector3(out.x, 0, -out.y)
	var basis := Basis.looking_at(fwd, Vector3.UP)      # -Z = vers la rue
	var g := CityBuilder.to_world(gate.x, gate.y)
	view_from = g + fwd * 38.0 + Vector3(0, 5.0, 0)
	view_to = CityBuilder.to_world(c.x, c.y, h * 0.5)
	var white := _mat(Color(0.96, 0.96, 0.95), 0.6)
	var stone := _mat(Color(0.66, 0.63, 0.58), 0.85)
	var gold := _mat(Color(0.95, 0.80, 0.25), 0.35, 0.7)

	# Parvis gris clair entre le portail et le bâtiment principal.
	var depth := gate.distance_to(c)
	var plaza := BoxMesh.new()
	plaza.size = Vector3(70.0, 0.08, depth)
	_mesh(plaza, (g + CityBuilder.to_world(c.x, c.y)) * 0.5 + Vector3(0, 0.1, 0), basis, _mat(Color(0.27, 0.27, 0.26), 0.9))

	# Portail : deux piliers massifs + marquise blanche débordante.
	var body := StaticBody3D.new()
	add_child(body)
	for side in [-1.0, 1.0]:
		_solid(body, Vector3(4.0, 7.5, 7.0), g + basis * Vector3(side * 9.0, 3.75, 0), basis, stone)
	_mesh_box(Vector3(26.0, 0.9, 12.0), g + Vector3(0, 7.9, 0), basis, white)
	_mesh_box(Vector3(26.4, 0.25, 12.4), g + Vector3(0, 8.45, 0), basis, _mat(Color(0.7, 0.72, 0.74), 0.4, 0.5))
	# Lettres dorées sur la marquise, côté rue.
	var sign := Label3D.new()
	sign.text = "HÔPITAL DU CINQUANTENAIRE"
	sign.font_size = 128
	sign.pixel_size = 0.012
	sign.outline_size = 6
	sign.outline_modulate = Color(0.45, 0.32, 0.05)
	sign.modulate = Color(1.0, 0.84, 0.25)
	sign.transform = Transform3D(basis.rotated(Vector3.UP, PI), g + fwd * 6.3 + Vector3(0, 9.6, 0))
	add_child(sign)
	# Croix rouge sur fond bleu, à gauche des lettres.
	var cross_pos := g + basis * Vector3(-11.5, 10.4, -6.2)
	_mesh_box(Vector3(2.4, 2.4, 0.2), cross_pos, basis, _mat(Color(0.12, 0.30, 0.75), 0.5))
	_mesh_box(Vector3(1.8, 0.6, 0.25), cross_pos + fwd * 0.05, basis, _mat(Color(0.85, 0.08, 0.08), 0.5))
	_mesh_box(Vector3(0.6, 1.8, 0.25), cross_pos + fwd * 0.05, basis, _mat(Color(0.85, 0.08, 0.08), 0.5))

	# Verrière en arc (galerie couverte) le long du parvis.
	var arch := CylinderMesh.new()
	arch.top_radius = 4.5
	arch.bottom_radius = 4.5
	arch.height = depth * 0.6
	arch.radial_segments = 18
	var glass := _mat(Color(0.75, 0.85, 0.9), 0.1, 0.3)
	glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	glass.albedo_color.a = 0.45
	glass.cull_mode = BaseMaterial3D.CULL_DISABLED
	var arch_pos := (g + CityBuilder.to_world(c.x, c.y)) * 0.5 + basis * Vector3(24.0, 3.0, 0)
	_mesh(arch, arch_pos, basis * Basis(Vector3.RIGHT, PI / 2.0), glass)
	for k in 5:
		var z := lerpf(-depth * 0.28, depth * 0.28, k / 4.0)
		for side in [-1.0, 1.0]:
			_mesh_box(Vector3(0.25, 3.0, 0.25), arch_pos + basis * Vector3(side * 4.2, -1.5, z), basis, white)

	# Lampadaires blancs sur le parvis.
	for k in 4:
		for side in [-1.0, 1.0]:
			var lp := g + basis * Vector3(side * 16.0, 0, 8.0 + k * depth * 0.22)
			_mesh_box(Vector3(0.18, 5.5, 0.18), lp + Vector3(0, 2.75, 0), basis, white)
			var globe := SphereMesh.new()
			globe.radius = 0.35
			globe.height = 0.7
			var gm := _mat(Color(1, 1, 0.95), 0.3)
			gm.emission_enabled = true
			gm.emission = Color(1, 0.97, 0.85)
			gm.emission_energy_multiplier = 0.5
			_mesh(globe, lp + Vector3(0, 5.7, 0), basis, gm)

	# Ambulances devant l'entrée des urgences.
	for i in 2:
		var amb := Node3D.new()
		amb.transform = Transform3D(basis, g + basis * Vector3(i * 4.0 - 2.0, 0, 16.0))
		_box_local(amb, Vector3(2.1, 2.3, 5.4), Vector3(0, 1.45, 0), white)
		_box_local(amb, Vector3(2.12, 0.35, 5.42), Vector3(0, 1.2, 0), _mat(Color(0.85, 0.08, 0.08), 0.5))
		_box_local(amb, Vector3(1.9, 0.7, 0.05), Vector3(0, 2.0, -2.72), _mat(Color(0.08, 0.1, 0.12), 0.2))
		_box_local(amb, Vector3(0.6, 0.18, 0.3), Vector3(0, 2.7, -2.0), _mat(Color(0.1, 0.3, 1.0), 0.3))
		add_child(amb)

	# Panneau visible de loin.
	var lbl := Label3D.new()
	lbl.text = "Hôpital du Cinquantenaire"
	lbl.font_size = 72
	lbl.outline_size = 14
	lbl.pixel_size = 0.015
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.position = CityBuilder.to_world(c.x, c.y, h + 8.0)
	lbl.visibility_range_end = 600.0
	add_child(lbl)


func _mesh(m: Mesh, pos: Vector3, basis: Basis, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	mi.material_override = mat
	mi.transform = Transform3D(basis, pos)
	add_child(mi)


func _mesh_box(size: Vector3, pos: Vector3, basis: Basis, mat: Material) -> void:
	var bm := BoxMesh.new()
	bm.size = size
	_mesh(bm, pos, basis, mat)


func _solid(body: StaticBody3D, size: Vector3, pos: Vector3, basis: Basis, mat: Material) -> void:
	_mesh_box(size, pos, basis, mat)
	var cs := CollisionShape3D.new()
	var sh := BoxShape3D.new()
	sh.size = size
	cs.shape = sh
	cs.transform = Transform3D(basis, pos)
	body.add_child(cs)


func _box_local(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> void:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	parent.add_child(mi)


static func _mat(col: Color, rough: float, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = rough
	m.metallic = metal
	if rough >= 0.85:
		m.metallic_specular = 0.05   # sols mats : pas de reflet du ciel
	return m

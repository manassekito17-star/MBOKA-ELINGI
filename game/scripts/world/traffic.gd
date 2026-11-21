class_name Traffic
extends Node3D
## Circulation et piétons de Kinshasa (simplifiés) :
##  - taxis jaunes, taxis-bus « Esprit de mort » (minibus jaune et bleu),
##    bus de transport public, voitures particulières, motos-taxis « wewa » ;
##  - piétons sur les rues de quartier.
## Les véhicules suivent les vraies routes (OpenStreetMap) et s'arrêtent
## devant le joueur.

const CAR_COUNT := 34
const PED_COUNT := 20
const PED_VISIBLE := 140.0

var city: CityBuilder
var player: Node3D
var _cars: Array = []
var _peds: Array = []
var _rng := RandomNumberGenerator.new()


func setup(p_city: CityBuilder, p_player: Node3D) -> void:
	city = p_city
	player = p_player
	_rng.seed = 243
	var main_roads := city.road_lines.filter(func(r): return r["type"] in ["trunk", "primary", "secondary", "tertiary", "trunk_link", "unclassified"] and _length(r["pts"]) > 60.0)
	var small_roads := city.road_lines.filter(func(r): return r["type"] in ["residential", "living_street", "unclassified", "service"] and _length(r["pts"]) > 40.0)
	if main_roads.is_empty():
		return
	for i in CAR_COUNT:
		var road: Dictionary = main_roads[_rng.randi() % main_roads.size()]
		var kind := _pick_kind(road["type"])
		var node := _make_vehicle(kind)
		add_child(node)
		_cars.append({
			"node": node, "pts": road["pts"], "w": road["w"], "seg": _rng.randi() % maxi(1, road["pts"].size() - 1),
			"t": _rng.randf(), "dir": 1 if _rng.randf() < 0.5 else -1,
			"speed": {"taxi": 11.0, "bus207": 10.0, "bus": 8.5, "moto": 12.5, "car": 11.5}[kind],
			"cur": 0.0,
		})
	for i in PED_COUNT:
		if small_roads.is_empty():
			break
		var road: Dictionary = small_roads[_rng.randi() % small_roads.size()]
		var a := Avatar.new().randomize_look(_rng)
		add_child(a)
		_peds.append({
			"node": a, "pts": road["pts"], "w": road["w"], "seg": _rng.randi() % maxi(1, road["pts"].size() - 1),
			"t": _rng.randf(), "dir": 1 if _rng.randf() < 0.5 else -1, "speed": 1.1 + _rng.randf() * 0.5,
			"side": 1.0 if _rng.randf() < 0.5 else -1.0,
		})


func _physics_process(delta: float) -> void:
	if player == null:
		return
	var pp := player.global_position
	for c in _cars:
		var node: Node3D = c["node"]
		var ahead := node.global_position - node.global_basis.z * 5.0
		var blocked := ahead.distance_to(pp) < 4.5
		c["cur"] = move_toward(c["cur"], 0.0 if blocked else c["speed"], delta * (14.0 if blocked else 3.0))
		_advance(c, c["cur"] * delta, c["w"] * 0.22, node)
	for p in _peds:
		var node: Avatar = p["node"]
		var far := node.global_position.distance_to(pp) > PED_VISIBLE
		node.visible = not far
		if node.anim:
			node.anim.active = not far
		_advance(p, p["speed"] * delta, p["w"] * 0.5 + 0.9 * p["side"], node)
		if not far:
			node.animate(delta, p["speed"])


## Fait avancer un agent le long de sa polyligne (aller-retour), décalé à droite.
func _advance(a: Dictionary, dist: float, offset: float, node: Node3D) -> void:
	var pts: PackedVector2Array = a["pts"]
	if pts.size() < 2:
		return
	var guard := 0
	while dist > 0.0 and guard < 8:
		guard += 1
		var i0: int = a["seg"]
		var p0 := pts[i0]
		var p1 := pts[i0 + 1]
		var seg_len := maxf(p0.distance_to(p1), 0.01)
		var dt := dist / seg_len
		if a["dir"] > 0:
			a["t"] += dt
			if a["t"] >= 1.0:
				dist = (a["t"] - 1.0) * seg_len
				if i0 + 1 < pts.size() - 1:
					a["seg"] = i0 + 1
					a["t"] = 0.0
				else:
					a["t"] = 1.0
					a["dir"] = -1
			else:
				dist = 0.0
		else:
			a["t"] -= dt
			if a["t"] <= 0.0:
				dist = -a["t"] * seg_len
				if i0 > 0:
					a["seg"] = i0 - 1
					a["t"] = 1.0
				else:
					a["t"] = 0.0
					a["dir"] = 1
			else:
				dist = 0.0
	var i: int = a["seg"]
	var q0 := pts[i]
	var q1 := pts[i + 1]
	var fwd: Vector2 = (q1 - q0).normalized() * float(a["dir"])
	var right := Vector2(fwd.y, -fwd.x)
	var pos := q0.lerp(q1, a["t"]) + right * offset
	node.global_position = CityBuilder.to_world(pos.x, pos.y, 0.1)
	var target_yaw := atan2(-fwd.x, fwd.y)
	node.rotation.y = lerp_angle(node.rotation.y, target_yaw, 0.2)


func _pick_kind(road_type: String) -> String:
	var r := _rng.randf()
	if road_type in ["trunk", "primary", "trunk_link"]:
		return "taxi" if r < 0.35 else "bus207" if r < 0.6 else "bus" if r < 0.7 else "moto" if r < 0.82 else "car"
	return "taxi" if r < 0.3 else "moto" if r < 0.6 else "car" if r < 0.85 else "bus207"


func _make_vehicle(kind: String) -> Node3D:
	var root := Node3D.new()
	var yellow := Color(0.98, 0.78, 0.10)
	match kind:
		"taxi":
			_box(root, Vector3(1.75, 0.7, 4.3), Vector3(0, 0.65, 0), yellow)
			_box(root, Vector3(1.6, 0.55, 2.2), Vector3(0, 1.25, 0.2), Color(0.1, 0.12, 0.14))
			_box(root, Vector3(1.62, 0.08, 2.2), Vector3(0, 1.55, 0.2), yellow)
		"bus207":
			# Minibus Mercedes 207/208 « Esprit de mort » : jaune (ou orange et vert),
			# toit blanc, nez court, porte latérale ouverte.
			var body := yellow if _rng.randf() < 0.8 else Color(0.92, 0.45, 0.10)
			var lower := body if body == yellow else Color(0.15, 0.55, 0.35)
			_box(root, Vector3(2.0, 1.55, 4.1), Vector3(0, 1.55, 0.45), body)
			_box(root, Vector3(2.02, 0.55, 4.12), Vector3(0, 0.95, 0.45), lower)
			_box(root, Vector3(1.96, 0.85, 1.0), Vector3(0, 0.95, -2.05), body)          # capot court
			_box(root, Vector3(2.0, 0.12, 4.0), Vector3(0, 2.38, 0.45), Color(0.95, 0.95, 0.92))  # toit blanc
			_box(root, Vector3(1.9, 0.75, 0.06), Vector3(0, 1.85, -1.58), Color(0.08, 0.1, 0.12))  # pare-brise
			_box(root, Vector3(2.04, 0.6, 3.2), Vector3(0, 1.85, 0.75), Color(0.08, 0.1, 0.12))    # vitres
			_box(root, Vector3(0.06, 1.5, 1.0), Vector3(1.01, 1.4, -0.6), Color(0.05, 0.05, 0.06)) # porte ouverte
			_box(root, Vector3(2.05, 0.22, 0.15), Vector3(0, 0.6, -2.6), Color(0.1, 0.1, 0.1))     # pare-chocs
			_box(root, Vector3(0.9, 0.35, 0.05), Vector3(0, 1.05, -2.56), Color(0.15, 0.15, 0.15)) # calandre
			var logo := TorusMesh.new()
			logo.inner_radius = 0.07
			logo.outer_radius = 0.1
			var lm := MeshInstance3D.new()
			lm.mesh = logo
			lm.rotation.x = PI / 2.0
			lm.position = Vector3(0, 1.08, -2.6)
			lm.material_override = _m(Color(0.9, 0.9, 0.9))
			root.add_child(lm)
			if _rng.randf() < 0.6:
				# Le « chargeur » accroché à la porte.
				var boy := Avatar.new().randomize_look(_rng)
				boy.female = false
				boy.pose = "Idle"
				boy.position = Vector3(1.05, 0.35, -0.6)
				root.add_child(boy)
		"bus":
			_box(root, Vector3(2.5, 2.7, 11.0), Vector3(0, 1.75, 0), Color(0.92, 0.92, 0.9))
			_box(root, Vector3(2.52, 0.5, 11.02), Vector3(0, 0.75, 0), Color(0.10, 0.35, 0.70))
			_box(root, Vector3(2.54, 0.9, 9.0), Vector3(0, 2.2, 0.6), Color(0.1, 0.12, 0.14))
		"moto":
			_box(root, Vector3(0.35, 0.6, 1.9), Vector3(0, 0.6, 0), Color(0.15, 0.15, 0.17))
			var rider := Avatar.new().randomize_look(_rng)
			rider.female = false
			rider.pose = "Sitting_Idle"
			rider.position = Vector3(0, 0.25, 0.35)
			root.add_child(rider)
		_:
			var col: Color = [Color(0.95, 0.95, 0.95), Color(0.12, 0.12, 0.13), Color(0.65, 0.66, 0.68), Color(0.5, 0.08, 0.08)][_rng.randi() % 4]
			_box(root, Vector3(1.9, 0.95, 4.6), Vector3(0, 0.85, 0), col)
			_box(root, Vector3(1.8, 0.6, 2.6), Vector3(0, 1.6, 0.1), Color(0.1, 0.12, 0.14))
	if kind != "moto":
		for x in [-0.85, 0.85]:
			for z in [-1.3, 1.3]:
				var w := CylinderMesh.new()
				w.top_radius = 0.33
				w.bottom_radius = 0.33
				w.height = 0.25
				w.radial_segments = 10
				var wi := MeshInstance3D.new()
				wi.mesh = w
				wi.rotation.z = PI / 2.0
				wi.position = Vector3(x * (1.25 if kind == "bus" else 1.0), 0.33, z * (3.2 if kind == "bus" else 1.0))
				wi.material_override = _m(Color(0.07, 0.07, 0.07))
				root.add_child(wi)
	return root


func _box(parent: Node3D, size: Vector3, pos: Vector3, c: Color) -> void:
	var b := BoxMesh.new()
	b.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = b
	mi.position = pos
	mi.material_override = _m(c)
	parent.add_child(mi)


var _mat_cache := {}
func _m(c: Color) -> StandardMaterial3D:
	if _mat_cache.has(c):
		return _mat_cache[c]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.5
	_mat_cache[c] = m
	return m


func _length(pts: PackedVector2Array) -> float:
	var l := 0.0
	for i in pts.size() - 1:
		l += pts[i].distance_to(pts[i + 1])
	return l

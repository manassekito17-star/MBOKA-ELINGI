class_name Passerelle
extends Node3D
## Passerelle piétonne en acier au-dessus d'un boulevard (ex. boulevard Lumumba,
## Limete). Modèle d'après les reportages vidéo : tablier sur poutres en
## treillis gris clair, garde-corps métalliques, auvent, escaliers aux deux
## extrémités, panneau publicitaire. Entièrement praticable par le joueur.

const DECK_H := 6.2
const WIDTH := 3.0
const STAIR_LEN := 10.5

var a := Vector2.ZERO      # haut de l'escalier 1 (coordonnées carte)
var b := Vector2.ZERO      # haut de l'escalier 2
var road_dir := Vector2.RIGHT

var steel := _mat(Color(0.70, 0.72, 0.74), 0.45, 0.6)
var deck_mat := _mat(Color(0.50, 0.50, 0.50), 0.9, 0.0)
var roof_mat := _mat(Color(0.82, 0.84, 0.86), 0.5, 0.4)
var board := _mat(Color(0.95, 0.95, 0.92), 0.6, 0.0)


func setup(p_a: Vector2, p_b: Vector2) -> Passerelle:
	a = p_a
	b = p_b
	var d := (b - a).normalized()
	road_dir = Vector2(-d.y, d.x)
	return self


func _ready() -> void:
	var A := CityBuilder.to_world(a.x, a.y)
	var B := CityBuilder.to_world(b.x, b.y)
	var length := A.distance_to(B)
	var mid := (A + B) * 0.5
	var basis := Basis.looking_at((B - A).normalized(), Vector3.UP)   # -Z le long du tablier
	var body := StaticBody3D.new()
	add_child(body)
	# Tablier.
	_box(Vector3(WIDTH, 0.35, length + WIDTH), mid + Vector3(0, DECK_H - 0.17, 0), basis, deck_mat, body)
	# Garde-corps pleins (collision) + treillis visuel.
	for side in [-1.0, 1.0]:
		var off: Vector3 = basis.x * float(side) * (WIDTH * 0.5)
		_box(Vector3(0.08, 1.15, length + WIDTH), mid + off + Vector3(0, DECK_H + 0.57, 0), basis, steel, body, true)
		_truss(mid + off, basis, length + WIDTH)
	# Auvent.
	_box(Vector3(WIDTH + 0.8, 0.08, length + WIDTH), mid + Vector3(0, DECK_H + 3.1, 0), basis, roof_mat, null)
	# Piliers.
	for t in [-0.5, -0.18, 0.18, 0.5]:
		var p := A.lerp(B, t + 0.5)
		for side in [-1.0, 1.0]:
			_box(Vector3(0.35, DECK_H, 0.35), p + basis.x * side * (WIDTH * 0.5 - 0.2) + Vector3(0, DECK_H * 0.5, 0), basis, steel, body)
	# Panneau publicitaire côté boulevard.
	_box(Vector3(0.12, 2.2, length * 0.5), mid + basis.x * (WIDTH * 0.5 + 0.15) + Vector3(0, DECK_H + 1.9, 0), basis, board, null)
	var l := Label3D.new()
	l.text = "MBOKA ELENGI\nKIN EZALI MBOKA !"
	l.font_size = 120
	l.pixel_size = 0.012
	l.modulate = Color(0.85, 0.15, 0.1)
	l.transform = Transform3D(basis * Basis(Vector3.UP, PI / 2.0), mid + basis.x * (WIDTH * 0.5 + 0.23) + Vector3(0, DECK_H + 1.9, 0))
	add_child(l)
	# Escaliers aux deux extrémités (parallèles au boulevard).
	var rd := Vector3(road_dir.x, 0, -road_dir.y).normalized()
	_stairs(A, rd, body)
	_stairs(B, -rd, body)


func _stairs(top: Vector3, dir: Vector3, body: StaticBody3D) -> void:
	var basis := Basis.looking_at(dir, Vector3.UP)
	# Palier en haut.
	_box(Vector3(WIDTH + 0.6, 0.35, WIDTH + 0.6), top + Vector3(0, DECK_H - 0.17, 0), basis, deck_mat, body)
	var steps := 20
	var rise := DECK_H / steps
	var run := STAIR_LEN / steps
	for i in steps:
		var c := top + dir * (WIDTH * 0.5 + 0.3 + run * (i + 0.5)) + Vector3(0, DECK_H - rise * (i + 1) + rise * 0.5 - 0.17, 0)
		_box(Vector3(WIDTH - 0.6, 0.12, run + 0.02), c, basis, deck_mat, null)
	# Rampe de collision lisse (le joueur monte sans buter sur chaque marche).
	var slope := atan2(DECK_H, STAIR_LEN)
	var ramp_len := sqrt(DECK_H * DECK_H + STAIR_LEN * STAIR_LEN)
	var center := top + dir * (WIDTH * 0.5 + 0.3 + STAIR_LEN * 0.5) + Vector3(0, DECK_H * 0.5 - 0.2, 0)
	var rb := basis * Basis(Vector3.RIGHT, -slope)
	var cs := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = Vector3(WIDTH - 0.6, 0.2, ramp_len)
	cs.shape = shape
	cs.transform = Transform3D(rb, center)
	body.add_child(cs)
	# Limons et main courante.
	for side in [-1.0, 1.0]:
		var off: Vector3 = basis.x * float(side) * (WIDTH * 0.5 - 0.25)
		_box(Vector3(0.1, 0.3, ramp_len), center + off, rb, steel, null)
		_box(Vector3(0.06, 0.06, ramp_len), center + off + Vector3(0, 1.0, 0), rb, steel, null)
	# Auvent au-dessus de l'escalier.
	_box(Vector3(WIDTH + 0.4, 0.06, ramp_len), center + Vector3(0, 3.2, 0), rb, roof_mat, null)


func _truss(base: Vector3, basis: Basis, length: float) -> void:
	var n := int(length / 2.5)
	for i in n + 1:
		var z := -length * 0.5 + i * length / n
		_box(Vector3(0.1, 1.15, 0.1), base + basis * Vector3(0, DECK_H + 0.57, z), basis, steel, null)
		if i < n:
			var dz := length / n
			var diag := sqrt(dz * dz + 1.1 * 1.1)
			var ang := atan2(1.1, dz) * (1.0 if i % 2 == 0 else -1.0)
			_box(Vector3(0.06, 0.06, diag), base + basis * Vector3(0, DECK_H + 0.57, z + dz * 0.5), basis * Basis(Vector3.RIGHT, ang), steel, null)
	_box(Vector3(0.12, 0.12, length), base + Vector3(0, DECK_H + 1.15, 0), basis, steel, null)


func _box(size: Vector3, pos: Vector3, basis: Basis, mat: Material, body: StaticBody3D, invisible_col := false) -> void:
	var bm := BoxMesh.new()
	bm.size = size
	var mi := MeshInstance3D.new()
	mi.mesh = bm
	mi.material_override = mat
	mi.transform = Transform3D(basis, pos)
	add_child(mi)
	if body:
		var cs := CollisionShape3D.new()
		var sh := BoxShape3D.new()
		sh.size = size + (Vector3(0.2, 0.0, 0.0) if invisible_col else Vector3.ZERO)
		cs.shape = sh
		cs.transform = Transform3D(basis, pos)
		body.add_child(cs)


static func _mat(c: Color, rough: float, metal: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

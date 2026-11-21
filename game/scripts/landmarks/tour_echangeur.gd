class_name TourEchangeur
extends Node3D
## Tour de l'Échangeur de Limete (Kinshasa), modélisée d'après les vues
## aériennes (vidéo « KINSHASA LIMETE - La Tour de l'Échangeur », Kanza TV) :
##  - 4 colonnes rondes en béton disposées en carré ;
##  - sur chaque face, une pile de 4 nacelles dorées en forme de coupe,
##    séparées par des bandeaux vitrés ;
##  - au sommet, un mât en treillis métallique puis une longue flèche jaune ;
##  - au sol, une esplanade circulaire avec un motif en étoile, deux rampes
##    blanches et une pelouse, au cœur de l'échangeur routier.
## Hauteur totale retenue : environ 210 m (valeur communément citée).
## Les proportions sont estimées à partir des images : à affiner.

const TOTAL_HEIGHT := 210.0
const COLUMN_HEIGHT := 158.0
const COLUMN_RADIUS := 3.1
const COLUMN_OFFSET := 6.8      # demi-côté du carré formé par les colonnes
const POD_TIERS := 4
const POD_TOP := 154.0

var concrete := _mat(Color(0.62, 0.58, 0.52), 0.9)
var gold := _mat(Color(0.86, 0.64, 0.24), 0.35, 0.55)
var glass := _mat(Color(0.10, 0.13, 0.15), 0.12, 0.3)
var steel := _mat(Color(0.55, 0.56, 0.58), 0.5, 0.7)
var yellow := _mat(Color(0.93, 0.74, 0.20), 0.4, 0.3)
var paving := _mat(Color(0.30, 0.30, 0.31), 0.95)
var light_paving := _mat(Color(0.78, 0.76, 0.72), 0.9)
var white := _mat(Color(0.93, 0.93, 0.92), 0.6)
var lawn := _mat(Color(0.30, 0.48, 0.18), 1.0)


## Ascenseur : en bas, devant le noyau central ; en haut, sur la plateforme.
const LIFT_BOTTOM := Vector3(0, 0.5, 4.2)
const LIFT_TOP := Vector3(0, COLUMN_HEIGHT - 0.4, 4.2)

signal hint(text: String)

var player: Player
var _hint_shown := false


func _ready() -> void:
	_build_esplanade()
	_build_columns()
	_build_pods()
	_build_top()
	_build_lift()
	_add_label()


func _build_esplanade() -> void:
	_add(_cyl(88.0, 88.0, 0.04, 48), Vector3(0, 0.02, 0), lawn, false)
	_add(_cyl(36.0, 36.0, 0.3, 48), Vector3(0, 0.15, 0), paving, false)
	_add(_cyl(14.0, 14.0, 0.5, 32), Vector3(0, 0.25, 0), light_paving, false)
	# Motif en étoile à 4 branches (allées claires).
	for i in 4:
		var b := Basis(Vector3.UP, PI / 4.0 + i * PI / 2.0)
		var star := BoxMesh.new()
		star.size = Vector3(4.0, 0.32, 34.0)
		_add(star, b * Vector3(0, 0.17, -17.0), light_paving, false, b)
	# Deux grandes rampes blanches en biseau (est et ouest).
	for side in [-1.0, 1.0]:
		var ramp := PrismMesh.new()
		ramp.left_to_right = 1.0 if side > 0 else 0.0
		ramp.size = Vector3(58.0, 7.0, 9.0)
		_add(ramp, Vector3(side * 63.0, 3.5, 0), white, true)
		var body := StaticBody3D.new()
		var cs := CollisionShape3D.new()
		cs.shape = ramp.create_convex_shape()
		cs.position = Vector3(side * 63.0, 3.5, 0)
		body.add_child(cs)
		add_child(body)
	# Collision du socle.
	var base := StaticBody3D.new()
	var bcs := CollisionShape3D.new()
	var cyl := CylinderShape3D.new()
	cyl.radius = 14.0
	cyl.height = 0.5
	bcs.shape = cyl
	bcs.position.y = 0.25
	base.add_child(bcs)
	add_child(base)


func _build_columns() -> void:
	var body := StaticBody3D.new()
	add_child(body)
	for p in _corners():
		var col := _cyl(COLUMN_RADIUS * 0.92, COLUMN_RADIUS, COLUMN_HEIGHT, 20)
		_add(col, Vector3(p.x, COLUMN_HEIGHT * 0.5, p.y), concrete, true)
		var cs := CollisionShape3D.new()
		var shape := CylinderShape3D.new()
		shape.radius = COLUMN_RADIUS
		shape.height = COLUMN_HEIGHT
		cs.shape = shape
		cs.position = Vector3(p.x, COLUMN_HEIGHT * 0.5, p.y)
		body.add_child(cs)
		# Chapeau de colonne.
		_add(_cyl(COLUMN_RADIUS * 1.05, COLUMN_RADIUS * 1.05, 1.2, 20), Vector3(p.x, COLUMN_HEIGHT + 0.6, p.y), concrete, true)
	# Noyau central (escaliers / ascenseurs) visible entre les colonnes.
	var core := BoxMesh.new()
	core.size = Vector3(6.0, COLUMN_HEIGHT - 4.0, 6.0)
	_add(core, Vector3(0, (COLUMN_HEIGHT - 4.0) * 0.5, 0), concrete, true)
	# Bagues de liaison régulières.
	var y := 12.0
	while y < POD_TOP - POD_TIERS * 7.0:
		var ring := BoxMesh.new()
		ring.size = Vector3(COLUMN_OFFSET * 2.0, 0.6, 1.2)
		for i in 4:
			var b := Basis(Vector3.UP, i * PI / 2.0)
			_add(ring, b * Vector3(0, y, COLUMN_OFFSET), concrete, true, b)
		y += 18.0


func _build_pods() -> void:
	# Nacelles dorées : 4 piles (une par face), 4 étages par pile.
	for face in 4:
		var b := Basis(Vector3.UP, face * PI / 2.0)
		var center := b * Vector3(0, 0, COLUMN_OFFSET + 3.2)
		for tier in POD_TIERS:
			var top := POD_TOP - tier * 7.2
			var cup := _cyl(5.6 - tier * 0.25, 4.4 - tier * 0.25, 4.2, 24)
			_add(cup, center + Vector3(0, top - 2.1, 0), gold, true)
			var band := _cyl(4.3 - tier * 0.25, 4.3 - tier * 0.25, 2.6, 24)
			_add(band, center + Vector3(0, top - 5.5, 0), glass, true)
			# Garde-corps du balcon au-dessus de chaque nacelle.
			var rail := _cyl(5.5 - tier * 0.25, 5.5 - tier * 0.25, 0.08, 24)
			_add(rail, center + Vector3(0, top + 1.0, 0), steel, false)
	# Plateforme sommitale.
	var deck := BoxMesh.new()
	deck.size = Vector3(COLUMN_OFFSET * 2.0 + 2.0 * COLUMN_RADIUS, 1.2, COLUMN_OFFSET * 2.0 + 2.0 * COLUMN_RADIUS)
	_add(deck, Vector3(0, COLUMN_HEIGHT - 1.0, 0), concrete, true)


func _build_top() -> void:
	# Mât en treillis : 4 montants + croisillons.
	var mast_base := COLUMN_HEIGHT
	var mast_h := 26.0
	var w := 2.4
	for p in [Vector2(-w, -w), Vector2(w, -w), Vector2(w, w), Vector2(-w, w)]:
		_add(_cyl(0.18, 0.22, mast_h, 6), Vector3(p.x, mast_base + mast_h * 0.5, p.y), steel, true)
	var y := mast_base + 1.5
	while y < mast_base + mast_h:
		for i in 4:
			var b := Basis(Vector3.UP, i * PI / 2.0)
			var bar := BoxMesh.new()
			bar.size = Vector3(w * 2.0, 0.15, 0.15)
			_add(bar, b * Vector3(0, y, w), steel, false, b)
		y += 2.2
	# Antennes et paraboles.
	for i in 3:
		var dish := _cyl(0.9, 0.2, 0.4, 12)
		var b := Basis(Vector3.UP, i * 2.1) * Basis(Vector3.RIGHT, PI / 2.0)
		_add(dish, Vector3(cos(i * 2.1) * 3.6, mast_base + 6.0 + i * 5.0, sin(i * 2.1) * 3.6), white, false, b)
	# Flèche jaune.
	var spire_base := mast_base + mast_h
	var spire_h := TOTAL_HEIGHT - spire_base
	_add(_cyl(0.35, 1.3, spire_h, 10), Vector3(0, spire_base + spire_h * 0.5, 0), yellow, true)
	# Balise d'aviation rouge (clignote).
	var beacon := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.6
	sm.height = 1.2
	beacon.mesh = sm
	var bm := StandardMaterial3D.new()
	bm.albedo_color = Color(1, 0.1, 0.05)
	bm.emission_enabled = true
	bm.emission = Color(1, 0.1, 0.05)
	bm.emission_energy_multiplier = 4.0
	beacon.material_override = bm
	beacon.position = Vector3(0, TOTAL_HEIGHT + 0.4, 0)
	add_child(beacon)
	var tw := create_tween().set_loops()
	tw.tween_property(bm, "emission_energy_multiplier", 0.2, 0.8)
	tw.tween_property(bm, "emission_energy_multiplier", 4.0, 0.8)


func _build_lift() -> void:
	# Porte d'ascenseur lumineuse en bas et en haut.
	for p in [LIFT_BOTTOM, LIFT_TOP]:
		var door := BoxMesh.new()
		door.size = Vector3(2.2, 2.6, 0.1)
		var m := StandardMaterial3D.new()
		m.albedo_color = Color(0.25, 0.22, 0.18)
		m.emission_enabled = true
		m.emission = Color(1.0, 0.75, 0.25)
		m.emission_energy_multiplier = 0.6
		_add(door, Vector3(p.x, p.y + 1.3, 3.05), m, false)
		var l := Label3D.new()
		l.text = "ASCENSEUR"
		l.font_size = 48
		l.pixel_size = 0.01
		l.outline_size = 10
		l.position = Vector3(p.x, p.y + 3.0, 3.15)
		add_child(l)
	# Plateforme panoramique praticable (sol + garde-corps invisibles).
	var body := StaticBody3D.new()
	add_child(body)
	var half := COLUMN_OFFSET + COLUMN_RADIUS
	var deck := CollisionShape3D.new()
	var ds := BoxShape3D.new()
	ds.size = Vector3(half * 2.0, 1.2, half * 2.0)
	deck.shape = ds
	deck.position = Vector3(0, COLUMN_HEIGHT - 1.0, 0)
	body.add_child(deck)
	for i in 4:
		var b := Basis(Vector3.UP, i * PI / 2.0)
		var wall := CollisionShape3D.new()
		var ws := BoxShape3D.new()
		ws.size = Vector3(half * 2.0, 1.3, 0.2)
		wall.shape = ws
		wall.transform = Transform3D(b, b * Vector3(0, COLUMN_HEIGHT + 0.25, half))
		body.add_child(wall)
		var rail := BoxMesh.new()
		rail.size = Vector3(half * 2.0, 0.06, 0.06)
		_add(rail, b * Vector3(0, COLUMN_HEIGHT + 0.9, half), steel, false, b)
	# Collision du noyau (on ne traverse pas la tour).
	var core := CollisionShape3D.new()
	var cs := BoxShape3D.new()
	cs.size = Vector3(6.0, COLUMN_HEIGHT - 4.0, 6.0)
	core.shape = cs
	core.position.y = (COLUMN_HEIGHT - 4.0) * 0.5
	body.add_child(core)


func _physics_process(_delta: float) -> void:
	if player == null:
		return
	var p := player.global_position - global_position
	var near_bottom := p.distance_to(LIFT_BOTTOM) < 3.0
	var near_top := p.distance_to(LIFT_TOP) < 3.0
	if near_bottom or near_top:
		if not _hint_shown:
			_hint_shown = true
			hint.emit("Ascenseur : appuie sur E (ou ACTION) pour %s" % ("monter au sommet (158 m)" if near_bottom else "redescendre"))
		if Input.is_action_just_pressed("action") or player.touch_action:
			player.touch_action = false
			var dest := LIFT_TOP + Vector3(0, 0.6, 2.5) if near_bottom else LIFT_BOTTOM + Vector3(0, 0.6, 12.0)
			player.global_position = global_position + dest
			player.velocity = Vector3.ZERO
			_hint_shown = false
			hint.emit("")
	elif _hint_shown:
		_hint_shown = false
		hint.emit("")


func _add_label() -> void:
	var l := Label3D.new()
	l.text = "Tour de l'Échangeur"
	l.font_size = 96
	l.outline_size = 18
	l.pixel_size = 0.02
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = Vector3(0, 22.0, 0)
	l.modulate = Color(1, 0.93, 0.7)
	l.visibility_range_end = 350.0
	add_child(l)


# --- Utilitaires -----------------------------------------------------------

func _corners() -> Array:
	var o := COLUMN_OFFSET
	return [Vector2(-o, -o), Vector2(o, -o), Vector2(o, o), Vector2(-o, o)]


func _cyl(top: float, bottom: float, h: float, seg: int) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	return c


func _add(mesh: Mesh, pos: Vector3, mat: Material, shadows: bool, basis := Basis()) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.transform = Transform3D(basis, pos)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


static func _mat(c: Color, rough: float, metal: float = 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m

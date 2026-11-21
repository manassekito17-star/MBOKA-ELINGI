class_name WorldMap
extends Control
## Grande carte plein écran (touche M ou bouton CARTE) : vrais bâtiments et
## routes de Kinshasa, icônes des lieux par catégorie, légende, zoom,
## déplacement à la souris ou au doigt, point de destination (clic / toucher).

const CATEGORIES := [
	# [nom affiché, couleur, lettre, catégories OSM]
	["Santé", Color(0.90, 0.25, 0.25), "+", ["hospital", "clinic", "doctors", "pharmacy"]],
	["Écoles et universités", Color(0.30, 0.55, 0.95), "É", ["school", "college", "university", "kindergarten"]],
	["Églises", Color(0.65, 0.45, 0.90), "†", ["place_of_worship", "church", "monastery"]],
	["Commerces et marchés", Color(0.35, 0.80, 0.40), "$", ["supermarket", "convenience", "marketplace", "variety_store", "stationery", "commercial"]],
	["Banques", Color(0.95, 0.78, 0.20), "B", ["bank", "atm"]],
	["Hôtels", Color(0.95, 0.55, 0.20), "H", ["hotel", "motel", "hostel", "apartment"]],
	["Bars et restaurants", Color(0.95, 0.40, 0.55), "R", ["bar", "restaurant", "pub", "biergarten", "cafe", "fast_food"]],
	["Carburant", Color(0.75, 0.75, 0.75), "E", ["fuel"]],
	["Police et administration", Color(0.35, 0.75, 0.85), "P", ["police", "government", "prosecutor", "administrative"]],
	["Monuments et loisirs", Color(1.0, 0.85, 0.35), "★", ["monument", "attraction", "artwork", "cinema", "community_centre", "park", "events_venue", "library"]],
]

var city: CityBuilder
var player: Player
var missions: MissionManager
var waypoint := Vector2(INF, INF)

var _zoom := 0.35          # pixels par mètre
var _center := Vector2.ZERO  # point de la carte au centre de l'écran (m)
var _buildings: Array = []   # PackedVector2Array
var _drag_from := Vector2.ZERO
var _dragging := false
var _moved := 0.0
var _poi_cat := {}           # catégorie OSM -> index CATEGORIES
var _touches := {}           # pincement à deux doigts
var _pinch_dist := 0.0


var view_3d := false
var _cam3d: Camera3D


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	for i in CATEGORIES.size():
		for c in CATEGORIES[i][3]:
			_poi_cat[c] = i
	var bar := HBoxContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT, Control.PRESET_MODE_MINSIZE, 16)
	bar.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	bar.grow_vertical = Control.GROW_DIRECTION_BEGIN
	bar.add_theme_constant_override("separation", 10)
	add_child(bar)
	for e in [["Vue 3D / 2D", _toggle_3d], ["  −  ", func(): _zoom_at(1.0 / 1.4, size * 0.5)], ["  +  ", func(): _zoom_at(1.4, size * 0.5)],
			["Ma position", _center_on_player], ["Effacer destination", _clear_waypoint], ["Fermer (M)", close]]:
		var b := Button.new()
		b.text = e[0]
		b.add_theme_font_size_override("font_size", 20)
		b.pressed.connect(e[1])
		bar.add_child(b)


func setup(p_city: CityBuilder, p_player: Player, p_missions: MissionManager) -> void:
	city = p_city
	player = p_player
	missions = p_missions
	for b in city.data.get("buildings", []):
		var flat: Array = b["p"]
		var poly := PackedVector2Array()
		poly.resize(flat.size() / 2)
		for i in poly.size():
			poly[i] = Vector2(flat[i * 2], flat[i * 2 + 1])
		_buildings.append(poly)


func open() -> void:
	visible = true
	get_tree().paused = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	_center_on_player()


func close() -> void:
	visible = false
	get_tree().paused = false
	if view_3d:
		_toggle_3d()


## Vue 3D : caméra aérienne inclinée au-dessus de la vraie ville.
func _toggle_3d() -> void:
	view_3d = not view_3d
	if view_3d:
		if _cam3d == null:
			_cam3d = Camera3D.new()
			_cam3d.far = 4000.0
			_cam3d.fov = 55.0
			player.get_parent().add_child(_cam3d)
			# Ambiance « maquette » : pas de brume, couleurs plus vives.
			var we := get_tree().root.find_children("*", "WorldEnvironment", true, false)
			if not we.is_empty():
				var env: Environment = (we[0] as WorldEnvironment).environment.duplicate()
				env.fog_enabled = false
				env.adjustment_enabled = true
				env.adjustment_saturation = 1.35
				env.adjustment_contrast = 1.12
				_cam3d.environment = env
		_cam3d.current = true
		_update_cam3d()
	else:
		if _cam3d:
			_cam3d.current = false
		player.camera.current = true
	queue_redraw()


func _update_cam3d() -> void:
	if _cam3d == null or not view_3d:
		return
	var h := clampf(140.0 / _zoom, 40.0, 1400.0)
	var target := CityBuilder.to_world(_center.x, _center.y)
	_cam3d.global_position = target + Vector3(0, h, h * 0.75)
	_cam3d.look_at(target, Vector3.UP)


func has_waypoint() -> bool:
	return waypoint.x != INF


func _center_on_player() -> void:
	if player:
		_center = Vector2(player.global_position.x, -player.global_position.z)
	_update_cam3d()
	queue_redraw()


func _clear_waypoint() -> void:
	waypoint = Vector2(INF, INF)
	queue_redraw()


func _to_screen(p: Vector2) -> Vector2:
	return size * 0.5 + Vector2(p.x - _center.x, -(p.y - _center.y)) * _zoom


func _to_map(s: Vector2) -> Vector2:
	var d := (s - size * 0.5) / _zoom
	return Vector2(_center.x + d.x, _center.y - d.y)


func _zoom_at(factor: float, at: Vector2) -> void:
	var before := _to_map(at)
	_zoom = clampf(_zoom * factor, 0.12, 6.0)
	var after := _to_map(at)
	if not view_3d:
		_center += before - after
	_update_cam3d()
	queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			_zoom_at(1.15, event.position)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			_zoom_at(1.0 / 1.15, event.position)
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				_dragging = true
				_moved = 0.0
				_drag_from = event.position
			else:
				_dragging = false
				if _moved < 8.0 and _touches.size() < 2:
					var p := _to_map(event.position)
					if has_waypoint() and _to_screen(waypoint).distance_to(event.position) < 18.0:
						_clear_waypoint()
					else:
						waypoint = p
					queue_redraw()
	elif event is InputEventMouseMotion and _dragging and _touches.size() < 2:
		_moved += event.relative.length()
		_center += Vector2(-event.relative.x, event.relative.y) / _zoom
		_update_cam3d()
		queue_redraw()
	elif event is InputEventScreenTouch:
		if event.pressed:
			_touches[event.index] = event.position
		else:
			_touches.erase(event.index)
		_pinch_dist = 0.0
	elif event is InputEventScreenDrag:
		_touches[event.index] = event.position
		if _touches.size() == 2:
			var pts := _touches.values()
			var d: float = pts[0].distance_to(pts[1])
			if _pinch_dist > 0.0:
				_zoom_at(d / _pinch_dist, (pts[0] + pts[1]) * 0.5)
			_pinch_dist = d
			_moved = 100.0


func _unhandled_input(event: InputEvent) -> void:
	if visible and (event.is_action_pressed("carte") or event.is_action_pressed("pause")):
		close()
		get_viewport().set_input_as_handled()


func _draw() -> void:
	if city == null:
		return
	if view_3d:
		_draw_overlay_3d()
		return
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.07, 0.08))
	# Tout est dessiné en coordonnées carte grâce à une transformation (y inversé).
	var origin := size * 0.5 + Vector2(-_center.x, _center.y) * _zoom
	draw_set_transform(origin, 0.0, Vector2(_zoom, -_zoom))
	var b := city.bounds
	draw_rect(b, Color(0.13, 0.13, 0.12))
	for g in city.data.get("greens", []):
		var flat: Array = g["p"]
		var poly := PackedVector2Array()
		for i in range(0, flat.size(), 2):
			poly.append(Vector2(flat[i], flat[i + 1]))
		if poly.size() >= 3:
			draw_colored_polygon(poly, Color(0.14, 0.26, 0.14))
	var view := Rect2(_to_map(Vector2(0, size.y)), Vector2(size.x, size.y) / _zoom).grow(30.0)
	for poly in _buildings:
		if view.has_point(poly[0]):
			draw_colored_polygon(poly, Color(0.27, 0.27, 0.29))
	for r in city.road_lines:
		var w: float = r["w"]
		var col := Color(0.42, 0.42, 0.44)
		if r["type"] in ["trunk", "primary", "trunk_link"]:
			col = Color(0.85, 0.62, 0.22)
		elif r["type"] in ["secondary", "tertiary"]:
			col = Color(0.78, 0.78, 0.76)
		elif r["type"] in ["footway", "path"]:
			col = Color(0.32, 0.32, 0.30)
		draw_polyline(r["pts"], col, maxf(w, 1.5 / _zoom))
	# Esplanade de la Tour / monuments de la zone.
	if GameState.zone == "limete":
		draw_circle(Vector2.ZERO, 36.0, Color(0.55, 0.45, 0.25))
	for key in city.data.get("shapes", {}):
		var shp := city.shape(key)
		if shp.size() >= 3:
			draw_colored_polygon(shp, Color(0.45, 0.35, 0.2, 0.5) if key == "hopital_site" else Color(0.75, 0.6, 0.3))
	draw_set_transform(Vector2.ZERO)

	var font := get_theme_default_font()
	# Icônes des lieux (masquées si trop dézoomé, sauf monuments).
	for p in city.pois:
		var ci: int = _poi_cat.get(p["cat"], -1)
		if ci < 0 or (_zoom < 0.5 and ci != CATEGORIES.size() - 1):
			continue
		var s := _to_screen(Vector2(p["x"], p["y"]))
		if not Rect2(Vector2.ZERO, size).grow(20).has_point(s):
			continue
		_icon(s, CATEGORIES[ci][1], CATEGORIES[ci][2], font, 9.0)
		if _zoom > 1.6:
			draw_string(font, s + Vector2(12, 5), p["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(1, 1, 1, 0.85))
	var is_lim := GameState.zone == "limete"
	_icon(_to_screen(Vector2.ZERO), Color(1, 0.8, 0.2) if is_lim else Color(0.9, 0.2, 0.2), "T" if is_lim else "+", font, 13.0)
	draw_string(font, _to_screen(Vector2.ZERO) + Vector2(16, 6), "Tour de l'Échangeur" if is_lim else "Hôpital du Cinquantenaire", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 0.9, 0.6))
	# Objectif de mission.
	if missions and missions.has_target():
		var t := _to_screen(missions.current_target())
		draw_circle(t, 11.0, Color(1, 0.85, 0.1))
		draw_arc(t, 14.0, 0, TAU, 24, Color(0, 0, 0), 2.5)
	# Destination choisie.
	if has_waypoint():
		var w := _to_screen(waypoint)
		draw_colored_polygon(PackedVector2Array([w, w + Vector2(-10, -22), w + Vector2(10, -22)]), Color(0.75, 0.35, 0.95))
		draw_circle(w + Vector2(0, -24), 10.0, Color(0.75, 0.35, 0.95))
	# Joueur.
	if player:
		var pp := _to_screen(Vector2(player.global_position.x, -player.global_position.z))
		var yaw := player.view_yaw()
		var f := Vector2(-sin(yaw), -cos(yaw))
		var rt := Vector2(-f.y, f.x)
		draw_colored_polygon(PackedVector2Array([pp + f * 14.0, pp - f * 9.0 + rt * 9.0, pp - f * 4.0, pp - f * 9.0 - rt * 9.0]), Color(0.2, 0.75, 1.0))
	# Légende.
	var lx := size.x - 300.0
	draw_rect(Rect2(lx - 14, 16, 300, 44 + CATEGORIES.size() * 28), Color(0, 0, 0, 0.7))
	draw_string(font, Vector2(lx, 44), "LÉGENDE", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(1, 0.8, 0.3))
	for i in CATEGORIES.size():
		var y := 72.0 + i * 28.0
		_icon(Vector2(lx + 10, y - 6), CATEGORIES[i][1], CATEGORIES[i][2], font, 9.0)
		draw_string(font, Vector2(lx + 28, y), CATEGORIES[i][0], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
	draw_string(font, Vector2(20, 36), city.data.get("name", "Kinshasa").to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(1, 0.8, 0.3))
	draw_string(font, Vector2(20, 62), "Cliquez ou touchez la carte pour placer une destination.", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.85, 0.85, 0.85))
	# Échelle.
	var meters := 100.0 if _zoom > 0.6 else 500.0
	draw_line(Vector2(20, size.y - 30), Vector2(20 + meters * _zoom, size.y - 30), Color.WHITE, 3.0)
	draw_string(font, Vector2(20, size.y - 38), "%d m" % int(meters), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)
	draw_string(font, Vector2(20, size.y - 8), "© les contributeurs d'OpenStreetMap", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.6))


func _draw_overlay_3d() -> void:
	var font := get_theme_default_font()
	draw_rect(Rect2(0, 0, size.x, 80), Color(0, 0, 0, 0.55))
	draw_string(font, Vector2(20, 36), "KINSHASA — VUE 3D", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color(1, 0.8, 0.3))
	draw_string(font, Vector2(20, 62), "Glissez pour vous déplacer, molette / +  − pour zoomer.", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(0.9, 0.9, 0.9))
	if _cam3d == null:
		return
	for p in city.pois:
		var ci: int = _poi_cat.get(p["cat"], -1)
		if ci < 0:
			continue
		var wp := CityBuilder.to_world(p["x"], p["y"], 6.0)
		if _cam3d.is_position_behind(wp):
			continue
		var s := _cam3d.unproject_position(wp)
		if Rect2(Vector2.ZERO, size).has_point(s):
			_icon(s, CATEGORIES[ci][1], CATEGORIES[ci][2], font, 8.0)
	if player:
		var s := _cam3d.unproject_position(player.global_position + Vector3(0, 3, 0))
		draw_circle(s, 9.0, Color(0, 0, 0))
		draw_circle(s, 7.0, Color(0.2, 0.75, 1.0))


func _icon(p: Vector2, c: Color, letter: String, font: Font, r: float) -> void:
	draw_circle(p, r + 2.0, Color(0, 0, 0, 0.85))
	draw_circle(p, r, c)
	draw_string(font, p + Vector2(-r * 0.5, r * 0.55), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, int(r * 1.5), Color(0.05, 0.05, 0.05))

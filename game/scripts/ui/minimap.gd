class_name Minimap
extends Control
## Mini-carte (nord en haut) dessinant les vraies routes autour du joueur,
## la position du joueur et l'objectif courant.

const RANGE := 260.0   # mètres affichés du centre au bord

var city: CityBuilder
var player: Player
var missions: MissionManager
var world_map: WorldMap
var _timer := 0.0


func _process(delta: float) -> void:
	_timer += delta
	if _timer > 0.1:
		_timer = 0.0
		queue_redraw()


func _draw() -> void:
	var r := size * 0.5
	var R := r.x
	draw_circle(r, R, Color(0.10, 0.09, 0.08, 0.82))
	if city == null or player == null:
		return
	var pp := Vector2(player.global_position.x, -player.global_position.z)
	var k := r.x / RANGE
	var view := Rect2(pp - Vector2(RANGE, RANGE) * 1.1, Vector2(RANGE, RANGE) * 2.2)
	for road in city.road_lines:
		var pts: PackedVector2Array = road["pts"]
		var w := 1.0
		var col := Color(0.75, 0.55, 0.38)
		if road["type"] in ["trunk", "primary", "trunk_link"]:
			w = 3.0
			col = Color(0.95, 0.70, 0.25)
		elif road["type"] in ["secondary", "tertiary"]:
			w = 2.0
			col = Color(0.95, 0.92, 0.85)
		for i in pts.size() - 1:
			if not view.has_point(pts[i]) and not view.has_point(pts[i + 1]):
				continue
			var a := Vector2(pts[i].x - pp.x, -(pts[i].y - pp.y)) * k
			var b := Vector2(pts[i + 1].x - pp.x, -(pts[i + 1].y - pp.y)) * k
			if a.length() > R - 3.0 and b.length() > R - 3.0:
				continue
			draw_line(r + a.limit_length(R - 3.0), r + b.limit_length(R - 3.0), col, w)
	# Tour de l'Échangeur.
	var tower := r + Vector2(-pp.x, pp.y) * k
	if tower.distance_to(r) < R - 4.0:
		draw_circle(tower, 5.0, Color(0.95, 0.75, 0.2))
	# Objectif (sur le bord si hors de la carte).
	if missions and missions.has_target():
		var t := missions.current_target()
		var d := Vector2(t.x - pp.x, -(t.y - pp.y)) * k
		if d.length() > r.x - 8.0:
			d = d.normalized() * (r.x - 8.0)
		draw_circle(r + d, 6.0, Color(1, 0.85, 0.1))
		draw_arc(r + d, 8.0, 0, TAU, 16, Color(0, 0, 0, 0.7), 2.0)
	# Destination choisie sur la grande carte.
	if world_map and world_map.has_waypoint():
		var wd := Vector2(world_map.waypoint.x - pp.x, -(world_map.waypoint.y - pp.y)) * k
		if wd.length() > R - 8.0:
			wd = wd.normalized() * (R - 8.0)
		draw_circle(r + wd, 6.0, Color(0.75, 0.35, 0.95))
	# Joueur (flèche orientée selon la caméra).
	var yaw := player.view_yaw()
	var fwd := Vector2(-sin(yaw), -cos(yaw))
	var right := Vector2(-fwd.y, fwd.x)
	draw_colored_polygon(PackedVector2Array([r + fwd * 9.0, r - fwd * 6.0 + right * 6.0, r - fwd * 3.0, r - fwd * 6.0 - right * 6.0]), Color(0.2, 0.75, 1.0))
	draw_arc(r, R - 1.5, 0, TAU, 64, Color(0.05, 0.05, 0.05, 0.95), 4.0)
	draw_arc(r, R - 4.0, 0, TAU, 64, Color(1, 1, 1, 0.35), 1.5)
	draw_circle(Vector2(r.x, 9), 9.0, Color(0.1, 0.1, 0.1))
	draw_string(get_theme_default_font(), Vector2(r.x - 5, 14), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)

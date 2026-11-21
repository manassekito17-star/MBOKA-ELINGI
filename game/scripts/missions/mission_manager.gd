class_name MissionManager
extends Node3D
## Gère les missions : personnage qui la propose, étapes, chronomètre,
## récompenses. Communique avec l'interface (HUD) par signaux.

signal offer(mission: Dictionary)              # le joueur est près d'un donneur de mission
signal offer_closed
signal objective_changed(text: String, label: String)
signal notify(text: String)
signal timer_changed(seconds_left: float)       # -1 = pas de chronomètre

var city: CityBuilder
var player: Node3D
var active: Dictionary = {}
var step_index := -1
var target := Vector2.ZERO        # objectif courant (coordonnées carte)
var time_left := -1.0

var _giver: Node3D
var _giver_mission: Dictionary = {}
var _offer_open := false
var _beam: MeshInstance3D
var _declined_at := Vector2(INF, INF)


func setup(p_city: CityBuilder, p_player: Node3D) -> void:
	city = p_city
	player = p_player
	_beam = _make_beam()
	add_child(_beam)
	_beam.visible = false
	_spawn_next_giver()


func has_target() -> bool:
	return not active.is_empty() or not _giver_mission.is_empty()


func current_target() -> Vector2:
	if not active.is_empty():
		return target
	if _giver:
		return Vector2(_giver.global_position.x, -_giver.global_position.z)
	return Vector2.ZERO


func accept() -> void:
	if _giver_mission.is_empty():
		return
	active = _giver_mission
	_giver_mission = {}
	_offer_open = false
	offer_closed.emit()
	if _giver:
		_giver.queue_free()
		_giver = null
	notify.emit("Mission acceptée : %s" % active["title"])
	_start_step(0)


func decline() -> void:
	_offer_open = false
	_declined_at = _player_map_pos()
	offer_closed.emit()


func _physics_process(delta: float) -> void:
	if player == null:
		return
	var pp := _player_map_pos()
	# Proposition de mission.
	if _giver and active.is_empty():
		var gp := Vector2(_giver.global_position.x, -_giver.global_position.z)
		var near := pp.distance_to(gp) < 3.5
		if near and not _offer_open and pp.distance_to(_declined_at) > 6.0:
			_offer_open = true
			offer.emit(_giver_mission)
		elif not near and _offer_open:
			_offer_open = false
			offer_closed.emit()
		if pp.distance_to(_declined_at) > 6.0:
			_declined_at = Vector2(INF, INF)
		_giver.rotation.y = lerp_angle(_giver.rotation.y, atan2(-(pp.x - gp.x), (pp.y - gp.y)), 0.1)
	# Mission en cours.
	if active.is_empty():
		return
	var step: Dictionary = active["steps"][step_index]
	if time_left >= 0.0:
		time_left -= delta
		timer_changed.emit(time_left)
		if time_left <= 0.0:
			notify.emit("Temps écoulé ! Mission échouée : %s" % active["title"])
			_fail()
			return
	if pp.distance_to(target) <= step.get("radius", 15.0):
		var cost: int = step.get("cost", 0)
		if cost > 0:
			if not GameState.can_pay(cost):
				notify.emit("Pas assez d'argent (%s FC nécessaires)." % _fmt(cost))
				return
			GameState.add_money(-cost)
		notify.emit(step.get("done", "Objectif atteint."))
		if step_index + 1 < active["steps"].size():
			_start_step(step_index + 1)
		else:
			_complete()


func _start_step(i: int) -> void:
	step_index = i
	var step: Dictionary = active["steps"][i]
	var raw := _resolve(step)
	target = city.nearest_road_point(raw) if raw.distance_to(Vector2.ZERO) > 40.0 else raw
	time_left = step.get("timer", -1.0)
	timer_changed.emit(time_left)
	_beam.visible = true
	_beam.global_position = CityBuilder.to_world(target.x, target.y, 60.0)
	objective_changed.emit(step["text"], step["label"])


func _complete() -> void:
	var reward: int = active.get("reward", 0)
	GameState.add_money(reward)
	GameState.mark_completed(active["id"])
	notify.emit("MISSION RÉUSSIE : %s   +%s FC" % [active["title"], _fmt(reward)])
	_end_active()


func _fail() -> void:
	_end_active()


func _end_active() -> void:
	active = {}
	step_index = -1
	time_left = -1.0
	timer_changed.emit(-1.0)
	_beam.visible = false
	objective_changed.emit("", "")
	_spawn_next_giver()


func _spawn_next_giver() -> void:
	for m in MissionData.MISSIONS:
		if m.get("zone", "limete") != GameState.zone:
			continue
		if not GameState.completed.has(m["id"]):
			_giver_mission = m
			var raw := Vector2(m["giver_at"][0], m["giver_at"][1])
			var p := city.nearest_road_point(raw, ["trunk", "primary", "secondary", "tertiary", "unclassified", "residential"])
			p += (raw - p).limit_length(2.5)
			_giver = _make_giver(m["giver"])
			add_child(_giver)
			_giver.global_position = CityBuilder.to_world(p.x, p.y, 0.1)
			objective_changed.emit("Va parler à %s (point jaune « ! »)" % m["giver"], m["giver"])
			return
	_giver_mission = {}
	var other := "le centre-ville (Cinquantenaire)" if GameState.zone == "limete" else "Limete (Échangeur)"
	objective_changed.emit("Missions de la zone terminées ! Prends un taxi (MENU) vers %s." % other, "")


func _resolve(step: Dictionary) -> Vector2:
	if step.has("poi"):
		var p := city.find_poi(step["poi"])
		if not p.is_empty():
			return Vector2(p["x"], p["y"])
	if step.has("at"):
		return Vector2(step["at"][0], step["at"][1])
	return Vector2.ZERO


func _player_map_pos() -> Vector2:
	return Vector2(player.global_position.x, -player.global_position.z)


func _make_giver(giver_name: String) -> Node3D:
	var root := Node3D.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(giver_name)
	var a := Avatar.new().randomize_look(rng)
	a.female = giver_name.begins_with("Mama")
	a.pose = "Idle_Talking"
	root.add_child(a)
	var l := Label3D.new()
	l.text = "!  %s" % giver_name
	l.font_size = 64
	l.outline_size = 12
	l.pixel_size = 0.008
	l.modulate = Color(1, 0.85, 0.1)
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position.y = 2.4
	l.no_depth_test = true
	root.add_child(l)
	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 1.1
	tm.outer_radius = 1.3
	ring.mesh = tm
	ring.position.y = 0.05
	var rm := StandardMaterial3D.new()
	rm.albedo_color = Color(1, 0.8, 0.1)
	rm.emission_enabled = true
	rm.emission = Color(1, 0.75, 0.1)
	rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = rm
	root.add_child(ring)
	return root


func _make_beam() -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var c := CylinderMesh.new()
	c.top_radius = 1.6
	c.bottom_radius = 1.6
	c.height = 120.0
	c.radial_segments = 16
	c.cap_top = false
	c.cap_bottom = false
	mi.mesh = c
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(1.0, 0.8, 0.15, 0.35)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position.y = 60.0
	return mi


static func _fmt(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = " " + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out

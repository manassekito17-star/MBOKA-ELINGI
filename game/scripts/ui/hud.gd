class_name HUD
extends CanvasLayer
## Interface en jeu : argent, objectif, chronomètre, notifications,
## dialogue de mission, mini-carte, menu pause, écran de chargement.

var missions: MissionManager
var player: Player

var _money: Label
var _objective: Label
var _distance: Label
var _timer: Label
var _hint: Label
var _notes: VBoxContainer
var _dialog: PanelContainer
var _dialog_title: Label
var _dialog_text: Label
var _minimap: Minimap
var world_map: WorldMap
var _touch: TouchControls
var _pause: PanelContainer
var _loading: ColorRect
var _loading_bar: ProgressBar
var _loading_label: Label
var _loading_title: Label
const TAXI_PRICE := 1000


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_touch = TouchControls.new()
	root.add_child(_touch)
	_touch.visible = DisplayServer.is_touchscreen_available()

	# Argent (en haut à gauche).
	_money = _label(34, Color(0.45, 0.95, 0.45))
	_money.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_money.position = Vector2(-330, 54)
	_money.custom_minimum_size = Vector2(310, 0)
	_money.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_money.add_theme_constant_override("outline_size", 10)
	root.add_child(_money)
	_on_money(GameState.money)
	GameState.money_changed.connect(_on_money)

	# Objectif (en haut au centre).
	var obj_box := VBoxContainer.new()
	obj_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	obj_box.position = Vector2(-330, -118)
	obj_box.custom_minimum_size = Vector2(660, 0)
	obj_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(obj_box)
	_objective = _label(22, Color(1, 0.9, 0.5))
	_objective.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	obj_box.add_child(_objective)
	_distance = _label(18, Color(1, 1, 1, 0.9))
	_distance.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	obj_box.add_child(_distance)
	_timer = _label(30, Color(1, 0.45, 0.35))
	_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	obj_box.add_child(_timer)
	_hint = _label(22, Color(0.6, 0.95, 1.0))
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	obj_box.add_child(_hint)

	# Notifications (centre).
	_notes = VBoxContainer.new()
	_notes.set_anchors_preset(Control.PRESET_CENTER)
	_notes.position = Vector2(-360, -170)
	_notes.custom_minimum_size = Vector2(720, 0)
	_notes.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(_notes)

	# Mini-carte (en haut à droite).
	_minimap = Minimap.new()
	if DisplayServer.is_touchscreen_available() and not OS.has_feature("pc"):
		_minimap.set_anchors_preset(Control.PRESET_TOP_LEFT)
		_minimap.position = Vector2(16, 16)
	else:
		_minimap.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
		_minimap.position = Vector2(20, -230)
	_minimap.custom_minimum_size = Vector2(210, 210)
	_minimap.size = Vector2(210, 210)
	_minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_minimap.clip_contents = true
	root.add_child(_minimap)

	# Bouton menu.
	var menu_btn := Button.new()
	menu_btn.text = "  MENU  "
	menu_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	menu_btn.position = Vector2(-120, 12)
	menu_btn.add_theme_font_size_override("font_size", 20)
	menu_btn.pressed.connect(toggle_pause)
	root.add_child(menu_btn)
	var map_btn := Button.new()
	map_btn.text = "  CARTE  "
	map_btn.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	map_btn.position = Vector2(-240, 12)
	map_btn.add_theme_font_size_override("font_size", 20)
	map_btn.pressed.connect(func(): world_map.open())
	root.add_child(map_btn)

	world_map = WorldMap.new()
	root.add_child(world_map)

	_build_dialog(root)
	_build_pause(root)
	_build_loading(root)


func bind(p_player: Player, p_missions: MissionManager, city: CityBuilder) -> void:
	player = p_player
	missions = p_missions
	_touch.player = player
	_minimap.city = city
	_minimap.player = player
	_minimap.missions = missions
	_minimap.world_map = world_map
	world_map.setup(city, player, missions)
	missions.offer.connect(_on_offer)
	missions.offer_closed.connect(func(): _dialog.visible = false)
	missions.objective_changed.connect(_on_objective)
	missions.notify.connect(notify)
	missions.timer_changed.connect(_on_timer)


func set_loading(ratio: float, text: String) -> void:
	_loading.visible = ratio < 1.0
	_loading_bar.value = ratio * 100.0
	_loading_label.text = text


func _process(_delta: float) -> void:
	if player and missions and missions.has_target():
		var pp := Vector2(player.global_position.x, -player.global_position.z)
		var d := pp.distance_to(missions.current_target())
		_distance.text = "%d m" % int(d) if d >= 1.0 else ""
	elif _distance:
		_distance.text = ""
	if Input.is_action_just_pressed("carte") and not world_map.visible and not _pause.visible:
		world_map.open()
		return
	var map_open := world_map.visible
	_minimap.visible = not map_open
	_notes.visible = not map_open
	_objective.get_parent().visible = not map_open
	if map_open:
		return
	if Input.is_action_just_pressed("pause"):
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		else:
			toggle_pause()
	if _dialog.visible and (Input.is_action_just_pressed("action") or (player and player.touch_action)):
		if player:
			player.touch_action = false
		missions.accept()


func set_title(t: String) -> void:
	if _loading_title:
		_loading_title.text = t


func _travel(target: String) -> void:
	if target == GameState.zone:
		return
	if not GameState.can_pay(TAXI_PRICE):
		notify("Pas assez d'argent pour le taxi (%s FC)." % MissionManager._fmt(TAXI_PRICE))
		return
	GameState.add_money(-TAXI_PRICE)
	GameState.zone = target
	GameState.save_game()
	get_tree().paused = false
	get_tree().reload_current_scene()


func show_hint(text: String) -> void:
	_hint.text = text


func notify(text: String) -> void:
	if text.begins_with("MISSION RÉUSSIE"):
		_banner(text)
		return
	var l := _label(24, Color.WHITE)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.text = text
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _style(Color(0.08, 0.07, 0.06, 0.82), Color(0.95, 0.7, 0.2)))
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(l)
	_notes.add_child(panel)
	var tw := create_tween()
	tw.tween_interval(4.0)
	tw.tween_property(panel, "modulate:a", 0.0, 0.8)
	tw.tween_callback(panel.queue_free)


func _banner(text: String) -> void:
	var parts := text.split("   ")
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.position = Vector2(-500, -120)
	box.custom_minimum_size = Vector2(1000, 0)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var band := ColorRect.new()
	band.color = Color(0, 0, 0, 0.55)
	band.custom_minimum_size = Vector2(1000, 150)
	band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(band)
	var big := _label(64, Color(0.98, 0.76, 0.18))
	big.text = "MISSION RÉUSSIE"
	big.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	big.add_theme_constant_override("outline_size", 14)
	big.set_anchors_preset(Control.PRESET_FULL_RECT)
	big.position.y = 14
	band.add_child(big)
	var small := _label(26, Color.WHITE)
	small.text = text.trim_prefix("MISSION RÉUSSIE : ")
	small.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	small.set_anchors_preset(Control.PRESET_FULL_RECT)
	small.position.y = 98
	band.add_child(small)
	_notes.get_parent().add_child(box)
	box.modulate.a = 0.0
	var tw := create_tween()
	tw.tween_property(box, "modulate:a", 1.0, 0.3)
	tw.tween_interval(3.5)
	tw.tween_property(box, "modulate:a", 0.0, 0.8)
	tw.tween_callback(box.queue_free)


func toggle_pause() -> void:
	_pause.visible = not _pause.visible
	get_tree().paused = _pause.visible
	if _pause.visible:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# --- Construction de l'interface -------------------------------------------

func _build_dialog(root: Control) -> void:
	_dialog = PanelContainer.new()
	_dialog.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_dialog.custom_minimum_size = Vector2(760, 0)
	_dialog.position = Vector2(-380, -330)
	_dialog.add_theme_stylebox_override("panel", _style(Color(0.10, 0.08, 0.06, 0.93), Color(0.95, 0.7, 0.2)))
	_dialog.visible = false
	root.add_child(_dialog)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	_dialog.add_child(v)
	_dialog_title = _label(28, Color(1, 0.8, 0.3))
	v.add_child(_dialog_title)
	_dialog_text = _label(21, Color.WHITE)
	_dialog_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_text.custom_minimum_size = Vector2(720, 0)
	v.add_child(_dialog_text)
	var h := HBoxContainer.new()
	h.alignment = BoxContainer.ALIGNMENT_END
	h.add_theme_constant_override("separation", 16)
	v.add_child(h)
	var no := Button.new()
	no.text = "  Plus tard  "
	no.add_theme_font_size_override("font_size", 22)
	no.pressed.connect(func(): missions.decline())
	h.add_child(no)
	var yes := Button.new()
	yes.text = "  Accepter (E)  "
	yes.add_theme_font_size_override("font_size", 22)
	yes.pressed.connect(func(): missions.accept())
	h.add_child(yes)


func _build_pause(root: Control) -> void:
	_pause = PanelContainer.new()
	_pause.process_mode = Node.PROCESS_MODE_ALWAYS
	_pause.set_anchors_preset(Control.PRESET_CENTER)
	_pause.custom_minimum_size = Vector2(560, 0)
	_pause.position = Vector2(-280, -300)
	_pause.add_theme_stylebox_override("panel", _style(Color(0.08, 0.07, 0.06, 0.95), Color(0.95, 0.7, 0.2)))
	_pause.visible = false
	root.add_child(_pause)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	_pause.add_child(v)
	var t := _label(34, Color(1, 0.8, 0.3))
	t.text = "MBOKA ELENGI"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var help := _label(17, Color(0.9, 0.9, 0.9))
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.text = "PC : Z/Q/S/D ou flèches pour marcher, Maj pour courir, Espace pour sauter, clic pour orienter la caméra à la souris, Échap pour libérer la souris, E pour accepter une mission.\nMobile : joystick à gauche, glisser à droite pour la caméra.\n\nCarte : © les contributeurs d'OpenStreetMap (ODbL)."
	v.add_child(help)
	var travel := _label(20, Color(1, 0.85, 0.4))
	travel.text = "Voyager en taxi (%s FC) :" % MissionManager._fmt(TAXI_PRICE)
	v.add_child(travel)
	for dest in [["Limete — Tour de l'Échangeur", "limete"], ["Centre-ville — Hôpital du Cinquantenaire", "centre"]]:
		var tb := Button.new()
		tb.text = "  " + dest[0] + ("  (vous êtes ici)" if GameState.zone == dest[1] else "")
		tb.disabled = GameState.zone == dest[1]
		tb.add_theme_font_size_override("font_size", 20)
		tb.pressed.connect(_travel.bind(dest[1]))
		v.add_child(tb)
	for entry in [["Reprendre", toggle_pause], ["Recommencer la progression", _reset], ["Quitter le jeu", func(): get_tree().quit()]]:
		var b := Button.new()
		b.text = entry[0]
		b.add_theme_font_size_override("font_size", 24)
		b.pressed.connect(entry[1])
		v.add_child(b)


func _build_loading(root: Control) -> void:
	_loading = ColorRect.new()
	_loading.color = Color(0.07, 0.06, 0.05)
	_loading.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(_loading)
	var v := VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_CENTER)
	v.custom_minimum_size = Vector2(620, 0)
	v.position = Vector2(-310, -90)
	v.add_theme_constant_override("separation", 16)
	_loading.add_child(v)
	var t := _label(54, Color(0.97, 0.73, 0.23))
	t.text = "MBOKA ELENGI"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(t)
	var st := _label(20, Color(0.9, 0.85, 0.75))
	_loading_title = st
	st.text = "Kinshasa"
	st.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(st)
	_loading_bar = ProgressBar.new()
	_loading_bar.custom_minimum_size = Vector2(620, 26)
	_loading_bar.show_percentage = false
	v.add_child(_loading_bar)
	_loading_label = _label(18, Color(0.8, 0.8, 0.8))
	_loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_loading_label)


func _reset() -> void:
	GameState.reset_progress()
	get_tree().paused = false
	get_tree().reload_current_scene()


func _on_money(amount: int) -> void:
	_money.text = "%s FC" % MissionManager._fmt(amount)


func _on_offer(m: Dictionary) -> void:
	_dialog_title.text = "%s — %s" % [m["giver"], m["title"]]
	_dialog_text.text = "%s\n\nRécompense : %s FC" % [m["intro"], MissionManager._fmt(m["reward"])]
	_dialog.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _on_objective(text: String, _label_name: String) -> void:
	_objective.text = text


func _on_timer(t: float) -> void:
	_timer.text = "" if t < 0.0 else "%d:%02d" % [int(t) / 60, int(t) % 60]


func _label(size_px: int, color: Color) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", size_px)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 6)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


func _style(bg: Color, border: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(2)
	s.set_corner_radius_all(12)
	s.set_content_margin_all(18)
	return s

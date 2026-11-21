class_name TouchControls
extends Control
## Commandes tactiles : joystick virtuel à gauche, glisser à droite pour
## tourner la caméra, boutons SAUT / COURIR. Multi-touch (10 doigts).

var player: Player
var joy_radius := 90.0
var _joy_finger := -1
var _joy_center := Vector2.ZERO
var _joy_knob := Vector2.ZERO
var _cam_finger := -1
var _run := false
var _btn_jump := Rect2()
var _btn_run := Rect2()


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func _layout() -> void:
	var s := size
	var b := clampf(s.y * 0.16, 70.0, 130.0)
	_btn_jump = Rect2(s.x - b * 1.25, s.y - b * 1.35, b, b)
	_btn_run = Rect2(s.x - b * 2.55, s.y - b * 1.0, b * 1.1, b * 0.75)
	joy_radius = clampf(s.y * 0.14, 60.0, 110.0)


func _input(event: InputEvent) -> void:
	if player == null or not visible:
		return
	_layout()
	if event is InputEventScreenTouch:
		if event.pressed:
			if _btn_jump.has_point(event.position):
				player.touch_jump = true
				queue_redraw()
				get_viewport().set_input_as_handled()
				return
			if _btn_run.has_point(event.position):
				_run = not _run
				player.touch_run = _run
				queue_redraw()
				get_viewport().set_input_as_handled()
				return
			if event.position.x < size.x * 0.4 and event.position.y > size.y * 0.35 and _joy_finger == -1:
				_joy_finger = event.index
				_joy_center = event.position
				_joy_knob = event.position
			elif event.position.x >= size.x * 0.4 and _cam_finger == -1 and event.position.y > size.y * 0.2:
				_cam_finger = event.index
		else:
			if event.index == _joy_finger:
				_joy_finger = -1
				player.touch_move = Vector2.ZERO
			elif event.index == _cam_finger:
				_cam_finger = -1
		queue_redraw()
	elif event is InputEventScreenDrag:
		if event.index == _joy_finger:
			var d: Vector2 = (event.position - _joy_center).limit_length(joy_radius)
			_joy_knob = _joy_center + d
			player.touch_move = d / joy_radius
			queue_redraw()
		elif event.index == _cam_finger:
			player.look_touch(event.relative)


func _draw() -> void:
	_layout()
	var font := get_theme_default_font()
	if _joy_finger != -1:
		draw_circle(_joy_center, joy_radius, Color(1, 1, 1, 0.12))
		draw_arc(_joy_center, joy_radius, 0, TAU, 40, Color(1, 1, 1, 0.5), 3.0)
		draw_circle(_joy_knob, joy_radius * 0.42, Color(1, 1, 1, 0.45))
	else:
		var hint := Vector2(joy_radius * 1.5, size.y - joy_radius * 1.5)
		draw_arc(hint, joy_radius, 0, TAU, 40, Color(1, 1, 1, 0.25), 3.0)
		draw_circle(hint, joy_radius * 0.42, Color(1, 1, 1, 0.18))
	draw_circle(_btn_jump.get_center(), _btn_jump.size.x * 0.5, Color(0.1, 0.1, 0.1, 0.45))
	draw_arc(_btn_jump.get_center(), _btn_jump.size.x * 0.5, 0, TAU, 32, Color(1, 1, 1, 0.7), 3.0)
	draw_string(font, _btn_jump.get_center() + Vector2(-28, 8), "SAUT", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color.WHITE)
	draw_rect(_btn_run, Color(0.95, 0.6, 0.1, 0.75) if _run else Color(0.1, 0.1, 0.1, 0.45))
	draw_rect(_btn_run, Color(1, 1, 1, 0.7), false, 3.0)
	draw_string(font, _btn_run.position + Vector2(10, _btn_run.size.y * 0.62), "COURIR", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color.WHITE)

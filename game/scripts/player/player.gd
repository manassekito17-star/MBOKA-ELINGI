class_name Player
extends CharacterBody3D
## Joueur : déplacement à la 3e personne, caméra orbitale.
## Commandes : clavier/souris, manette, ou commandes tactiles (TouchControls).

const WALK_SPEED := 4.2
const RUN_SPEED := 8.5
const JUMP_VELOCITY := 5.2
const MOUSE_SENS := 0.0028
const PAD_SENS := 2.6
const TOUCH_SENS := 0.006

var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)

# Entrées tactiles (remplies par TouchControls).
var touch_move := Vector2.ZERO
var touch_run := false
var touch_jump := false

var avatar: Avatar
var camera: Camera3D
var _yaw: Node3D
var _pitch: Node3D
var _arm: SpringArm3D


func _ready() -> void:
	var shape := CapsuleShape3D.new()
	shape.radius = 0.35
	shape.height = 1.8
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position.y = 0.9
	add_child(cs)

	avatar = Avatar.new().setup(Color(0.33, 0.21, 0.14), Color(0.95, 0.55, 0.08), Color(0.12, 0.14, 0.24))
	add_child(avatar)

	_yaw = Node3D.new()
	_yaw.position.y = 1.6
	add_child(_yaw)
	_yaw.top_level = true
	_pitch = Node3D.new()
	_pitch.rotation.x = deg_to_rad(-14)
	_yaw.add_child(_pitch)
	_arm = SpringArm3D.new()
	_arm.spring_length = 5.0
	_arm.margin = 0.3
	_arm.add_excluded_object(get_rid())
	var probe := SphereShape3D.new()
	probe.radius = 0.25
	_arm.shape = probe
	_pitch.add_child(_arm)
	camera = Camera3D.new()
	camera.far = 3500.0
	camera.fov = 70.0
	_arm.add_child(camera)
	camera.current = true


func look(delta_yaw: float, delta_pitch: float) -> void:
	_yaw.rotation.y -= delta_yaw
	_pitch.rotation.x = clampf(_pitch.rotation.x - delta_pitch, deg_to_rad(-70), deg_to_rad(35))


func look_touch(rel: Vector2) -> void:
	look(rel.x * TOUCH_SENS, rel.y * TOUCH_SENS)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Les clics simulés par un écran tactile ne capturent pas la souris.
		if OS.has_feature("pc") and event.device != InputEvent.DEVICE_ID_EMULATION:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		look(event.relative.x * MOUSE_SENS, event.relative.y * MOUSE_SENS)
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_arm.spring_length = maxf(2.5, _arm.spring_length - 0.5)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_arm.spring_length = minf(12.0, _arm.spring_length + 0.5)


func _physics_process(delta: float) -> void:
	# Caméra à la manette.
	var pad := Input.get_vector("cam_gauche", "cam_droite", "cam_haut", "cam_bas")
	if pad.length() > 0.0:
		look(pad.x * PAD_SENS * delta, pad.y * PAD_SENS * delta)

	var input := Input.get_vector("gauche", "droite", "avancer", "reculer")
	if touch_move.length() > 0.05:
		input = touch_move
	var dir := (_yaw.global_basis * Vector3(input.x, 0, input.y))
	dir.y = 0
	dir = dir.normalized() * minf(input.length(), 1.0)

	var running := Input.is_action_pressed("courir") or touch_run
	var speed := RUN_SPEED if running else WALK_SPEED

	if not is_on_floor():
		velocity.y -= gravity * delta
	elif Input.is_action_just_pressed("sauter") or touch_jump:
		velocity.y = JUMP_VELOCITY
	touch_jump = false

	velocity.x = move_toward(velocity.x, dir.x * speed, 30.0 * delta)
	velocity.z = move_toward(velocity.z, dir.z * speed, 30.0 * delta)
	move_and_slide()

	var flat := Vector2(velocity.x, velocity.z)
	if flat.length() > 0.3:
		var target_yaw := atan2(-flat.x, -flat.y)
		avatar.rotation.y = lerp_angle(avatar.rotation.y, target_yaw, clampf(delta * 12.0, 0.0, 1.0))
	avatar.animate(delta, flat.length(), not is_on_floor())

	_yaw.global_position = _yaw.global_position.lerp(global_position + Vector3(0, 1.6, 0), clampf(delta * 14.0, 0.0, 1.0))


## Direction de la caméra (pour la mini-carte).
func view_yaw() -> float:
	return _yaw.rotation.y

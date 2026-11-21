extends Node
## État global du joueur (argent, missions terminées) + sauvegarde locale
## + configuration des commandes (clavier, manette).
##
## SÉCURITÉ : en mode solo, la sauvegarde est un simple fichier local
## (user://sauvegarde.json). Elle peut être modifiée par le joueur : c'est
## acceptable hors ligne. Quand le multijoueur arrivera (phase 10), l'argent,
## l'inventaire et la progression seront gérés UNIQUEMENT par le serveur.

signal money_changed(amount: int)

const SAVE_PATH := "user://sauvegarde.json"
const SAVE_VERSION := 1

var money: int = 2000          # francs congolais (FC)
var completed: Array = []      # identifiants des missions terminées


func _ready() -> void:
	_setup_input()
	load_game()


func add_money(amount: int) -> void:
	money = max(0, money + amount)
	money_changed.emit(money)
	save_game()


func can_pay(amount: int) -> bool:
	return money >= amount


func mark_completed(mission_id: String) -> void:
	if not completed.has(mission_id):
		completed.append(mission_id)
	save_game()


func save_game() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("Sauvegarde impossible : %s" % FileAccess.get_open_error())
		return
	f.store_string(JSON.stringify({"v": SAVE_VERSION, "money": money, "completed": completed}))


func load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	# Validation défensive : on n'accepte que des types attendus.
	if typeof(data) != TYPE_DICTIONARY:
		return
	if typeof(data.get("money")) in [TYPE_INT, TYPE_FLOAT]:
		money = clampi(int(data["money"]), 0, 1_000_000_000)
	if typeof(data.get("completed")) == TYPE_ARRAY:
		completed = data["completed"].filter(func(x): return typeof(x) == TYPE_STRING)


func reset_progress() -> void:
	money = 2000
	completed = []
	save_game()
	money_changed.emit(money)


# --- Commandes -------------------------------------------------------------
# Touches « physiques » : W/A/S/D sur QWERTY = Z/Q/S/D sur AZERTY (clavier français).

func _setup_input() -> void:
	_bind("avancer", [KEY_W, KEY_UP], JOY_AXIS_LEFT_Y, -1.0)
	_bind("reculer", [KEY_S, KEY_DOWN], JOY_AXIS_LEFT_Y, 1.0)
	_bind("gauche", [KEY_A, KEY_LEFT], JOY_AXIS_LEFT_X, -1.0)
	_bind("droite", [KEY_D, KEY_RIGHT], JOY_AXIS_LEFT_X, 1.0)
	_bind("courir", [KEY_SHIFT], -1, 0.0, JOY_BUTTON_LEFT_STICK)
	_bind("sauter", [KEY_SPACE], -1, 0.0, JOY_BUTTON_A)
	_bind("action", [KEY_E, KEY_ENTER], -1, 0.0, JOY_BUTTON_X)
	_bind("carte", [KEY_M], -1, 0.0, JOY_BUTTON_BACK)
	_bind("pause", [KEY_ESCAPE], -1, 0.0, JOY_BUTTON_START)
	_bind("cam_gauche", [], JOY_AXIS_RIGHT_X, -1.0)
	_bind("cam_droite", [], JOY_AXIS_RIGHT_X, 1.0)
	_bind("cam_haut", [], JOY_AXIS_RIGHT_Y, -1.0)
	_bind("cam_bas", [], JOY_AXIS_RIGHT_Y, 1.0)


func _bind(action: String, keys: Array, axis: int = -1, axis_dir: float = 0.0, button: int = -1) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action, 0.2)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)
	if axis >= 0:
		var ja := InputEventJoypadMotion.new()
		ja.axis = axis
		ja.axis_value = axis_dir
		InputMap.action_add_event(action, ja)
	if button >= 0:
		var jb := InputEventJoypadButton.new()
		jb.button_index = button
		InputMap.action_add_event(action, jb)

extends Node3D
## Point d'entrée du jeu : crée le monde (ciel, soleil, ville réelle,
## monuments), le joueur, la circulation, les missions et l'interface.

const CITY_DATA := "res://data/limete_echangeur.json"
const SPAWN := Vector2(-35.0, -140.0)   # près de la Tour de l'Échangeur (coordonnées carte)

var city: CityBuilder
var player: Player
var hud: HUD
var missions: MissionManager
var traffic: Traffic


func _ready() -> void:
	_setup_environment()
	hud = HUD.new()
	add_child(hud)
	hud.set_loading(0.0, "Chargement de la carte de Kinshasa…")
	await get_tree().process_frame

	city = CityBuilder.new()
	city.name = "Ville"
	add_child(city)
	if not city.load_data(CITY_DATA):
		hud.set_loading(0.0, "Erreur : données de la ville introuvables.")
		return
	city.progress.connect(hud.set_loading)
	await city.build()

	var tower := TourEchangeur.new()
	tower.name = "TourEchangeur"
	city.add_child(tower)
	var lumumba_poi := city.find_poi("n2298412028")
	if not lumumba_poi.is_empty():
		var monument := MonumentLumumba.new()
		monument.position = CityBuilder.to_world(lumumba_poi["x"], lumumba_poi["y"])
		city.add_child(monument)
	_add_place_labels()

	player = Player.new()
	player.name = "Joueur"
	add_child(player)
	var spawn := city.nearest_road_point(SPAWN)
	player.global_position = CityBuilder.to_world(spawn.x, spawn.y, 1.0)
	player.look(deg_to_rad(200), 0.0)

	traffic = Traffic.new()
	add_child(traffic)
	traffic.setup(city, player)

	missions = MissionManager.new()
	add_child(missions)
	hud.bind(player, missions, city)
	missions.setup(city, player)
	hud.set_loading(1.0, "")
	hud.notify("Mbote ! Bienvenue à Limete, Kinshasa.")
	_handle_test_args()


## Outil de test automatique (développeurs) :
##   godot --path game -- --capture=chemin.png [--cam=x,y,hauteur,yaw_deg]
## prend une capture d'écran après le chargement puis quitte.
func _handle_test_args() -> void:
	var capture := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--capture="):
			capture = arg.trim_prefix("--capture=")
		elif arg == "--map":
			hud.world_map.open()
			hud.world_map._zoom = 0.6
			hud.world_map.waypoint = Vector2(256.0, 845.0)
		elif arg == "--map3d":
			hud.world_map.open()
			hud.world_map._zoom = 0.5
			hud.world_map._toggle_3d()
		elif arg.begins_with("--freecam="):
			var f := arg.trim_prefix("--freecam=").split(",")
			var cam := Camera3D.new()
			cam.far = 4000.0
			add_child(cam)
			cam.global_position = CityBuilder.to_world(float(f[0]), float(f[1]), float(f[2]))
			cam.rotation_degrees = Vector3(float(f[4]), float(f[3]), 0)
			cam.current = true
		elif arg.begins_with("--cam="):
			var v := arg.trim_prefix("--cam=").split(",")
			if v.size() == 4:
				player.global_position = CityBuilder.to_world(float(v[0]), float(v[1]), float(v[2]))
				player.look(deg_to_rad(float(v[3])), 0.0)
	if capture.is_empty():
		return
	await get_tree().create_timer(4.0).timeout
	var img := get_viewport().get_texture().get_image()
	img.save_png(capture)
	print("Capture : ", capture)
	get_tree().quit()


func _setup_environment() -> void:
	var env := Environment.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.36, 0.55, 0.80)
	sky_mat.sky_horizon_color = Color(0.85, 0.80, 0.72)   # brume chaude de Kinshasa
	sky_mat.ground_horizon_color = Color(0.70, 0.62, 0.52)
	sky_mat.ground_bottom_color = Color(0.35, 0.28, 0.22)
	sky_mat.sun_angle_max = 30.0
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.5
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.fog_enabled = true
	env.fog_light_color = Color(0.82, 0.78, 0.70)
	env.fog_density = 0.0008
	env.fog_sky_affect = 0.25
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.name = "Soleil"
	sun.rotation_degrees = Vector3(-48, -35, 0)
	sun.light_color = Color(1.0, 0.93, 0.82)
	sun.light_energy = 1.0
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 140.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	add_child(sun)


## Panneaux flottants sur quelques lieux réels connus du quartier.
func _add_place_labels() -> void:
	var famous := ["w354099810", "w4708901", "w363665145", "w1028400780", "n6581449658",
		"n5179741368", "w60658740", "w597453176", "n713203655", "w598082245"]
	for id in famous:
		var p := city.find_poi(id)
		if p.is_empty():
			continue
		var l := Label3D.new()
		l.text = p["name"]
		l.font_size = 56
		l.outline_size = 12
		l.pixel_size = 0.012
		l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		l.modulate = Color(1, 1, 1, 0.95)
		l.visibility_range_end = 160.0
		l.position = CityBuilder.to_world(p["x"], p["y"], 12.0)
		city.add_child(l)

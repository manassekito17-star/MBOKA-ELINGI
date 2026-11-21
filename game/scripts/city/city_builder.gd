class_name CityBuilder
extends Node3D
## Génère la ville en 3D à partir des données OpenStreetMap converties
## (game/data/*.json, voir tools/osm/build_city_data.py).
##
## Repère : x = est (m), z = sud (m) ; la carte utilise y = nord, donc z = -y.
## Les bâtiments sont regroupés par « tuiles » (CHUNK m de côté) : un seul
## maillage + une seule forme de collision par tuile, et les tuiles lointaines
## ne sont pas dessinées (visibility_range) => bonnes performances sur mobile.

signal progress(ratio: float, label: String)

const CHUNK := 200.0
const VIEW_RANGE := 750.0
const GRID_CELL := 2.0

const WALLS := [
	Color(0.90, 0.86, 0.76), Color(0.93, 0.93, 0.90), Color(0.85, 0.68, 0.42),
	Color(0.60, 0.74, 0.85), Color(0.66, 0.80, 0.62), Color(0.88, 0.66, 0.62),
	Color(0.75, 0.74, 0.72), Color(0.92, 0.80, 0.45), Color(0.76, 0.47, 0.33),
	Color(0.62, 0.60, 0.56), Color(0.62, 0.60, 0.56), Color(0.90, 0.86, 0.76),
]
const METAL_ROOFS := [
	Color(0.62, 0.64, 0.66), Color(0.62, 0.64, 0.66), Color(0.52, 0.33, 0.22),
	Color(0.52, 0.33, 0.22), Color(0.25, 0.38, 0.58), Color(0.58, 0.20, 0.16),
	Color(0.26, 0.42, 0.30),
]
const ROAD_LEVEL := {
	"trunk": 0.09, "primary": 0.09, "trunk_link": 0.085, "primary_link": 0.085,
	"secondary": 0.08, "secondary_link": 0.075, "tertiary": 0.07, "tertiary_link": 0.065,
	"unclassified": 0.06, "residential": 0.055, "living_street": 0.05, "service": 0.045,
	"pedestrian": 0.05, "footway": 0.04, "path": 0.035, "track": 0.035,
}

var data: Dictionary = {}
var bounds := Rect2()
var pois: Array = []
## Polylignes des routes (coordonnées carte, Vector2) pour la mini-carte et le trafic.
var road_lines: Array = []   # [{ "pts": PackedVector2Array, "type": String, "w": float }]
var _grid := PackedByteArray()
var _grid_w := 0
var _grid_h := 0

var _building_mat: ShaderMaterial
var _road_mat: ShaderMaterial
var _ground_mat: ShaderMaterial


static func to_world(x: float, y: float, h: float = 0.0) -> Vector3:
	return Vector3(x, h, -y)


func load_data(path: String) -> bool:
	var txt := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Données de ville illisibles : %s" % path)
		return false
	data = parsed
	var b: Array = data["bounds"]
	bounds = Rect2(b[0], b[1], b[2] - b[0], b[3] - b[1])
	pois = data.get("pois", [])
	return true


func find_poi(id: String) -> Dictionary:
	for p in pois:
		if p["id"] == id:
			return p
	return {}


func build() -> void:
	_building_mat = ShaderMaterial.new()
	_building_mat.shader = load("res://shaders/building.gdshader")
	_road_mat = ShaderMaterial.new()
	_road_mat.shader = load("res://shaders/road.gdshader")
	_ground_mat = ShaderMaterial.new()
	_ground_mat.shader = load("res://shaders/ground.gdshader")

	_grid_w = int(ceil(bounds.size.x / GRID_CELL)) + 1
	_grid_h = int(ceil(bounds.size.y / GRID_CELL)) + 1
	_grid.resize(_grid_w * _grid_h)

	progress.emit(0.02, "Préparation du sol…")
	_build_ground()
	await get_tree().process_frame
	_build_greens()
	progress.emit(0.08, "Tracé des routes réelles…")
	await get_tree().process_frame
	_build_roads()
	progress.emit(0.25, "Construction des bâtiments…")
	await get_tree().process_frame
	await _build_buildings()
	progress.emit(0.9, "Plantation des arbres…")
	await get_tree().process_frame
	_build_trees()
	progress.emit(1.0, "Prêt")


# --- Sol et espaces verts --------------------------------------------------

func _build_ground() -> void:
	var r := bounds.grow(600.0)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_normal(Vector3.UP)
	st.set_color(Color(0, 0, 0))
	var a := to_world(r.position.x, r.position.y)
	var b := to_world(r.end.x, r.position.y)
	var c := to_world(r.end.x, r.end.y)
	var d := to_world(r.position.x, r.end.y)
	for v in [a, c, b, a, d, c]:
		st.add_vertex(v)
	var mi := MeshInstance3D.new()
	mi.name = "Sol"
	mi.mesh = st.commit()
	mi.material_override = _ground_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	# Collision du sol : plan infini.
	var body := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	cs.shape = WorldBoundaryShape3D.new()
	body.add_child(cs)
	add_child(body)


func _build_greens() -> void:
	var verts := PackedVector3Array()
	for g in data.get("greens", []):
		var poly := _to_poly(g["p"])
		var idx := Geometry2D.triangulate_polygon(poly)
		for i in range(0, idx.size(), 3):
			var tri := [poly[idx[i]], poly[idx[i + 1]], poly[idx[i + 2]]]
			if _signed_area(tri) > 0.0:
				tri = [tri[0], tri[2], tri[1]]
			for p in tri:
				verts.append(to_world(p.x, p.y, 0.02))
	if verts.is_empty():
		return
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	var normals := PackedVector3Array()
	normals.resize(verts.size())
	normals.fill(Vector3.UP)
	arrays[Mesh.ARRAY_NORMAL] = normals
	var colors := PackedColorArray()
	colors.resize(verts.size())
	colors.fill(Color(0, 1, 0))
	arrays[Mesh.ARRAY_COLOR] = colors
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mi := MeshInstance3D.new()
	mi.name = "EspacesVerts"
	mi.mesh = mesh
	mi.material_override = _ground_mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


# --- Routes ----------------------------------------------------------------

func _build_roads() -> void:
	var chunks := {}  # Vector2i -> {v, n, c, uv}
	var road_index := 0
	for r in data.get("roads", []):
		var pts := _to_poly(r["p"])
		var width: float = r["w"]
		var type: String = r["t"]
		road_lines.append({"pts": pts, "type": type, "w": width, "name": r.get("n", "")})
		_mark_road(pts, width)
		var paved: bool = r["s"] == "asphalt" or r["s"] == "paving"
		var marked := paved and width >= 7.0
		var col := Color(1.0 if marked else 0.0, 0, 0, 1.0 if paved else 0.0)
		var h: float = ROAD_LEVEL.get(type, 0.05) + float(road_index % 7) * 0.001
		road_index += 1
		var key := _chunk_key(pts[pts.size() / 2])
		if not chunks.has(key):
			chunks[key] = {"v": PackedVector3Array(), "c": PackedColorArray(), "uv": PackedVector2Array()}
		var ch: Dictionary = chunks[key]
		var dist := 0.0
		var lefts: Array[Vector2] = []
		for i in pts.size():
			var dir := Vector2.ZERO
			if i > 0:
				dir += (pts[i] - pts[i - 1]).normalized()
			if i < pts.size() - 1:
				dir += (pts[i + 1] - pts[i]).normalized()
			dir = dir.normalized()
			var left := Vector2(-dir.y, dir.x)
			# Raccord en onglet, limité pour éviter les pointes aux virages serrés.
			var miter := 1.0
			if i > 0 and i < pts.size() - 1:
				var seg := (pts[i + 1] - pts[i]).normalized()
				var cosang := absf(left.dot(Vector2(-seg.y, seg.x)))
				miter = clampf(1.0 / maxf(cosang, 0.01), 1.0, 2.0)
			lefts.append(left * width * 0.5 * miter)
		for i in pts.size() - 1:
			var seg_len := pts[i].distance_to(pts[i + 1])
			var l0 := pts[i] + lefts[i]
			var r0 := pts[i] - lefts[i]
			var l1 := pts[i + 1] + lefts[i + 1]
			var r1 := pts[i + 1] - lefts[i + 1]
			var quad := [
				[l0, Vector2(0, dist)], [r0, Vector2(1, dist)], [r1, Vector2(1, dist + seg_len)],
				[l0, Vector2(0, dist)], [r1, Vector2(1, dist + seg_len)], [l1, Vector2(0, dist + seg_len)],
			]
			for q in quad:
				ch["v"].append(to_world(q[0].x, q[0].y, h))
				ch["uv"].append(q[1])
				ch["c"].append(col)
			dist += seg_len
	var root := Node3D.new()
	root.name = "Routes"
	add_child(root)
	for key in chunks:
		var ch: Dictionary = chunks[key]
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = ch["v"]
		var normals := PackedVector3Array()
		normals.resize(ch["v"].size())
		normals.fill(Vector3.UP)
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_COLOR] = ch["c"]
		arrays[Mesh.ARRAY_TEX_UV] = ch["uv"]
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = _road_mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.visibility_range_end = VIEW_RANGE + 250.0
		root.add_child(mi)


# --- Bâtiments -------------------------------------------------------------

func _build_buildings() -> void:
	var chunks := {}
	var list: Array = data.get("buildings", [])
	var n := list.size()
	for bi in n:
		var b: Dictionary = list[bi]
		var poly := _to_poly(b["p"])
		if poly.size() < 3:
			continue
		var h: float = b["h"]
		var kind: String = b.get("k", "yes")
		var wall: Color = WALLS[int(b["w"]) % WALLS.size()]
		var roof: Color
		var roof_type := 0.0
		if kind == "church" or kind == "cathedral":
			wall = Color(0.95, 0.94, 0.90)
			h = maxf(h, 11.0)
		elif kind in ["industrial", "warehouse"]:
			wall = [Color(0.74, 0.76, 0.78), Color(0.55, 0.65, 0.75), Color(0.82, 0.80, 0.74)][int(b["w"]) % 3]
		if h > 7.0 and not kind in ["industrial", "warehouse"]:
			roof = Color(0.68, 0.66, 0.62)
			roof_type = 0.5
		else:
			roof = METAL_ROOFS[int(b["r"]) % METAL_ROOFS.size()]
		var center := Vector2.ZERO
		for p in poly:
			center += p
		center /= poly.size()
		_mark_rect(poly, 1.0)
		var key := _chunk_key(center)
		if not chunks.has(key):
			chunks[key] = {
				"v": PackedVector3Array(), "n": PackedVector3Array(), "c": PackedColorArray(),
				"uv": PackedVector2Array(), "col": PackedVector3Array(),
			}
		var ch: Dictionary = chunks[key]
		# Murs
		var perim := 0.0
		var wc := Color(wall.r, wall.g, wall.b, 1.0)
		for i in poly.size():
			var a := poly[i]
			var bb := poly[(i + 1) % poly.size()]
			var d := bb - a
			var seg := d.length()
			if seg < 0.05:
				continue
			var nrm := Vector3(d.y, 0, d.x).normalized()
			var a0 := to_world(a.x, a.y, 0.0)
			var a1 := to_world(a.x, a.y, h)
			var b0 := to_world(bb.x, bb.y, 0.0)
			var b1 := to_world(bb.x, bb.y, h)
			var uva0 := Vector2(perim, 0)
			var uva1 := Vector2(perim, h)
			var uvb0 := Vector2(perim + seg, 0)
			var uvb1 := Vector2(perim + seg, h)
			for pair in [[a0, uva0], [a1, uva1], [b1, uvb1], [a0, uva0], [b1, uvb1], [b0, uvb0]]:
				ch["v"].append(pair[0])
				ch["uv"].append(pair[1])
				ch["n"].append(nrm)
				ch["c"].append(wc)
				ch["col"].append(pair[0])
			perim += seg
		# Toit
		var rc := Color(roof.r, roof.g, roof.b, roof_type)
		var idx := Geometry2D.triangulate_polygon(poly)
		for i in range(0, idx.size(), 3):
			var tri := [poly[idx[i]], poly[idx[i + 1]], poly[idx[i + 2]]]
			if _signed_area(tri) > 0.0:
				tri = [tri[0], tri[2], tri[1]]
			for p in tri:
				ch["v"].append(to_world(p.x, p.y, h))
				ch["uv"].append(Vector2(p.x, p.y))
				ch["n"].append(Vector3.UP)
				ch["c"].append(rc)
		if bi % 400 == 0:
			progress.emit(0.25 + 0.55 * float(bi) / n, "Construction des bâtiments… %d / %d" % [bi, n])
			await get_tree().process_frame

	var root := Node3D.new()
	root.name = "Batiments"
	add_child(root)
	var done := 0
	for key in chunks:
		var ch: Dictionary = chunks[key]
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = ch["v"]
		arrays[Mesh.ARRAY_NORMAL] = ch["n"]
		arrays[Mesh.ARRAY_COLOR] = ch["c"]
		arrays[Mesh.ARRAY_TEX_UV] = ch["uv"]
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var mi := MeshInstance3D.new()
		mi.name = "Tuile_%d_%d" % [key.x, key.y]
		mi.mesh = mesh
		mi.material_override = _building_mat
		mi.visibility_range_end = VIEW_RANGE
		mi.visibility_range_end_margin = 50.0
		root.add_child(mi)
		# Collision : uniquement les murs (le joueur ne monte pas sur les toits).
		var body := StaticBody3D.new()
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(ch["col"])
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		mi.add_child(body)
		done += 1
		if done % 20 == 0:
			progress.emit(0.8 + 0.1 * float(done) / chunks.size(), "Finalisation des quartiers…")
			await get_tree().process_frame


# --- Arbres (manguiers et palmiers) ----------------------------------------

func _build_trees() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 2026
	var mango := _make_mango_mesh()
	var palm := _make_palm_mesh()
	var tiles := {}  # Vector2i -> {mango: [Transform3D], palm: [...]}
	var target := int(bounds.get_area() / 1800.0)
	var tries := 0
	var placed := 0
	while placed < target and tries < target * 6:
		tries += 1
		var p := Vector2(rng.randf_range(bounds.position.x, bounds.end.x), rng.randf_range(bounds.position.y, bounds.end.y))
		if is_blocked(p, 2.5):
			continue
		var key := Vector2i(floor(p.x / 400.0), floor(p.y / 400.0))
		if not tiles.has(key):
			tiles[key] = {"mango": [], "palm": []}
		var s := rng.randf_range(0.75, 1.35)
		var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.85, 1.15), s)), to_world(p.x, p.y))
		tiles[key]["palm" if rng.randf() < 0.22 else "mango"].append(t)
		_mark_cell(p)
		placed += 1
	var root := Node3D.new()
	root.name = "Arbres"
	add_child(root)
	for key in tiles:
		for kind in ["mango", "palm"]:
			var list: Array = tiles[key][kind]
			if list.is_empty():
				continue
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = mango if kind == "mango" else palm
			mm.instance_count = list.size()
			for i in list.size():
				mm.set_instance_transform(i, list[i])
			var mmi := MultiMeshInstance3D.new()
			mmi.multimesh = mm
			mmi.visibility_range_end = VIEW_RANGE
			root.add_child(mmi)


func _make_mango_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.18
	trunk.bottom_radius = 0.28
	trunk.height = 2.6
	trunk.radial_segments = 6
	trunk.rings = 1
	var canopy := SphereMesh.new()
	canopy.radius = 3.0
	canopy.height = 4.2
	canopy.radial_segments = 9
	canopy.rings = 5
	_append_primitive(mesh, trunk, Transform3D(Basis(), Vector3(0, 1.3, 0)), _mat(Color(0.33, 0.24, 0.17)))
	_append_primitive(mesh, canopy, Transform3D(Basis(), Vector3(0, 4.3, 0)), _mat(Color(0.18, 0.36, 0.14)))
	return mesh


func _make_palm_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.16
	trunk.bottom_radius = 0.24
	trunk.height = 9.0
	trunk.radial_segments = 6
	trunk.rings = 1
	_append_primitive(mesh, trunk, Transform3D(Basis(), Vector3(0, 4.5, 0)), _mat(Color(0.45, 0.38, 0.28)))
	var leaf := BoxMesh.new()
	leaf.size = Vector3(0.9, 0.06, 3.6)
	var leaves := ArrayMesh.new()
	for i in 7:
		var basis := Basis(Vector3.UP, TAU * i / 7.0) * Basis(Vector3.RIGHT, deg_to_rad(28))
		_append_primitive(leaves, leaf, Transform3D(basis, Vector3(0, 9.0, 0) + basis * Vector3(0, 0, -1.6)), null)
	# Fusionne les feuilles en une seule surface.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for s in leaves.get_surface_count():
		st.append_from(leaves, s, Transform3D())
	var arr := st.commit_to_arrays()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var lm := _mat(Color(0.22, 0.42, 0.16))
	lm.cull_mode = BaseMaterial3D.CULL_DISABLED
	mesh.surface_set_material(mesh.get_surface_count() - 1, lm)
	return mesh


func _append_primitive(target: ArrayMesh, prim: PrimitiveMesh, xf: Transform3D, mat: Material) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.append_from(prim, 0, xf)
	target.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, st.commit_to_arrays())
	if mat:
		target.surface_set_material(target.get_surface_count() - 1, mat)


func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.9
	return m


# --- Grille d'occupation (pour placer arbres, piétons, objets) -------------

func is_blocked(p: Vector2, radius: float = 0.0) -> bool:
	var r := int(ceil(radius / GRID_CELL))
	var cx := int((p.x - bounds.position.x) / GRID_CELL)
	var cy := int((p.y - bounds.position.y) / GRID_CELL)
	for dy in range(-r, r + 1):
		for dx in range(-r, r + 1):
			var x := cx + dx
			var y := cy + dy
			if x < 0 or y < 0 or x >= _grid_w or y >= _grid_h:
				return true
			if _grid[y * _grid_w + x] != 0:
				return true
	return false


func _mark_cell(p: Vector2) -> void:
	var x := int((p.x - bounds.position.x) / GRID_CELL)
	var y := int((p.y - bounds.position.y) / GRID_CELL)
	if x >= 0 and y >= 0 and x < _grid_w and y < _grid_h:
		_grid[y * _grid_w + x] = 1


func _mark_rect(poly: PackedVector2Array, margin: float) -> void:
	var r := Rect2(poly[0], Vector2.ZERO)
	for p in poly:
		r = r.expand(p)
	r = r.grow(margin)
	var x0 := int((r.position.x - bounds.position.x) / GRID_CELL)
	var y0 := int((r.position.y - bounds.position.y) / GRID_CELL)
	var x1 := int((r.end.x - bounds.position.x) / GRID_CELL)
	var y1 := int((r.end.y - bounds.position.y) / GRID_CELL)
	for y in range(maxi(y0, 0), mini(y1 + 1, _grid_h)):
		for x in range(maxi(x0, 0), mini(x1 + 1, _grid_w)):
			_grid[y * _grid_w + x] = 1


func _mark_road(pts: PackedVector2Array, width: float) -> void:
	for i in pts.size() - 1:
		var a := pts[i]
		var b := pts[i + 1]
		var steps := int(a.distance_to(b) / GRID_CELL) + 1
		for s in steps + 1:
			var p := a.lerp(b, float(s) / steps)
			var rr := int(ceil(width * 0.5 / GRID_CELL))
			var cx := int((p.x - bounds.position.x) / GRID_CELL)
			var cy := int((p.y - bounds.position.y) / GRID_CELL)
			for dy in range(-rr, rr + 1):
				for dx in range(-rr, rr + 1):
					var x := cx + dx
					var y := cy + dy
					if x >= 0 and y >= 0 and x < _grid_w and y < _grid_h:
						_grid[y * _grid_w + x] = 1


# --- Utilitaires -----------------------------------------------------------

func _to_poly(flat: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(flat.size() / 2)
	for i in out.size():
		out[i] = Vector2(flat[i * 2], flat[i * 2 + 1])
	return out


func _signed_area(tri: Array) -> float:
	var a: Vector2 = tri[0]
	var b: Vector2 = tri[1]
	var c: Vector2 = tri[2]
	return (b - a).cross(c - a)


func _chunk_key(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / CHUNK), floori(p.y / CHUNK))


## Point de route le plus proche (pour placer les objectifs à un endroit accessible).
func nearest_road_point(p: Vector2, types: Array = []) -> Vector2:
	var best := p
	var best_d := INF
	for r in road_lines:
		if not types.is_empty() and not r["type"] in types:
			continue
		var pts: PackedVector2Array = r["pts"]
		for i in pts.size() - 1:
			var q := Geometry2D.get_closest_point_to_segment(p, pts[i], pts[i + 1])
			var d := q.distance_squared_to(p)
			if d < best_d:
				best_d = d
				best = q
	return best

class_name PalaisDuPeuple
extends Node3D
## Palais du Peuple (Lingwala, Kinshasa), siège du Parlement.
## D'après photos : long bâtiment crème à pilastres verticaux serrés, fenêtres
## hautes, panneaux colorés au centre de la façade, corniche plate, rangée de
## drapeaux de la RDC devant, grande esplanade et bacs aux couleurs nationales.
## Contour réel (OpenStreetMap) ; hauteur (~20 m) estimée.

const HEIGHT := 20.0
var outline := PackedVector2Array()
var city: CityBuilder
var view_from := Vector3.ZERO
var view_to := Vector3.ZERO


func setup(p_outline: PackedVector2Array, p_city: CityBuilder = null) -> PalaisDuPeuple:
	outline = p_outline
	city = p_city
	return self


func _ready() -> void:
	if outline.size() < 3:
		return
	var c := Vector2.ZERO
	for p in outline:
		c += p
	c /= outline.size()
	var cream := Color(0.93, 0.90, 0.82)
	# --- Murs avec fenêtres (matériau des bâtiments, étages de 4,6 m) ---
	var mat := ShaderMaterial.new()
	mat.shader = load("res://shaders/building.gdshader")
	mat.set_shader_parameter("floor_height", 4.6)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := outline.size()
	var perim := 0.0
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		var seg := a.distance_to(b)
		var d := b - a
		var nrm := Vector3(d.y, 0, d.x).normalized()
		var a0 := CityBuilder.to_world(a.x, a.y, 0.0)
		var b0 := CityBuilder.to_world(b.x, b.y, 0.0)
		var up := Vector3(0, HEIGHT, 0)
		var verts := [[a0, 0.0, 0.0], [a0 + up, 0.0, HEIGHT], [b0 + up, seg, HEIGHT], [a0, 0.0, 0.0], [b0 + up, seg, HEIGHT], [b0, seg, 0.0]]
		for v in verts:
			st.set_color(Color(cream.r, cream.g, cream.b, 1.0))
			st.set_normal(nrm)
			st.set_uv(Vector2(perim + v[1], v[2]))
			st.set_uv2(Vector2(v[1], seg))
			st.add_vertex(v[0])
		perim += seg
	var walls := st.commit()
	var wmi := MeshInstance3D.new()
	wmi.mesh = walls
	wmi.material_override = mat
	add_child(wmi)
	var body := StaticBody3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(walls.get_faces())
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	add_child(body)

	# --- Toit-terrasse + corniche débordante ---
	var roof := Geometry2D.triangulate_polygon(outline)
	var rs := SurfaceTool.new()
	rs.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in range(0, roof.size(), 3):
		for y in [HEIGHT + 1.6, HEIGHT]:
			var order := [roof[k], roof[k + 2], roof[k + 1]] if y > HEIGHT else [roof[k], roof[k + 1], roof[k + 2]]
			for idx in order:
				var p := c + (outline[idx] - c) * 1.03
				rs.add_vertex(CityBuilder.to_world(p.x, p.y, y))
	rs.generate_normals()
	var roof_mi := MeshInstance3D.new()
	roof_mi.mesh = rs.commit()
	var rm := _m(Color(0.88, 0.86, 0.80))
	rm.cull_mode = BaseMaterial3D.CULL_DISABLED
	roof_mi.material_override = rm
	add_child(roof_mi)

	# --- Pilastres verticaux serrés tout autour ---
	var pil := BoxMesh.new()
	pil.size = Vector3(0.7, HEIGHT, 0.9)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = pil
	var xfs: Array[Transform3D] = []
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		var dir := (b - a).normalized()
		var outn := Vector2(dir.y, -dir.x)
		var cnt := int(a.distance_to(b) / 3.2)
		for k in cnt + 1:
			var p := a.lerp(b, float(k) / maxf(cnt, 1)) + outn * 0.35
			xfs.append(Transform3D(Basis(Vector3.UP, atan2(dir.x, dir.y)), CityBuilder.to_world(p.x, p.y, HEIGHT * 0.5)))
	mm.instance_count = xfs.size()
	for k in xfs.size():
		mm.set_instance_transform(k, xfs[k])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = _m(cream * 1.04)
	add_child(mmi)

	# --- Façade principale : côté de la grande avenue la plus proche ---
	var road := c + Vector2(0, -100)
	if city:
		road = city.nearest_road_point(c, ["trunk", "primary", "secondary", "tertiary"])
	var to_road := (road - c).normalized()
	var best := 0
	var best_dot := -2.0
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		var dir := (b - a).normalized()
		var outn := Vector2(dir.y, -dir.x)
		var score := outn.dot(to_road) * a.distance_to(b)
		if score > best_dot:
			best_dot = score
			best = i
	var fa := outline[best]
	var fb := outline[(best + 1) % n]
	var fdir := (fb - fa).normalized()
	var fout := Vector2(fdir.y, -fdir.x)
	var fmid := (fa + fb) * 0.5
	var flen := fa.distance_to(fb)
	var fbasis := Basis(Vector3.UP, atan2(fdir.x, fdir.y))
	var vf := fmid + fout * 75.0 + fdir * 25.0
	view_from = CityBuilder.to_world(vf.x, vf.y, 7.0)
	view_to = CityBuilder.to_world(fmid.x, fmid.y, HEIGHT * 0.45)
	# Panneaux colorés au centre de la façade (entre les pilastres).
	var cols := [Color(0.85, 0.15, 0.15), Color(0.10, 0.35, 0.80), Color(0.95, 0.80, 0.15), Color(0.15, 0.60, 0.30), Color(0.95, 0.50, 0.10), Color(0.55, 0.25, 0.65)]
	for k in 12:
		var p := fmid + fdir * (-19.2 + k * 3.2 + 1.6) + fout * 0.25
		var panel := BoxMesh.new()
		panel.size = Vector3(0.2, HEIGHT - 5.0, 2.3)
		var pm := MeshInstance3D.new()
		pm.mesh = panel
		pm.material_override = _m(cols[k % cols.size()])
		pm.transform = Transform3D(fbasis, CityBuilder.to_world(p.x, p.y, 2.5 + (HEIGHT - 5.0) * 0.5))
		add_child(pm)
	# Esplanade pavée devant la façade.
	var esp := BoxMesh.new()
	esp.size = Vector3(1.0, 0.1, 1.0)
	var ep := fmid + fout * 28.0
	var emi := MeshInstance3D.new()
	emi.mesh = esp
	emi.scale = Vector3(1.0, 1.0, 1.0)
	emi.transform = Transform3D(fbasis.scaled(Vector3(48.0, 1.0, flen + 20.0)), CityBuilder.to_world(ep.x, ep.y, 0.08))
	var esp_mat := _m(Color(0.25, 0.25, 0.24))
	esp_mat.metallic_specular = 0.05
	esp_mat.roughness = 1.0
	emi.material_override = esp_mat
	add_child(emi)
	# Rangée de drapeaux de la RDC.
	var flag_mat := StandardMaterial3D.new()
	flag_mat.albedo_texture = _drc_flag_texture()
	flag_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	flag_mat.roughness = 0.8
	var pole_mat := _m(Color(0.92, 0.92, 0.92))
	pole_mat.metallic = 0.6
	var count := int(minf(flen, 120.0) / 9.0)
	for k in count:
		var p := fmid + fdir * (-(count - 1) * 4.5 + k * 9.0) + fout * 20.0
		var pole := CylinderMesh.new()
		pole.top_radius = 0.07
		pole.bottom_radius = 0.1
		pole.height = 12.0
		pole.radial_segments = 6
		var pmi := MeshInstance3D.new()
		pmi.mesh = pole
		pmi.material_override = pole_mat
		pmi.position = CityBuilder.to_world(p.x, p.y, 6.0)
		add_child(pmi)
		var fq := QuadMesh.new()
		fq.size = Vector2(3.0, 2.0)
		var fmi := MeshInstance3D.new()
		fmi.mesh = fq
		fmi.material_override = flag_mat
		var wave := 0.25 * sin(k * 1.7)
		var fb2 := Basis(Vector3.UP, atan2(fdir.x, fdir.y) - PI / 2.0 + wave)
		fmi.transform = Transform3D(fb2, CityBuilder.to_world(p.x, p.y, 10.8) + fb2 * Vector3(1.55, 0, 0))
		add_child(fmi)
	# Bacs à fleurs aux couleurs nationales le long de l'avenue.
	var bac_cols := [Color(0.0, 0.5, 1.0), Color(0.97, 0.85, 0.1), Color(0.8, 0.1, 0.12)]
	for k in 10:
		var p := fmid + fdir * (-45.0 + k * 10.0) + fout * 46.0
		var bac := BoxMesh.new()
		bac.size = Vector3(1.2, 0.8, 3.0)
		var bmi := MeshInstance3D.new()
		bmi.mesh = bac
		bmi.material_override = _m(bac_cols[k % 3])
		bmi.transform = Transform3D(fbasis, CityBuilder.to_world(p.x, p.y, 0.4))
		add_child(bmi)

	var l := Label3D.new()
	l.text = "Palais du Peuple"
	l.font_size = 96
	l.outline_size = 16
	l.pixel_size = 0.018
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = CityBuilder.to_world(c.x, c.y, HEIGHT + 10.0)
	l.visibility_range_end = 700.0
	add_child(l)


## Drapeau de la RDC dessiné en code : fond bleu ciel, bande diagonale rouge
## bordée de jaune, étoile jaune en haut à gauche.
static func _drc_flag_texture() -> ImageTexture:
	var w := 120
	var h := 80
	var img := Image.create(w, h, false, Image.FORMAT_RGB8)
	var blue := Color(0.0, 0.50, 1.0)
	var red := Color(0.81, 0.06, 0.12)
	var yellow := Color(0.97, 0.84, 0.09)
	for y in h:
		for x in w:
			# Distance à la diagonale (bas-gauche -> haut-droit).
			var d := absf(float(x) / w - (1.0 - float(y) / h))
			var col := blue
			if d < 0.17:
				col = yellow
			if d < 0.12:
				col = red
			img.set_pixel(x, y, col)
	# Étoile à 5 branches.
	var cx := 22.0
	var cy := 18.0
	for y in h:
		for x in w:
			var dx := x - cx
			var dy := y - cy
			var ang := atan2(dy, dx) + PI / 2.0
			var r := sqrt(dx * dx + dy * dy)
			var k := fmod(ang + TAU, TAU / 5.0) / (TAU / 5.0)
			if r < 14.0 - absf(k - 0.5) * 16.0 or r < 5.0:
				img.set_pixel(x, y, yellow)
	return ImageTexture.create_from_image(img)


static func _m(col: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = 0.8
	return m

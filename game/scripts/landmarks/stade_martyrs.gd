class_name StadeMartyrs
extends Node3D
## Stade des Martyrs de la Pentecôte (Lingwala, Kinshasa), ouvert en 1994.
## D'après photos : cuvette ovale, façade blanche à nervures verticales,
## bandeau de bannières rouges au sommet, gradins bleus / jaunes / rouges,
## pelouse et piste d'athlétisme, grand parvis gris avec pelouses.
## Contour réel (OpenStreetMap) ; hauteur (~30 m) estimée.
## Bannières : textes du jeu (pas de vraies marques).

const HEIGHT := 30.0
var outline := PackedVector2Array()


func setup(p_outline: PackedVector2Array) -> StadeMartyrs:
	outline = p_outline
	return self


func _ready() -> void:
	if outline.size() < 3:
		return
	var c := Vector2.ZERO
	for p in outline:
		c += p
	c /= outline.size()
	var far := outline[0]
	for p in outline:
		if p.distance_to(c) > far.distance_to(c):
			far = p
	var axis := (far - c).normalized()
	var yaw := atan2(axis.x, axis.y)
	var n := outline.size()
	var seat_cols := [Color(0.10, 0.30, 0.75), Color(0.95, 0.78, 0.10), Color(0.80, 0.12, 0.12)]

	# --- Gradins (deux anneaux), coursive, sommet ---
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var tiers := [
		[0.58, 1.2, 0.76, 13.0, true],    # gradin bas
		[0.76, 13.0, 0.79, 13.0, false],  # coursive
		[0.79, 14.0, 0.97, 28.0, true],   # gradin haut
		[0.97, 28.0, 1.0, HEIGHT, false], # bord supérieur
	]
	for t in tiers:
		for i in n:
			var j := (i + 1) % n
			var col: Color = seat_cols[(i * 3 / maxi(n, 1)) % 3] if t[4] else Color(0.85, 0.84, 0.80)
			if t[4]:
				# Bandes de couleur par secteurs (comme les sièges du stade).
				col = seat_cols[int(float(i) / n * 12.0) % 3]
			var a0 := _pt(c, outline[i], t[0], t[1])
			var b0 := _pt(c, outline[j], t[0], t[1])
			var a1 := _pt(c, outline[i], t[2], t[3])
			var b1 := _pt(c, outline[j], t[2], t[3])
			st.set_color(col)
			for v in [a0, a1, b1, a0, b1, b0]:
				st.add_vertex(v)
	# Façade extérieure blanche.
	for i in n:
		var j := (i + 1) % n
		var a0 := _pt(c, outline[i], 1.0, 0.0)
		var b0 := _pt(c, outline[j], 1.0, 0.0)
		st.set_color(Color(0.93, 0.92, 0.88))
		for v in [a0, b0 + Vector3(0, HEIGHT, 0), a0 + Vector3(0, HEIGHT, 0), a0, b0, b0 + Vector3(0, HEIGHT, 0)]:
			st.add_vertex(v)
	st.generate_normals()
	var mesh := st.commit()
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.roughness = 0.8
	mi.material_override = m
	add_child(mi)
	var body := StaticBody3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(mesh.get_faces())
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	add_child(body)

	# --- Nervures verticales et bandeaux horizontaux de la façade ---
	var rib := BoxMesh.new()
	rib.size = Vector3(1.2, HEIGHT, 1.8)
	var white := _m(Color(0.97, 0.96, 0.93))
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = rib
	var xfs: Array[Transform3D] = []
	var perim := 0.0
	for i in n:
		perim += outline[i].distance_to(outline[(i + 1) % n])
	var count := int(perim / 7.0)
	for k in count:
		var p := _along(perim * k / count)
		var q := c + (p - c) * 1.015
		var dir := (p - c).normalized()
		xfs.append(Transform3D(Basis(Vector3.UP, atan2(dir.x, dir.y)), CityBuilder.to_world(q.x, q.y, HEIGHT * 0.5)))
	mm.instance_count = xfs.size()
	for k in xfs.size():
		mm.set_instance_transform(k, xfs[k])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = white
	add_child(mmi)
	# Bandeaux : béton (10 m) et bannières rouges (sommet).
	_band(c, 1.025, 9.5, 1.0, Color(0.9, 0.89, 0.85))
	_band(c, 1.03, 23.0, 5.0, Color(0.80, 0.08, 0.10))
	var texts := ["LÉOPARDS", "MBOKA ELENGI", "KIN EZALI MBOKA", "ALLEZ LES LÉOPARDS !"]
	for k in 8:
		var p := _along(perim * (k + 0.5) / 8.0)
		var q := c + (p - c) * 1.06
		var dir := (p - c).normalized()
		var l := Label3D.new()
		l.text = texts[k % texts.size()]
		l.font_size = 140
		l.pixel_size = 0.02
		l.modulate = Color.WHITE
		l.outline_size = 0
		l.transform = Transform3D(Basis(Vector3.UP, atan2(dir.x, dir.y) + PI), CityBuilder.to_world(q.x, q.y, 25.5))
		add_child(l)

	# --- Piste, pelouse rayée ---
	var inner_r := 0.0
	for p in outline:
		inner_r = maxf(inner_r, p.distance_to(c))
	var track := MeshInstance3D.new()
	var tm := CylinderMesh.new()
	tm.top_radius = 1.0
	tm.bottom_radius = 1.0
	tm.height = 0.1
	tm.radial_segments = 40
	track.mesh = tm
	track.scale = Vector3(inner_r * 0.36, 1.0, inner_r * 0.55)
	track.rotation.y = -yaw
	track.position = CityBuilder.to_world(c.x, c.y, 0.1)
	track.material_override = _m(Color(0.66, 0.24, 0.17))
	add_child(track)
	for k in 10:
		var stripe := MeshInstance3D.new()
		var sm := BoxMesh.new()
		sm.size = Vector3(68.0, 0.12, 10.5)
		stripe.mesh = sm
		stripe.rotation.y = -yaw
		stripe.position = CityBuilder.to_world(c.x, c.y, 0.14) + Basis(Vector3.UP, -yaw) * Vector3(0, 0, -52.5 + 5.25 + k * 10.5)
		stripe.material_override = _m(Color(0.20, 0.52, 0.18) if k % 2 == 0 else Color(0.25, 0.60, 0.22))
		add_child(stripe)

	# --- Parvis gris et pelouses autour ---
	var plaza := SurfaceTool.new()
	plaza.begin(Mesh.PRIMITIVE_TRIANGLES)
	plaza.set_normal(Vector3.UP)
	for i in n:
		var j := (i + 1) % n
		for v in [_pt(c, outline[i], 1.0, 0.06), _pt(c, outline[j], 1.38, 0.06), _pt(c, outline[i], 1.38, 0.06),
				_pt(c, outline[i], 1.0, 0.06), _pt(c, outline[j], 1.0, 0.06), _pt(c, outline[j], 1.38, 0.06)]:
			plaza.add_vertex(v)
	var pmi := MeshInstance3D.new()
	pmi.mesh = plaza.commit()
	var pm := _m(Color(0.22, 0.22, 0.21))
	pm.metallic_specular = 0.05
	pm.roughness = 1.0
	pm.cull_mode = BaseMaterial3D.CULL_DISABLED
	pmi.material_override = pm
	add_child(pmi)

	var lbl := Label3D.new()
	lbl.text = "Stade des Martyrs"
	lbl.font_size = 96
	lbl.outline_size = 16
	lbl.pixel_size = 0.02
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.position = CityBuilder.to_world(c.x, c.y, HEIGHT + 14.0)
	lbl.visibility_range_end = 1200.0
	add_child(lbl)


func _band(c: Vector2, k: float, y: float, h: float, col: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := outline.size()
	for i in n:
		var j := (i + 1) % n
		var a := _pt(c, outline[i], k, y)
		var b := _pt(c, outline[j], k, y)
		for v in [a, b + Vector3(0, h, 0), a + Vector3(0, h, 0), a, b, b + Vector3(0, h, 0)]:
			st.add_vertex(v)
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var m := _m(col)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = m
	add_child(mi)


func _along(d: float) -> Vector2:
	var n := outline.size()
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		var l := a.distance_to(b)
		if d <= l:
			return a.lerp(b, d / maxf(l, 0.001))
		d -= l
	return outline[0]


func _pt(c: Vector2, p: Vector2, k: float, h: float) -> Vector3:
	var q := c + (p - c) * k
	return CityBuilder.to_world(q.x, q.y, h)


static func _m(col: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = col
	m.roughness = 0.85
	return m

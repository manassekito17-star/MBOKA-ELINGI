"""Bibliothèque commune des modèles de bâtiments remarquables (Blender 4.2, mode sans interface).

Chaque modèle est écrit dans le repère du jeu : x = est, y = haut, z = sud (mètres),
autour d'un point d'ancrage GPS. La conversion vers Blender (Z en haut) et vers glTF (Y en haut)
est faite ici : jeu (x, y, z) -> Blender (x, -z, y) -> glTF (x, y, z).

Le GLB produit contient quatre nœuds racines :
  LOD0  modèle détaillé (près)       LOD1  intermédiaire
  LOD2  silhouette (loin, aérien)    COLLISION  volumes simples pour la physique (non affichés)
Toute la géométrie d'un même niveau et d'un même matériau est fusionnée (peu d'appels de dessin).
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ICI = os.path.dirname(os.path.abspath(__file__))
TEXTURES = os.path.join(ICI, "..", "textures")
POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
NIVEAUX = ("LOD0", "LOD1", "LOD2", "COLLISION")


def B(p):
    """Point du jeu (x, y, z) -> Blender."""
    return Vector((p[0], -p[2], p[1]))


class Modele:
    def __init__(self, ident):
        self.ident = ident
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.mats = {}
        self.geo = {n: {} for n in NIVEAUX}       # niveau -> matériau -> (bmesh, couche uv)
        self.stats = {}

    # --- Matériaux ----------------------------------------------------------------------------
    def mat(self, nom, couleur, rugosite=0.8, metal=0.0, texture=None, emission=None, double=False):
        if nom in self.mats:
            return nom
        m = bpy.data.materials.new(nom)
        m.use_nodes = True
        m.use_backface_culling = not double
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*srgb_lin(couleur), 1)
        bsdf.inputs["Roughness"].default_value = rugosite
        bsdf.inputs["Metallic"].default_value = metal
        if texture:
            img = bpy.data.images.load(os.path.join(TEXTURES, texture), check_existing=True)
            n = m.node_tree.nodes.new("ShaderNodeTexImage")
            n.image = img
            m.node_tree.links.new(n.outputs["Color"], bsdf.inputs["Base Color"])
        if emission:
            bsdf.inputs["Emission Color"].default_value = (*srgb_lin(emission[0]), 1)
            bsdf.inputs["Emission Strength"].default_value = emission[1]
        self.mats[nom] = m
        return nom

    # --- Géométrie de base ----------------------------------------------------------------------
    def _bm(self, niveau, mat):
        g = self.geo[niveau]
        if mat not in g:
            bm = bmesh.new()
            g[mat] = (bm, bm.loops.layers.uv.new("UVMap"))
        return g[mat]

    def face(self, niveaux, mat, pts, uvs=None, normale=None):
        """Polygone (points du jeu). Si `normale` (jeu) est donnée, la face est orientée vers elle."""
        for niv in _liste(niveaux):
            bm, uvl = self._bm(niv, mat)
            vs = [bm.verts.new(B(p)) for p in pts]
            f = bm.faces.new(vs)
            f.normal_update()
            if normale is not None and f.normal.dot(B(normale)) < 0:
                f.normal_flip()
            if uvs:
                carte = {v: uv for v, uv in zip(vs, uvs)}
                for l in f.loops:
                    l[uvl].uv = carte[l.vert]

    def mur(self, niveaux, mat, a, b, y0, y1, module=None, u0=0.0, v0=0.0, dehors=None):
        """Mur vertical de a=(x,z) à b=(x,z), de y0 à y1. UV répétées tous les `module`=(l, h) mètres.
        `dehors` : point (x, z) du côté extérieur ; sinon la normale est à droite de a->b."""
        dx, dz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dz) or 1e-6
        n = (dz / L, 0, -dx / L)
        if dehors is not None:
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if (dehors[0] - m[0]) * n[0] + (dehors[1] - m[1]) * n[2] < 0:
                n = (-n[0], 0, -n[2])
        uvs = None
        if module:
            u1 = u0 + L / module[0]
            va, vb = v0 + 0, v0 + (y1 - y0) / module[1]
            uvs = [(u0, va), (u1, va), (u1, vb), (u0, vb)]
        self.face(niveaux, mat, [(a[0], y0, a[1]), (b[0], y0, b[1]), (b[0], y1, b[1]), (a[0], y1, a[1])], uvs, n)
        return L

    def prisme(self, niveaux, mat_mur, mat_toit, poly, y0, y1, module=None, toit=True, dessous=False, modules=None):
        """Volume extrudé d'un polygone (x, z). `modules` : liste (matériau, module) par côté (facultatif)."""
        poly = _sans_doublon(poly)
        c = (sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly))
        sens = _aire(poly)
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            mm, md = (modules[i] if modules else (mat_mur, module))
            # Normale extérieure : dépend du sens du polygone.
            dx, dz = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dz) or 1e-6
            n = (dz / L, -dx / L) if sens > 0 else (-dz / L, dx / L)
            m = ((a[0] + b[0]) / 2 + n[0], (a[1] + b[1]) / 2 + n[1])
            self.mur(niveaux, mm, a, b, y0, y1, md, dehors=m)
        if toit:
            self.face(niveaux, mat_toit, [(p[0], y1, p[1]) for p in poly], [(p[0] / 8, p[1] / 8) for p in poly], (0, 1, 0))
        if dessous:
            self.face(niveaux, mat_toit, [(p[0], y0, p[1]) for p in poly], None, (0, -1, 0))

    def boite(self, niveaux, mat, centre, taille, angle=0.0, module=None):
        """Parallélépipède : centre (x, y, z), taille (lx, ly, lz). La longueur lx suit la direction
        (cos angle, sin angle) dans le plan (x, z) — même convention que rect_oriente()."""
        cx, cy, cz = centre
        ly = taille[1] / 2
        poly = rect((cx, cz), taille[0] / 2, taille[2] / 2, angle)
        self.prisme(niveaux, mat, mat, poly, cy - ly, cy + ly, module=module, dessous=True)

    def cylindre(self, niveaux, mat, x, z, y0, y1, r, n=12, r1=None, toit=True):
        r1 = r if r1 is None else r1
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            p = [(x + r * math.cos(a0), y0, z + r * math.sin(a0)), (x + r * math.cos(a1), y0, z + r * math.sin(a1)),
                 (x + r1 * math.cos(a1), y1, z + r1 * math.sin(a1)), (x + r1 * math.cos(a0), y1, z + r1 * math.sin(a0))]
            am = (a0 + a1) / 2
            self.face(niveaux, mat, p, [(i / n * 2, 0), ((i + 1) / n * 2, 0), ((i + 1) / n * 2, 1), (i / n * 2, 1)],
                      (math.cos(am), 0, math.sin(am)))
        if toit:
            self.face(niveaux, mat, [(x + r1 * math.cos(2 * math.pi * i / n), y1, z + r1 * math.sin(2 * math.pi * i / n)) for i in range(n)],
                      None, (0, 1, 0))

    def sphere(self, niveaux, mat, centre, r, n=10):
        for niv in _liste(niveaux):
            bm, _ = self._bm(niv, mat)
            res = bmesh.ops.create_uvsphere(bm, u_segments=n, v_segments=max(4, n // 2), radius=r)
            bmesh.ops.translate(bm, verts=res["verts"], vec=B(centre))

    def ellipsoide(self, niveaux, mat, centre, rayons, axes=((1, 0, 0), (0, 1, 0), (0, 0, 1)), n=12):
        """Ellipsoïde : `rayons` (r1, r2, r3) le long des `axes` (trois vecteurs du jeu, orthonormés)."""
        from mathutils import Matrix
        for niv in _liste(niveaux):
            bm, _ = self._bm(niv, mat)
            tmp = bmesh.new()
            bmesh.ops.create_uvsphere(tmp, u_segments=n, v_segments=max(4, n // 2), radius=1.0)
            cols = [B(a) * r for a, r in zip(axes, rayons)]
            m = Matrix((
                (cols[0].x, cols[1].x, cols[2].x, 0), (cols[0].y, cols[1].y, cols[2].y, 0),
                (cols[0].z, cols[1].z, cols[2].z, 0), (0, 0, 0, 1)))
            m = Matrix.Translation(B(centre)) @ m
            vs = [bm.verts.new(m @ v.co) for v in tmp.verts]
            for f in tmp.faces:
                nf = bm.faces.new([vs[v.index] for v in f.verts])
                nf.smooth = True
            tmp.free()

    def membre(self, niveaux, mat, a, b, r0, r1, n=10):
        """Membre (tronc de cône lissé, arrondi aux extrémités) entre a et b."""
        A, Bb = Vector(a), Vector(b)
        d = Bb - A
        if d.length < 1e-6:
            return
        d.normalize()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = d.cross(u).normalized()
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            o0, o1 = u * math.cos(t0) + w * math.sin(t0), u * math.cos(t1) + w * math.sin(t1)
            om = u * math.cos((t0 + t1) / 2) + w * math.sin((t0 + t1) / 2)
            self.face(niveaux, mat, [tuple(A + o0 * r0), tuple(A + o1 * r0), tuple(Bb + o1 * r1), tuple(Bb + o0 * r1)], None, tuple(om))
        self.ellipsoide(niveaux, mat, tuple(A), (r0, r0, r0), n=n)
        self.ellipsoide(niveaux, mat, tuple(Bb), (r1, r1, r1), n=n)

    def barre(self, niveaux, mat, a, b, r, n=6):
        """Tube (poteau, poutre oblique) entre deux points du jeu."""
        A, Bb = Vector(a), Vector(b)
        d = (Bb - A)
        if d.length < 1e-6:
            return
        d.normalize()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = d.cross(u).normalized()
        for i in range(n):
            t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            o0 = u * math.cos(t0) * r + w * math.sin(t0) * r
            o1 = u * math.cos(t1) * r + w * math.sin(t1) * r
            om = u * math.cos((t0 + t1) / 2) + w * math.sin((t0 + t1) / 2)
            self.face(niveaux, mat, [tuple(A + o0), tuple(A + o1), tuple(Bb + o1), tuple(Bb + o0)], None, tuple(om))

    def texte(self, niveaux, mat, texte, origine, direction, hauteur, epaisseur=0.15, centre=True):
        """Lettres en relief (vraie géométrie). `origine` (x, y, z) = bas du texte ; `direction` (dx, dz) = sens de lecture."""
        cu = bpy.data.curves.new("texte", "FONT")
        cu.body = texte
        cu.font = bpy.data.fonts.load(POLICE, check_existing=True)
        cu.size = hauteur / 0.72            # hauteur des capitales ≈ 0,72 × taille
        cu.extrude = epaisseur / 2
        cu.align_x = "CENTER" if centre else "LEFT"
        ob = bpy.data.objects.new("texte", cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = ob.evaluated_get(dg).to_mesh()
        dx, dz = direction
        L = math.hypot(dx, dz)
        dx, dz = dx / L, dz / L
        nx, nz = dz, -dx                      # normale (vers le lecteur) : à droite du sens de lecture
        for niv in _liste(niveaux):
            bm, _ = self._bm(niv, mat)
            vs = []
            for v in me.vertices:
                u, h, w = v.co.x, v.co.y, v.co.z
                p = (origine[0] + u * dx + w * nx, origine[1] + h, origine[2] + u * dz + w * nz)
                vs.append(bm.verts.new(B(p)))
            for poly in me.polygons:
                try:
                    bm.faces.new([vs[i] for i in poly.vertices])
                except ValueError:
                    pass
        ob.evaluated_get(dg).to_mesh_clear()
        bpy.data.objects.remove(ob)

    def peau(self, niveaux, mat, sommets, aretes, rayons, subdiv=2, decalage=(0, 0, 0)):
        """Forme organique (statue) : squelette + modificateur Peau (Skin) + subdivision.
        `sommets` en coordonnées du jeu (x, y, z) relatives à `decalage`."""
        me = bpy.data.meshes.new("squelette")
        me.from_pydata([B(s) for s in sommets], aretes, [])
        ob = bpy.data.objects.new("squelette", me)
        bpy.context.scene.collection.objects.link(ob)
        mod = ob.modifiers.new("peau", "SKIN")
        mod.use_smooth_shade = True
        for i, r in enumerate(rayons):
            rr = r if isinstance(r, (tuple, list)) else (r, r)
            ob.data.skin_vertices[0].data[i].radius = rr
        ob.data.skin_vertices[0].data[0].use_root = True
        sub = ob.modifiers.new("lisse", "SUBSURF")
        sub.levels = subdiv
        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg).to_mesh()
        D = B(decalage)
        for niv in _liste(niveaux):
            bm, _ = self._bm(niv, mat)
            vs = [bm.verts.new(v.co + D) for v in ev.vertices]
            for poly in ev.polygons:
                try:
                    f = bm.faces.new([vs[i] for i in poly.vertices])
                    f.smooth = True
                except ValueError:
                    pass
        ob.evaluated_get(dg).to_mesh_clear()
        bpy.data.objects.remove(ob)

    # --- Export -------------------------------------------------------------------------------
    def exporter(self, chemin):
        racines = {}
        for niv in NIVEAUX:
            vide = bpy.data.objects.new(niv, None)
            bpy.context.scene.collection.objects.link(vide)
            racines[niv] = vide
            nb = 0
            for mat, (bm, _) in self.geo[niv].items():
                bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
                me = bpy.data.meshes.new(f"{niv}_{mat}")
                bm.to_mesh(me)
                bm.free()
                if niv != "COLLISION":
                    me.materials.append(self.mats[mat])
                ob = bpy.data.objects.new(f"{niv}_{mat}", me)
                bpy.context.scene.collection.objects.link(ob)
                ob.parent = vide
                nb += len(me.polygons)
            self.stats[niv] = nb
        os.makedirs(os.path.dirname(chemin), exist_ok=True)
        bpy.ops.export_scene.gltf(filepath=chemin, export_format="GLB", export_yup=True, export_apply=True,
                                  export_image_format="AUTO", export_materials="EXPORT", export_extras=False,
                                  export_normals=True, export_texcoords=True)
        print(f"[{self.ident}] faces : " + ", ".join(f"{k} {v}" for k, v in self.stats.items()) +
              f" -> {chemin} ({os.path.getsize(chemin) / 1e6:.2f} Mo)")


def srgb_lin(c):
    """Couleur sRGB (0-255 ou 0-1) -> linéaire (Blender)."""
    if max(c) > 1:
        c = [v / 255 for v in c]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _liste(n):
    return (n,) if isinstance(n, str) else n


def _aire(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2


def _sans_doublon(poly):
    out = []
    for p in poly:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > 0.05:
            out.append((p[0], p[1]))
    if len(out) > 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) < 0.05:
        out.pop()
    return out


def charger(ident):
    import json
    return json.load(open(os.path.join(ICI, "..", "donnees", f"{ident}.json"), encoding="utf-8"))


def dans(x, z, poly):
    c = False
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[i - 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            c = not c
    return c


def centre(poly):
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def rect(c, hl, hw, ang):
    """Rectangle (x, z) : demi-longueur hl selon (cos ang, sin ang), demi-largeur hw."""
    ca, sa = math.cos(ang), math.sin(ang)
    P = lambda u, w: (c[0] + u * ca - w * sa, c[1] + u * sa + w * ca)
    return [P(-hl, -hw), P(hl, -hw), P(hl, hw), P(-hl, hw)]


def local(c, ang, u, w):
    """Point (x, z) à (u, w) d'un repère centré en c, axe u selon (cos ang, sin ang)."""
    ca, sa = math.cos(ang), math.sin(ang)
    return (c[0] + u * ca - w * sa, c[1] + u * sa + w * ca)


def rect_oriente(poly):
    """Rectangle orienté minimal (centre, demi-longueur, demi-largeur, angle) d'un polygone (x, z)."""
    best = None
    pts = _sans_doublon(poly)
    for i in range(len(pts)):
        a, b = pts[i], pts[(i + 1) % len(pts)]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        ca, sa = math.cos(ang), math.sin(ang)
        us = [p[0] * ca + p[1] * sa for p in pts]
        ws = [-p[0] * sa + p[1] * ca for p in pts]
        ar = (max(us) - min(us)) * (max(ws) - min(ws))
        if best is None or ar < best[0]:
            uc, wc = (max(us) + min(us)) / 2, (max(ws) + min(ws)) / 2
            best = (ar, (uc * ca - wc * sa, uc * sa + wc * ca), (max(us) - min(us)) / 2, (max(ws) - min(ws)) / 2, ang)
    _, c, hl, hw, ang = best
    if hw > hl:
        hl, hw, ang = hw, hl, ang + math.pi / 2
    return c, hl, hw, ang

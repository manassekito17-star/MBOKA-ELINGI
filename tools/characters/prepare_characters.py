#!/usr/bin/env python3
"""
MBOKA ELENGI — Préparation des personnages humains 3D.

Source (licence CC0, domaine public) :
  - « Universal Base Characters [Standard] » de Quaternius (corps homme/femme riggés)
  - « Universal Animation Library [Standard] » de Quaternius (43 animations)
  https://quaternius.com

Ce script :
  1. copie les modèles glTF dans game/assets/characters/ ;
  2. réduit les textures à 1024 px (mobile) et corrige les noms d'images ;
  3. génère un MASQUE DE VÊTEMENTS (chemise / manches / pantalon / chaussures)
     à partir de la position 3D de chaque triangle du corps : le jeu peut ainsi
     habiller les personnages et changer le teint de peau par shader.

Masque (RGB) : R = chemise, G = 1.0 manches longues / 0.5 col montant, B = 1.0 pantalon / 0.5 chaussures.

Usage :
  python3 tools/characters/prepare_characters.py <dossier_UBC_Standard> <UAL1_Standard.glb> game/assets
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

TEX = 1024


def load_gltf(path):
    g = json.load(open(path))
    b = open(os.path.join(os.path.dirname(path), g["buffers"][0]["uri"]), "rb").read()

    def acc(i):
        a = g["accessors"][i]
        bv = g["bufferViews"][a["bufferView"]]
        n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dt = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a["componentType"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride")
        item = np.dtype(dt).itemsize * n
        if stride and stride != item:
            raw = np.frombuffer(b, dtype=np.uint8, count=stride * a["count"], offset=off).reshape(a["count"], stride)
            return np.frombuffer(raw[:, :item].tobytes(), dtype=dt).reshape(a["count"], n)
        return np.frombuffer(b, dtype=dt, count=a["count"] * n, offset=off).reshape(a["count"], n)

    return g, acc


def classify(P, height, female):
    """Région vestimentaire pour chaque point (tableau N×3, pose en T, mètres).
    Retourne un tableau RGB : R chemise, G manches longues(1)/col montant(0.5), B pantalon(1)/chaussures(0.5)."""
    x, y = np.abs(P[:, 0]), P[:, 1]
    neck = 0.835 * height
    waist = (0.545 if female else 0.535) * height
    ankle = 0.055 * height
    out = np.zeros((len(P), 3), np.uint8)
    arm = (x > 0.17) & (y > 0.70 * height)
    body = ~arm
    out[body & (y < ankle), 2] = 128
    out[body & (y >= ankle) & (y < waist - 0.03), 2] = 255
    out[body & (y >= waist - 0.03) & (y <= neck), 0] = 255
    out[body & (y > neck) & (y < neck + 0.075), 1] = 128          # col montant (optionnel)
    out[arm & (x < 0.36), 0] = 255                                  # manches courtes
    out[arm & (x >= 0.36) & (x < 0.66), 1] = 255                    # manches longues
    return out


def build_mask(gltf_path, body_mesh_index, out_png, female):
    """Rastérise chaque triangle dans l'espace UV en interpolant la position 3D
    (coordonnées barycentriques) : bords de vêtements nets, sans dents de scie."""
    g, acc = load_gltf(gltf_path)
    prim = g["meshes"][body_mesh_index]["primitives"][0]
    P = acc(prim["attributes"]["POSITION"]).astype(np.float64)
    UV = acc(prim["attributes"]["TEXCOORD_0"]).astype(np.float64) * TEX
    idx = acc(prim["indices"]).reshape(-1, 3)
    height = float(P[:, 1].max())
    img = np.zeros((TEX, TEX, 3), np.uint8)
    for tri in idx:
        uv = UV[tri]
        x0, y0 = np.floor(uv.min(0)).astype(int)
        x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, TEX - 1), min(y1, TEX - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        a, b, c = uv
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-9:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        w2 = 1 - w0 - w1
        inside = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not inside.any():
            continue
        pts = (w0[inside, None] * P[tri[0]] + w1[inside, None] * P[tri[1]] + w2[inside, None] * P[tri[2]])
        img[(ys[inside] - 0.5).astype(int), (xs[inside] - 0.5).astype(int)] = classify(pts, height, female)
    # Dilatation légère pour éviter les coutures entre îlots UV.
    Image.fromarray(img, "RGB").filter(ImageFilter.MaxFilter(3)).save(out_png)


def resize_copy(src, dst, size=TEX):
    im = Image.open(src)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA") else "RGB")
    im = im.resize((size, size), Image.LANCZOS)
    im.save(dst, optimize=True)


def main(ubc, ual_glb, assets):
    src = os.path.join(ubc, "Base Characters", "Godot - UE")
    hair_src = os.path.join(ubc, "Hairstyles", "Origin at 0", "glTF (Godot)")
    out = os.path.join(assets, "characters")
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(assets, "animations"), exist_ok=True)

    textures = {
        "T_Superhero_Male_Dark.png", "T_Superhero_Male_Normal.png", "T_Superhero_Male_Roughness.png",
        "T_Superhero_Female_Dark_BaseColor.png", "T_Superhero_Female_Normal.png", "T_Superhero_Female_Roughness.png",
        "T_Hair_1_BaseColor.png", "T_Hair_1_Normal.png", "T_Hair_2_BaseColor.png", "T_Hair_2_Normal.png",
        "T_Eye_Brown.png", "T_Eye_Normal.png",
    }
    for t in textures:
        size = 256 if t.startswith("T_Eye") else TEX
        resize_copy(os.path.join(src, t), os.path.join(out, t), size)

    rename = {"T_Hair_1_Normal_png.png": "T_Hair_1_Normal.png", "T_Hair_2_Normal_png.png": "T_Hair_2_Normal.png",
              "T_Eye_Normal_png.png": "T_Eye_Normal.png", "T_Hair_1_BaseColor_png.png": "T_Hair_1_BaseColor.png",
              "T_Hair_2_BaseColor_png.png": "T_Hair_2_BaseColor.png"}
    for who in ("Male", "Female"):
        name = f"Superhero_{who}_FullBody"
        g = json.load(open(os.path.join(src, name + ".gltf")))
        for im in g.get("images", []):
            im["uri"] = rename.get(im["uri"], im["uri"])
        dst_name = f"Human_{who}"
        g["buffers"][0]["uri"] = dst_name + ".bin"
        json.dump(g, open(os.path.join(out, dst_name + ".gltf"), "w"))
        shutil.copy(os.path.join(src, name + ".bin"), os.path.join(out, dst_name + ".bin"))
        body = next(i for i, m in enumerate(g["meshes"]) if "Superhero" in g["materials"][m["primitives"][0]["material"]]["name"])
        build_mask(os.path.join(src, name + ".gltf"), body, os.path.join(out, f"T_{who}_ClothesMask.png"), who == "Female")

    for h in ("Hair_Buzzed", "Hair_BuzzedFemale", "Hair_Buns", "Hair_Long", "Hair_Beard", "Hair_SimpleParted"):
        g = json.load(open(os.path.join(hair_src, h + ".gltf")))
        for im in g.get("images", []):
            im["uri"] = rename.get(im["uri"], im["uri"])
        json.dump(g, open(os.path.join(out, h + ".gltf"), "w"))
        shutil.copy(os.path.join(hair_src, h + ".bin"), os.path.join(out, h + ".bin"))

    shutil.copy(ual_glb, os.path.join(assets, "animations", "UAL1_Standard.glb"))
    with open(os.path.join(out, "LICENCE.txt"), "w") as f:
        f.write("Modèles et animations : Quaternius (https://quaternius.com)\n"
                "« Universal Base Characters » et « Universal Animation Library »\n"
                "Licence CC0 1.0 (domaine public) : https://creativecommons.org/publicdomain/zero/1.0/\n"
                "Textures réduites et masque de vêtements générés par tools/characters/prepare_characters.py\n")
    print("OK ->", out)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])

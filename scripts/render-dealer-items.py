"""Render the 29 auction items as transparent WebP card assets in Blender."""

import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "dealer-items")
os.makedirs(OUT, exist_ok=True)

ITEMS = [
    "golden-cross", "golden-egg", "coffee-mug", "gold-medal", "silver-medal", "m1-helmet",
    "antique-vase", "retro-monitor", "guitar", "rocket-launcher", "model-ship", "old-chest",
    "flower-pot", "charcoal-iron", "cithara", "crown", "ea-nasir-copper", "golden-key",
    "folding-fan", "geiger-counter", "hour-glass", "katana", "sword", "sealed-scroll",
    "pistol", "chariot-wheel", "roman-sandals", "viking-helmet", "vintage-typewriter",
]

ERA_COLORS = [
    (0.95, 0.50, 0.10, 1), (0.95, 0.50, 0.10, 1), (0.20, 0.65, 0.90, 1), (0.35, 0.62, 0.85, 1),
    (0.35, 0.62, 0.85, 1), (0.35, 0.62, 0.85, 1), (0.82, 0.35, 0.16, 1), (0.20, 0.72, 0.62, 1),
    (0.20, 0.65, 0.90, 1), (0.20, 0.72, 0.62, 1), (0.65, 0.38, 0.76, 1), (0.95, 0.50, 0.10, 1),
    (0.20, 0.65, 0.90, 1), (0.65, 0.38, 0.76, 1), (0.82, 0.35, 0.16, 1), (0.95, 0.50, 0.10, 1),
    (0.22, 0.66, 0.46, 1), (0.65, 0.38, 0.76, 1), (0.65, 0.38, 0.76, 1), (0.20, 0.72, 0.62, 1),
    (0.95, 0.50, 0.10, 1), (0.95, 0.50, 0.10, 1), (0.95, 0.50, 0.10, 1), (0.95, 0.50, 0.10, 1),
    (0.35, 0.62, 0.85, 1), (0.82, 0.35, 0.16, 1), (0.82, 0.35, 0.16, 1), (0.95, 0.50, 0.10, 1),
    (0.20, 0.72, 0.62, 1),
]


def material(name, color, metallic=0.0, roughness=0.42):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def finish(obj, mat=None, bevel=0.06):
    if mat:
        obj.data.materials.append(mat)
    if bevel and hasattr(obj.data, "polygons"):
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    for poly in getattr(obj.data, "polygons", []):
        poly.use_smooth = True
    return obj


def cube(name, loc, scale, mat, rot=(0, 0, 0), bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, bevel)


def uv(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, 0)


def cyl(name, loc, radius, depth, mat, rot=(0, 0, 0), vertices=40):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, mat, 0.035)


def torus(name, loc, major, minor, mat, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat, 0)


def cone(name, loc, r1, r2, depth, mat, rot=(0, 0, 0), vertices=32):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    return finish(bpy.context.object, mat, 0.025)


def curve_tube(name, points, radius, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for bp, co in zip(spline.bezier_points, points):
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def setup_scene(index):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.quality = 88
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.018, 0.012, 0.01, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.22
    scene.world = world

    camera_data = bpy.data.cameras.new("Camera")
    camera = bpy.data.objects.new("Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.7
    camera.location = (4.6, -6.2, 4.2)
    look_at(camera, (0, 0, 1.05))

    for name, loc, energy, size, color in [
        ("Key", (4, -4, 7), 850, 4.0, (1.0, 0.70, 0.38)),
        ("Fill", (-4, -1, 4), 520, 3.5, ERA_COLORS[index][:3]),
        ("Rim", (1, 4, 5), 700, 2.8, (0.35, 0.62, 1.0)),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(name, data)
        light.location = loc
        bpy.context.collection.objects.link(light)
        look_at(light, (0, 0, 1))

    dark = material("Pedestal", (0.055, 0.035, 0.03, 1), 0.15, 0.32)
    gold = material("Pedestal trim", (0.67, 0.32, 0.065, 1), 0.72, 0.2)
    cyl("Pedestal", (0, 0, 0.08), 1.22, 0.18, dark)
    torus("Pedestal ring", (0, 0, 0.19), 1.02, 0.045, gold)
    return scene


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_item(i):
    gold = material("Gold", (0.83, 0.44, 0.075, 1), 0.86, 0.18)
    silver = material("Silver", (0.58, 0.66, 0.72, 1), 0.82, 0.2)
    steel = material("Steel", (0.16, 0.19, 0.22, 1), 0.72, 0.24)
    wood = material("Wood", (0.24, 0.075, 0.025, 1), 0.04, 0.48)
    darkwood = material("Dark wood", (0.075, 0.025, 0.015, 1), 0.02, 0.5)
    ceramic = material("Ceramic", (0.74, 0.64, 0.49, 1), 0.08, 0.22)
    ivory = material("Ivory", (0.9, 0.78, 0.55, 1), 0.02, 0.36)
    red = material("Red", (0.52, 0.035, 0.025, 1), 0.1, 0.35)
    green = material("Green", (0.08, 0.32, 0.18, 1), 0.15, 0.42)
    black = material("Black", (0.018, 0.022, 0.026, 1), 0.25, 0.3)
    copper = material("Copper", (0.42, 0.16, 0.045, 1), 0.76, 0.3)
    paper = material("Parchment", (0.72, 0.53, 0.29, 1), 0.0, 0.62)

    if i == 0:  # cross
        cube("Cross vertical", (0, 0, 1.25), (.27, .16, 1.05), gold)
        cube("Cross arms", (0, 0, 1.58), (.78, .16, .25), gold)
    elif i == 1:
        uv("Golden egg", (0, 0, 1.15), (.72, .72, 1.15), gold)
        torus("Egg band", (0, 0, 1.15), .66, .035, red, rot=(math.pi/2, 0, 0))
    elif i == 2:
        cyl("Mug", (0, 0, .95), .66, 1.18, ceramic)
        torus("Handle", (.68, 0, 1.0), .38, .11, ceramic, rot=(math.pi/2, 0, 0), scale=(1, 1, .8))
        cyl("Coffee", (0, 0, 1.56), .56, .035, darkwood)
    elif i in (3, 4):
        metal = gold if i == 3 else silver
        cube("Ribbon L", (-.25, .05, 1.72), (.24, .06, .75), red, rot=(0, .2, -.12))
        cube("Ribbon R", (.25, .05, 1.72), (.24, .06, .75), ivory, rot=(0, -.2, .12))
        cyl("Medal", (0, -.04, .86), .64, .16, metal, rot=(math.pi/2, 0, 0))
        torus("Medal edge", (0, -.14, .86), .51, .055, metal, rot=(math.pi/2, 0, 0))
    elif i == 5:
        uv("Helmet dome", (0, 0, 1.25), (1.02, .86, .62), green)
        cube("Helmet brim", (0, -.18, .88), (1.16, .82, .10), green)
        cube("Helmet strap", (0, .38, .67), (.07, .38, .45), darkwood, rot=(.4, 0, 0))
    elif i == 6:
        uv("Vase belly", (0, 0, .9), (.78, .78, .72), ceramic)
        cone("Vase neck", (0, 0, 1.65), .36, .22, .82, ceramic)
        torus("Vase lip", (0, 0, 2.08), .28, .07, gold)
        torus("Vase band", (0, 0, .98), .72, .055, red)
    elif i == 7:
        cube("Monitor", (0, 0, 1.25), (1.05, .38, .78), ivory, bevel=.12)
        cube("Screen", (0, -.405, 1.3), (.78, .035, .52), black, bevel=.04)
        cube("Stand", (0, .02, .47), (.2, .22, .35), ivory)
        cube("Base", (0, 0, .25), (.64, .45, .09), ivory)
    elif i == 8:
        uv("Guitar body A", (0, 0, .8), (.75, .3, .62), wood)
        uv("Guitar body B", (0, 0, 1.32), (.58, .26, .52), wood)
        cube("Guitar neck", (0, 0, 2.02), (.13, .13, .84), darkwood)
        cyl("Sound hole", (0, -.31, 1.02), .2, .025, black, rot=(math.pi/2, 0, 0))
    elif i == 9:
        cyl("Launcher tube", (0, 0, 1.18), .36, 2.45, green, rot=(0, math.pi/2, 0))
        cone("Launcher flare", (-1.3, 0, 1.18), .58, .37, .42, steel, rot=(0, math.pi/2, 0))
        cube("Launcher grip", (.25, 0, .61), (.18, .2, .46), black, rot=(0, -.25, 0))
    elif i == 10:
        cone("Ship hull", (0, 0, .65), .95, .58, 1.8, darkwood, rot=(0, math.pi/2, 0))
        cyl("Mast", (0, 0, 1.45), .055, 1.85, wood)
        cube("Sail", (.34, .02, 1.55), (.45, .035, .62), ivory, rot=(0, -.18, 0))
    elif i == 11:
        cube("Chest", (0, 0, .75), (1.0, .7, .58), wood, bevel=.12)
        cube("Chest lid", (0, 0, 1.4), (1.03, .72, .22), darkwood, bevel=.15)
        cube("Chest bands", (0, -.73, 1.0), (.16, .045, .76), gold)
        cube("Chest lock", (0, -.79, .87), (.18, .08, .22), gold)
    elif i == 12:
        cone("Pot", (0, 0, .62), .68, .5, .82, ceramic)
        cyl("Pot rim", (0, 0, 1.05), .62, .16, ceramic)
        for a in (-.6, -.3, 0, .3, .6):
            uv("Leaf", (math.sin(a)*.48, 0, 1.55+math.cos(a)*.28), (.2, .08, .55), green)
    elif i == 13:
        cone("Iron body", (0, -.05, .65), .95, .34, .62, steel, rot=(0, math.pi/2, 0))
        curve_tube("Iron handle", [(-.58,0,1.0),(-.45,0,1.75),(.48,0,1.75),(.65,0,1.0)], .1, wood)
    elif i == 14:
        cube("Cithara base", (0, 0, .4), (.88, .2, .16), gold)
        curve_tube("Cithara frame", [(-.75,0,.45),(-.95,0,1.7),(-.55,0,2.2),(0,0,2.3),(.55,0,2.2),(.95,0,1.7),(.75,0,.45)], .11, wood)
        for x in (-.45, -.22, 0, .22, .45):
            cube("String", (x, -.03, 1.25), (.012, .012, .78), gold, bevel=0)
    elif i == 15:
        cyl("Crown band", (0, 0, .78), .83, .58, gold, vertices=12)
        for a in range(8):
            angle = a * math.tau / 8
            cone("Crown point", (math.cos(angle)*.68, math.sin(angle)*.68, 1.43), .2, 0, .9, gold)
    elif i == 16:
        cube("Copper ingot", (0, 0, .75), (1.05, .62, .45), copper, rot=(0, 0, .12), bevel=.16)
        cube("Patina", (.28, -.64, .86), (.32, .025, .18), green, bevel=.08)
    elif i == 17:
        torus("Key bow", (-.62, 0, 1.2), .42, .12, gold, rot=(math.pi/2, 0, 0))
        cube("Key shaft", (.28, 0, 1.2), (.78, .11, .11), gold)
        cube("Key tooth A", (.82, 0, .93), (.12, .11, .28), gold)
        cube("Key tooth B", (1.08, 0, 1.03), (.12, .11, .18), gold)
    elif i == 18:
        for a in range(-4, 5):
            cube("Fan rib", (a*.14, 0, 1.05), (.055, .07, .92), gold, rot=(0, a*.13, -a*.11))
        uv("Fan leaf", (0, .04, 1.4), (1.15, .05, .75), red)
    elif i == 19:
        cube("Counter", (0, 0, 1.0), (.9, .48, .76), green, bevel=.12)
        cube("Meter", (-.25, -.5, 1.22), (.36, .025, .28), ivory, bevel=.03)
        for x in (.2, .48):
            cyl("Dial", (x, -.51, .8), .13, .05, black, rot=(math.pi/2, 0, 0))
        cyl("Probe", (.95, 0, 1.25), .08, 1.15, steel, rot=(0, math.pi/2, 0))
    elif i == 20:
        cyl("Hourglass top", (0, 0, 1.9), .72, .14, gold)
        cyl("Hourglass bottom", (0, 0, .45), .72, .14, gold)
        for x in (-.55, .55):
            cyl("Hourglass post", (x, 0, 1.18), .07, 1.55, wood)
        cone("Upper glass", (0, 0, 1.48), .46, .08, .68, ivory, rot=(math.pi,0,0))
        cone("Lower glass", (0, 0, .83), .46, .08, .68, ivory)
    elif i in (21, 22):
        blade = silver
        cube("Blade", (0, 0, 1.35), (.12 if i==21 else .16, .055, 1.25), blade, rot=(0, .12 if i==21 else 0, 0), bevel=.025)
        cube("Guard", (0, 0, .34), (.58, .13, .1), gold)
        cyl("Grip", (0, 0, .02), .12, .62, darkwood)
        if i == 21: cube("Scabbard", (.5, .18, 1.12), (.13, .1, 1.35), black, rot=(0, -.12, 0))
    elif i == 23:
        cyl("Scroll", (0, 0, 1.08), .52, 1.7, paper, rot=(0, math.pi/2, 0))
        cyl("Scroll cap L", (-.9, 0, 1.08), .64, .16, gold, rot=(0, math.pi/2, 0))
        cyl("Scroll cap R", (.9, 0, 1.08), .64, .16, gold, rot=(0, math.pi/2, 0))
        torus("Seal", (0, -.55, 1.08), .2, .06, red, rot=(math.pi/2,0,0))
    elif i == 24:
        cube("Pistol slide", (-.15, 0, 1.28), (.82, .2, .22), steel, bevel=.07)
        cube("Pistol grip", (.38, 0, .65), (.25, .2, .54), darkwood, rot=(0, -.28, 0))
        cyl("Pistol barrel", (-.88, 0, 1.3), .13, .55, black, rot=(0, math.pi/2, 0))
        torus("Trigger guard", (.12, 0, .92), .22, .055, steel, rot=(math.pi/2,0,0), scale=(1,.6,1))
    elif i == 25:
        torus("Wheel rim", (0, 0, 1.15), 1.0, .16, wood, rot=(math.pi/2, 0, 0))
        cyl("Hub", (0, -.08, 1.15), .24, .36, gold, rot=(math.pi/2, 0, 0))
        for a in range(10):
            cube("Spoke", (math.cos(a*math.tau/10)*.48, -.02, 1.15+math.sin(a*math.tau/10)*.48), (.055, .055, .56), wood, rot=(0, a*math.tau/10, -a*math.tau/10))
    elif i == 26:
        for x in (-.5, .5):
            cube("Sandal sole", (x, 0, .42), (.34, .75, .11), darkwood, rot=(0, 0, x*.12), bevel=.12)
            torus("Sandal strap", (x, -.12, .65), .28, .07, red, rot=(math.pi/2,0,0), scale=(1,1.5,1))
    elif i == 27:
        uv("Viking helmet", (0, 0, 1.15), (.9, .8, .62), steel)
        cube("Helmet band", (0, -.78, 1.1), (.88, .08, .13), gold)
        for side in (-1,1):
            cone("Horn", (side*1.02, 0, 1.55), .25, 0, 1.0, ivory, rot=(0, side*.65, 0))
    else:
        cube("Typewriter body", (0, 0, .7), (1.08, .68, .44), black, bevel=.12)
        cube("Paper carriage", (0, .2, 1.42), (.92, .12, .58), steel, rot=(.12,0,0))
        cube("Paper", (0, .05, 1.67), (.72, .025, .48), ivory, rot=(.12,0,0))
        for row in range(3):
            for col in range(8):
                cyl("Key", ((col-3.5)*.22, -.69+row*.12, .52+row*.08), .065, .05, ivory, rot=(math.pi/2,0,0), vertices=16)


for index, slug in enumerate(ITEMS):
    scene = setup_scene(index)
    build_item(index)
    scene.render.filepath = os.path.join(OUT, f"{index:02d}-{slug}.webp")
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {index + 1:02d}/{len(ITEMS)} {slug}")

print(f"Done: {OUT}")

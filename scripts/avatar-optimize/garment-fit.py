# Mặc áo (file .glb tạo từ ảnh bằng AI image-to-3D, vd Hunyuan3D) lên người mẫu MPFB - chạy ngầm bằng Blender:
#   "C:/Program Files/Blender Foundation/Blender 5.3/blender.exe" -b --factory-startup --python garment-fit.py --
#       <người-mẫu.glb> <áo.glb> <thư-mục-ảnh-xem-thử> <áo-đã-mặc.glb> ['{"ease_y": 1.2, "collar": 0.848}']
#   rồi nén:  node garment.mjs <áo-đã-mặc.glb> ../../frontend/public/models/garments/<tên>.glb
# Ví dụ áo cardigan nữ: người mẫu D:/THORS-3D/avatar-female-v1.glb, tham số {"faces": 40000, "ease_y": 1.2, "collar": 0.848}.
# Các bước: xoay áo về phía trước -> dựng thẳng (áo AI hay bị nghiêng) -> giảm số mặt -> co giãn + đặt đúng vai
# -> nâng tay áo theo góc tay người mẫu -> đẩy phần lọt vào trong người ra ngoài
# -> tạo núm co giãn (shape key) theo núm số đo của người mẫu -> xuất GLB (ảnh JPEG 1024).
# Xem ảnh fit_front / fit_side / fit_back / fit_big trong thư mục ảnh để kiểm tra trước khi đưa lên web.
import bpy, bmesh, sys, math, json
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
body_path, garment_path, out_dir = argv[0], argv[1], argv[2]
export_path = argv[3] if len(argv) > 3 else None
P = json.loads(argv[4]) if len(argv) > 4 else {}

KEEP = ['measure-bust-circ-incr', 'measure-bust-circ-decr', 'measure-waist-circ-incr',
        'measure-waist-circ-decr', 'measure-hips-circ-incr', 'measure-hips-circ-decr']
TARGET_FACES = P.get('faces', 24000)
EASE = P.get('ease', 1.16)          # độ rộng áo so với thân ở vòng ngực
COLLAR = P.get('collar', 0.842)     # cổ áo phía sau nằm ở tỉ lệ chiều cao người
PUSH = P.get('push', 0.007)         # khoảng hở tối thiểu giữa áo và da (m)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

def world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]

# ---------- Người mẫu: trạng thái gốc như trên web (núm số đo = 0) ----------
body_objs = import_glb(body_path)
body = next(o for o in body_objs if o.type == 'MESH' and o.name.startswith('Human'))
for o in body_objs:
    if o.type == 'MESH' and o != body:
        o.hide_render = True
keys = body.data.shape_keys.key_blocks
for k in KEEP:
    keys[k].value = 0.0
dg = bpy.context.evaluated_depsgraph_get()
bev = body.evaluated_get(dg)
bverts = [bev.matrix_world @ v.co for v in bev.data.vertices]
H = max(v.z for v in bverts)
print("BODY H", round(H, 4), "verts", len(bverts))

def body_slab(z0, z1):
    return [v for v in bverts if z0 <= v.z <= z1]

# Nửa bề ngang thân ở ngực (bỏ tay: chỉ lấy |x| nhỏ hơn khe nách) - lấy từ người mẫu ở tầm 0.70-0.74 H
chest = [v for v in body_slab(0.70 * H, 0.74 * H) if abs(v.x) < 0.2]
# tay tách khỏi thân: tìm khe hở lớn nhất theo |x|
xs = sorted(abs(v.x) for v in chest)
gap_x, best = xs[-1], 0
for a, b in zip(xs, xs[1:]):
    if b - a > best and a > 0.08:
        best, gap_x = b - a, a
chest_half = gap_x
chest_y = sum(v.y for v in chest if abs(v.x) <= chest_half) / max(1, sum(1 for v in chest if abs(v.x) <= chest_half))
print("BODY chest half-width", round(chest_half, 4), "center y", round(chest_y, 4))

# Trục cánh tay (A-pose): điểm |x| lớn, từ vai xuống khuỷu
arm = [v for v in bverts if v.x > chest_half + 0.04 and 0.60 * H < v.z < 0.80 * H]
def fit_axis(pts):
    # hồi quy x theo z -> góc so với phương thẳng đứng
    n = len(pts); mz = sum(p.z for p in pts) / n; mx = sum(p.x for p in pts) / n
    szz = sum((p.z - mz) ** 2 for p in pts); sxz = sum((p.z - mz) * (p.x - mx) for p in pts)
    slope = sxz / szz  # dx/dz
    return math.degrees(math.atan(-slope)), mx, mz
arm_angle, arm_mx, arm_mz = fit_axis(arm)
arm_my = sum(p.y for p in arm) / len(arm)
print("BODY arm angle from vertical", round(arm_angle, 1))

# ---------- Áo ----------
g_objs = import_glb(garment_path)
g_meshes = [o for o in g_objs if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in g_meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = g_meshes[0]
if len(g_meshes) > 1:
    bpy.ops.object.join()
garment = bpy.context.view_layer.objects.active
garment.name = 'garment'
garment.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in g_objs:
    if o.type != 'MESH' and o.name in bpy.data.objects:
        bpy.data.objects.remove(o)

# Giảm số mặt (giữ đường may UV)
faces = len(garment.data.polygons)
if faces > TARGET_FACES:
    m = garment.modifiers.new('dec', 'DECIMATE')
    m.ratio = TARGET_FACES / faces
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
print("GARMENT faces", faces, "->", len(garment.data.polygons))

me = garment.data
# Mặt trước áo: phía có nhiều chi tiết (nút) - tham số 'flip' quyết định; mặc định áo AI quay +Y -> xoay 180°
if P.get('flip', True):
    me.transform(Matrix.Rotation(math.pi, 4, 'Z'))
gv = [v.co.copy() for v in me.vertices]
gz0, gz1 = min(v.z for v in gv), max(v.z for v in gv)
gh = gz1 - gz0

# Áo AI hay bị nghiêng (đầu áo đổ về trước): đo đường giữa trước-sau ở dải trên / dưới rồi dựng thẳng
def mid_y(pts):
    return (max(p.y for p in pts) + min(p.y for p in pts)) / 2
core_w = 0.15 * (max(p.x for p in gv) - min(p.x for p in gv))
core = [v for v in gv if abs(v.x) < core_w]
top = [v for v in core if v.z > gz1 - 0.25 * gh]
bot = [v for v in core if v.z < gz0 + 0.15 * gh]
tz_top = sum(v.z for v in top) / len(top)
tz_bot = sum(v.z for v in bot) / len(bot)
tilt = math.atan2(mid_y(top) - mid_y(bot), tz_top - tz_bot)
b_core = [v for v in bverts if abs(v.x) < 0.08]
b_top = [v for v in b_core if 0.74 * H < v.z < 0.80 * H]
b_bot = [v for v in b_core if 0.54 * H < v.z < 0.60 * H]
b_tilt = math.atan2(mid_y(b_top) - mid_y(b_bot), 0.22 * H)
corr = (tilt - b_tilt) * P.get('tilt', 1.0)
print("TILT garment", round(math.degrees(tilt), 1), "body", round(math.degrees(b_tilt), 1), "-> rotate", round(math.degrees(corr), 1))
me.transform(Matrix.Rotation(corr, 4, 'X'))
gv = [v.co.copy() for v in me.vertices]
gz0, gz1 = min(v.z for v in gv), max(v.z for v in gv)
gh = gz1 - gz0
# Gấu áo: 8% dưới cùng chỉ có thân (tay áo kết thúc cao hơn)
hem = [v for v in gv if v.z < gz0 + 0.08 * gh]
hem_half = max(abs(v.x) for v in hem)
hem_y = (min(v.y for v in hem) + max(v.y for v in hem)) / 2
s = chest_half * EASE / hem_half
# Bề dày trước-sau: áo AI thường dẹt hơn người -> co giãn riêng trục Y theo độ dày thân người trong vùng áo phủ
g_torso = [v for v in gv if abs(v.x) <= hem_half]
g_depth = max(v.y for v in g_torso) - min(v.y for v in g_torso)
g_mid_y = (max(v.y for v in g_torso) + min(v.y for v in g_torso)) / 2
z_lo, z_hi = COLLAR * H - gh * s, 0.78 * H
b_torso = [v for v in bverts if abs(v.x) <= chest_half and z_lo <= v.z <= z_hi]
b_depth = max(v.y for v in b_torso) - min(v.y for v in b_torso)
b_mid_y = (max(v.y for v in b_torso) + min(v.y for v in b_torso)) / 2
sy = max(s, b_depth * P.get('ease_y', 1.12) / g_depth)
print("GARMENT h", round(gh, 4), "hem half", round(hem_half, 4), "scale", round(s, 4), "scale y", round(sy, 4),
      "depth g/b", round(g_depth * s, 3), round(b_depth, 3))

# Co giãn + đặt: cổ áo sau ở COLLAR*H, tâm thân áo trùng tâm thân người (trước-sau)
S = Matrix.Diagonal((s, sy, s, 1.0))
T = Matrix.Translation(Vector((0, b_mid_y - g_mid_y * sy, COLLAR * H - gz1 * s))) @ S
me.transform(T)
me.update()

# Nâng tay áo theo góc tay người mẫu: chỉ phần nằm ngoài sườn áo (sườn = mép gấu áo), xoay quanh khớp vai
side_x = hem_half * s
gv = [v.co for v in me.vertices]
sleeve = [v for v in gv if abs(v.x) > side_x + 0.03 and v.x > 0]
sleeve_angle, _, _ = fit_axis(sleeve) if len(sleeve) > 50 else (arm_angle, 0, 0)
delta = math.radians(arm_angle - sleeve_angle) * P.get('raise', 1.0)
pivot_x = side_x
pivot_z = P.get('pivot_z', 0.80) * H
print("SLEEVE angle", round(sleeve_angle, 1), "-> raise", round(math.degrees(delta), 1), "pivot", round(pivot_x, 3), round(pivot_z, 3))
blend0, blend1 = side_x, side_x + P.get('blend', 0.06)
SLIM, SLIM_Y = P.get('slim', 1.0), P.get('slim_y', 1.0)
ux, uz = math.sin(math.radians(arm_angle)), -math.cos(math.radians(arm_angle))
for v in me.vertices:
    side = 1 if v.co.x >= 0 else -1
    ax = abs(v.co.x)
    if ax <= blend0:
        continue
    t = min(1.0, (ax - blend0) / (blend1 - blend0))
    t = t * t * (3 - 2 * t)
    a = delta * t
    # xoay quanh khớp vai trong mặt phẳng XZ (nâng tay áo lên-ra ngoài)
    dx, dz = ax - pivot_x, v.co.z - pivot_z
    nx = pivot_x + dx * math.cos(a) - dz * math.sin(a)
    nz = pivot_z + dx * math.sin(a) + dz * math.cos(a)
    # Thu nhỏ ống tay áo về phía trục cánh tay (áo AI tay rộng, nâng lên trông như cánh dơi)
    k = 1.0 + (SLIM - 1.0) * t
    rx, rz = nx - arm_mx, nz - arm_mz
    along = rx * ux + rz * uz
    px, pz = rx - along * ux, rz - along * uz
    nx, nz = arm_mx + along * ux + px * k, arm_mz + along * uz + pz * k
    v.co.y = arm_my + (v.co.y - arm_my) * (1.0 + (SLIM_Y - 1.0) * t)
    v.co.x, v.co.z = side * nx, nz
me.update()

# Kéo phần lưng áo lên (áo AI hay có cổ sau thấp, để hở vai / lưng trên người mẫu)
LIFT = P.get('back_lift', 0.0)
if LIFT:
    z_from, z_to = 0.68 * H, COLLAR * H
    for v in me.vertices:
        back = min(1.0, max(0.0, (v.co.y - b_mid_y) / 0.06 + 0.5))
        up = min(1.0, max(0.0, (v.co.z - z_from) / (z_to - z_from)))
        v.co.z += LIFT * back * up * up * (3 - 2 * up)
    me.update()

# Đẩy phần lọt vào người ra ngoài
sw = garment.modifiers.new('push', 'SHRINKWRAP')
sw.target = body
sw.wrap_method = 'NEAREST_SURFACEPOINT'
sw.wrap_mode = 'OUTSIDE'
sw.offset = PUSH
bpy.context.view_layer.objects.active = garment
bpy.ops.object.modifier_apply(modifier=sw.name)
sm = garment.modifiers.new('smooth', 'CORRECTIVE_SMOOTH')
sm.iterations = 4
sm.smooth_type = 'LENGTH_WEIGHTED'
# corrective smooth không có rest -> chỉ làm mượt nhẹ chỗ bị đẩy

# ---------- Núm co giãn theo người mẫu ----------
if P.get('morphs', True):
    garment.modifiers.remove(sm)
    sd = garment.modifiers.new('follow', 'SURFACE_DEFORM')
    sd.target = body
    sd.falloff = 4.0
    with bpy.context.temp_override(object=garment, active_object=garment):
        bpy.ops.object.surfacedeform_bind(modifier=sd.name)
    print("BIND ok", sd.is_bound)
    basis = garment.shape_key_add(name='Basis', from_mix=False)
    for name in KEEP:
        for k in KEEP:
            keys[k].value = 0.0
        keys[name].value = 1.0
        dg = bpy.context.evaluated_depsgraph_get()
        ev = garment.evaluated_get(dg)
        sk = garment.shape_key_add(name=name, from_mix=False)
        for i, v in enumerate(ev.data.vertices):
            sk.data[i].co = v.co
        sk.value = 0.0
    for k in KEEP:
        keys[k].value = 0.0
    garment.modifiers.remove(sd)
else:
    garment.modifiers.remove(sm)

# ---------- Ảnh xem thử ----------
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.color_type = 'TEXTURE'
scene.render.resolution_x, scene.render.resolution_y = 700, 900
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.type = 'ORTHO'
scene.collection.objects.link(cam)
scene.camera = cam
def shot(name, ang, z0, z1):
    cam.data.ortho_scale = (z1 - z0) * 1.1
    a = math.radians(ang)
    c = Vector((0, 0, (z0 + z1) / 2))
    cam.location = c + Vector((math.sin(a) * 10, -math.cos(a) * 10, 0))
    cam.rotation_euler = (math.radians(90), 0, a)
    scene.render.filepath = f"{out_dir}/{name}.png"
    bpy.ops.render.render(write_still=True)
shot("fit_front", 0, 0.45 * H, 0.95 * H)
shot("fit_side", 90, 0.45 * H, 0.95 * H)
shot("fit_back", 180, 0.45 * H, 0.95 * H)
if P.get('morphs', True):
    for k in ('measure-bust-circ-incr', 'measure-waist-circ-incr'):
        keys[k].value = 1.5
        garment.data.shape_keys.key_blocks[k].value = 1.5
    shot("fit_big", 0, 0.45 * H, 0.95 * H)
    for k in KEEP:
        keys[k].value = 0.0
        garment.data.shape_keys.key_blocks[k].value = 0.0

# ---------- Xuất GLB chỉ có áo, ảnh nén JPEG 1024 ----------
if export_path:
    for img in bpy.data.images:
        if img.size[0] > 1024:
            img.scale(1024, 1024)
    bpy.ops.object.select_all(action='DESELECT')
    garment.select_set(True)
    bpy.ops.export_scene.gltf(filepath=export_path, use_selection=True, export_format='GLB',
                              export_image_format='JPEG', export_jpeg_quality=82,
                              export_morph=True, export_morph_normal=False, export_apply=False,
                              export_animations=False, export_yup=True)
    print("EXPORTED", export_path)

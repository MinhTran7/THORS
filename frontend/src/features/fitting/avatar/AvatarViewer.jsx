import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { ACESFilmicToneMapping, Color, DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { bodyMorph } from './bodyMorph';
import { GARMENT_SIZES } from './wardrobe';
import { bindToBodySkeleton, captureRest, skinToBody, toRest } from './skinGarment';

// Người mẫu theo giới tính: file .glb + .json số đo.
// Nữ: thors_female_avatar.glb, nam: thors_male_avatar.glb (23/11/2026) - cùng lưới với nguoimau / nguoimau_nam (lệch 0 mm,
// file số đo .json giữ nguyên), thêm khung xương Mixamo 52 xương + 9 động tác (Idle, Walk, Turn, Fashion_Pose...).
// Tư thế lưu trong file = tư thế gốc nên đứng yên giống hệt người mẫu cũ, quần áo 3D vẫn khớp.
const MODELS = { FEMALE: '/models/avatar-female', MALE: '/models/avatar-male' };
// Đổi khi thay file người mẫu: trình duyệt buộc tải file mới (không dùng bản cũ trong cache)
const MODEL_VERSION = 'rig-20261123';

// Màu do code quyết định (không phụ thuộc màu đặt trong Blender): ma-nơ-canh xám sứ;
// đồ lót nữ xám than, boxer nam đen. Khóa = bộ phận "Human" (da) / "underwear" (đồ lót) - xem partOf.
const SKIN = new MeshStandardMaterial({ color: '#E6E2DC', roughness: 0.62 });
// Đồ lót nằm sát / trùng da: polygonOffset đẩy nó "lên trước" khi vẽ để không bị lỗi z-fighting
// (da và vải vẽ xen kẽ thành mảng loang lổ) - không phụ thuộc việc đã đẩy vải ra khỏi da trong Blender hay chưa.
const underwearMaterial = (color, roughness) =>
  new MeshStandardMaterial({ color, roughness, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
const MATERIALS_BY_GENDER = {
  FEMALE: { Human: SKIN, underwear: underwearMaterial('#2B2B2E', 0.85) },
  MALE: { Human: SKIN, underwear: underwearMaterial('#1A1A1A', 0.8) }
};

// ---- Hiển thị (Giai đoạn A, 24/11/2026) ----
// Ánh sáng môi trường: HDRI studio 1K tự host (public/hdri, CC0 - xem LICENSE.txt), chỉ chiếu sáng + phản chiếu,
// không làm nền. Tone mapping ACES Filmic + quản lý màu sRGB (màu hex của sản phẩm được đổi đúng sang không gian tuyến tính).
const HDRI_URL = '/hdri/studio_small_08_1k.hdr';
const ENV_INTENSITY = 0.55;
const EXPOSURE = 0.95;

/**
 * Da người mẫu có xương (vật liệu "Skin" trong file, màu phẳng không texture): đổi sang MeshPhysicalMaterial
 * - giữ nguyên màu da của file, độ nhám tự nhiên, phản xạ thấp (specular 0.35, không clearcoat) để không bóng như nhựa,
 * - sheen ấm nhẹ ở viền (giả lớp lông tơ / tán xạ dưới da). Không đổi hình học / texture của file.
 */
function makeSkinMaterial(base) {
  // Sao chép mọi thuộc tính của da gốc (màu, màu đỉnh - da trong file lấy màu từ vertex color -, texture, skinning...),
  // rồi chỉ chỉnh các thuộc tính phản xạ; defines PHYSICAL để shader dùng nhánh vật lý
  const m = new MeshPhysicalMaterial();
  MeshStandardMaterial.prototype.copy.call(m, base);
  m.defines = { STANDARD: '', PHYSICAL: '' };
  m.roughness = 0.6;
  m.metalness = 0;
  m.specularIntensity = 0.35;
  m.ior = 1.4;
  m.sheen = 0.25;
  m.sheenRoughness = 0.8;
  m.sheenColor = new Color('#f2c4ae');
  m.clearcoat = 0;
  return m;
}

// Bộ phận của một mảnh trong .glb: theo tên vật thể (người mẫu MPFB: Human / underwear) hoặc theo tên
// vật liệu gốc (người mẫu cũ: MannequinGray = da; UnderwearGray = đồ lót). Người mẫu có xương dùng vật liệu "Skin"
// (da thật của file) - không thay, giữ nguyên như tóc, lông mày, mắt.
const PART_BY_NAME = { Human: 'Human', underwear: 'underwear', MannequinGray: 'Human', UnderwearGray: 'underwear' };
function partOf(obj) {
  // Ghi nhớ tên vật liệu gốc trước khi bị thay (lần vẽ sau vẫn nhận ra bộ phận)
  if (obj.userData.originalMaterial === undefined) obj.userData.originalMaterial = obj.material?.name ?? '';
  return PART_BY_NAME[obj.name] ?? PART_BY_NAME[obj.parent?.name] ?? PART_BY_NAME[obj.userData.originalMaterial] ?? null;
}

// Số vùng tô màu tối đa trong shader (độ vừa: 3 vùng; mặc cả bộ: áo 2 vùng + quần / đầm + giày)
const MAX_ZONES = 6;
// Không giới hạn bề ngang (vd giày: tô cả bàn chân)
const NO_X_LIMIT = 9;
// Mốc cơ thể theo tỉ lệ chiều cao người mẫu, tính từ chân (đo trên người mẫu MPFB)
const BODY = { ankle: 0.05, knee: 0.285, shirtHem: 0.56, pantsTop: 0.6, armpit: 0.75, shoulder: 0.835 };
// Nửa chiều cao vùng "độ vừa" quanh vòng đo (mét, theo cỡ người mẫu)
const FIT_HALF_HEIGHT = { bust: 0.07, waist: 0.055, hips: 0.085 };

/**
 * Vật liệu có tô màu theo vùng: bản sao vật liệu gốc + đoạn shader phủ màu lên tối đa 6 vùng.
 * Mỗi vùng = dải độ cao [y0, y1] (mép mềm) giới hạn bề ngang |x| <= halfX (để không lan ra tay).
 * Dùng cho cả "độ vừa" (ngực / eo / hông đỏ - xanh) lẫn "mặc thử cả bộ" (tô màu áo, quần, giày).
 * Giá trị vùng nằm trong uniforms (đổi size / đổi món chỉ đổi số, không phải dựng lại shader).
 */
function makeZoneMaterial(base) {
  const material = base.clone();
  const uniforms = {
    uY0: { value: Array(MAX_ZONES).fill(0) },
    uY1: { value: Array(MAX_ZONES).fill(0) },
    uHalfX: { value: Array(MAX_ZONES).fill(0) },
    uFeather: { value: Array(MAX_ZONES).fill(0.01) },
    uMix: { value: Array(MAX_ZONES).fill(0) },
    uOn: { value: Array(MAX_ZONES).fill(0) },
    uColor: { value: Array.from({ length: MAX_ZONES }, () => new Color()) }
  };
  material.userData.zoneUniforms = uniforms;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFitPos;')
      // Toạ độ THẾ GIỚI của điểm sau khi cộng các núm (morph) -> vùng màu đi theo dáng khách.
      // Không dùng thẳng "transformed": file .glb đã nén (lượng tử hoá) nên toạ độ trong mesh không phải mét,
      // modelMatrix mới đưa về đúng mét (kèm tỉ lệ chiều cao của khách).
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFitPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vFitPos;
        uniform float uY0[${MAX_ZONES}];
        uniform float uY1[${MAX_ZONES}];
        uniform float uHalfX[${MAX_ZONES}];
        uniform float uFeather[${MAX_ZONES}];
        uniform float uMix[${MAX_ZONES}];
        uniform float uOn[${MAX_ZONES}];
        uniform vec3 uColor[${MAX_ZONES}];`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        for (int i = 0; i < ${MAX_ZONES}; i++) {
          if (uOn[i] < 0.5) continue;
          float f = uFeather[i];
          float wy = smoothstep(uY0[i] - f, uY0[i] + f, vFitPos.y) * (1.0 - smoothstep(uY1[i] - f, uY1[i] + f, vFitPos.y));
          float wx = 1.0 - smoothstep(uHalfX[i], uHalfX[i] * 1.12, abs(vFitPos.x));
          diffuseColor.rgb = mix(diffuseColor.rgb, uColor[i], wy * wx * uMix[i]);
        }`
      );
  };
  material.customProgramCacheKey = () => 'thors-zones';
  return material;
}

/**
 * Tính các vùng tô màu (toạ độ theo cỡ người mẫu, chưa nhân scale).
 * fit: { bust: { color }, waist: {...}, hips: {...} } - độ vừa của size đang thử.
 * outfit: [{ role: TOP | BOTTOM | DRESS | SHOES, color: '#hex', short: bool }] - mặc thử cả bộ.
 */
function zonesFor({ fit, outfit }, calibration, girths) {
  const H = calibration.heightCm / 100;
  const y = (ratio) => (calibration.minY ?? 0) + ratio * H;
  const half = (name) => {
    const m = calibration.measures[name];
    return m?.section ? m.section.rx * ((girths[name] || m.baseCm) / m.baseCm) : 0.15;
  };
  const zones = [];

  if (fit) {
    for (const name of ['bust', 'waist', 'hips']) {
      const m = calibration.measures[name];
      if (!m?.section || !fit[name]?.color) continue;
      const center = y(m.atHeightRatio);
      const h = FIT_HALF_HEIGHT[name];
      zones.push({ y0: center - h, y1: center + h, halfX: half(name) * 1.05, feather: h * 0.4, mix: 0.85, color: fit[name].color });
    }
  }

  for (const item of outfit ?? []) {
    const base = { feather: 0.012, mix: 0.92, color: item.color };
    const torso = Math.max(half('bust'), half('waist')) * 1.1;
    const shoulders = { ...base, y0: y(BODY.armpit - 0.01), y1: y(BODY.shoulder), halfX: 0.21 };
    if (item.role === 'TOP') {
      zones.push({ ...base, y0: y(BODY.shirtHem), y1: y(BODY.armpit), halfX: torso }, shoulders);
    } else if (item.role === 'DRESS') {
      const body = Math.max(half('bust'), half('hips')) * 1.15;
      zones.push({ ...base, y0: y(BODY.knee), y1: y(BODY.armpit), halfX: body }, shoulders);
    } else if (item.role === 'BOTTOM') {
      // Quần short / chân váy: tới gối; quần dài: tới mắt cá
      zones.push({ ...base, y0: y(item.short ? BODY.knee + 0.04 : BODY.ankle + 0.01), y1: y(BODY.pantsTop), halfX: half('hips') * 1.15 });
    } else if (item.role === 'SHOES') {
      zones.push({ ...base, y0: y(0) - 0.05, y1: y(BODY.ankle), halfX: NO_X_LIMIT });
    }
  }
  return zones.slice(0, MAX_ZONES);
}

/**
 * Nhãn chữ cạnh từng vùng ("Ngực hơi chật"). Vùng chưa có số đo: nhãn xám, không tô màu thân.
 * fit: { bust: { color, text }, ... } (color null = chưa có số đo)
 */
function FitLabels({ calibration, girths, fit }) {
  const modelHeight = calibration.heightCm / 100;
  return Object.entries(fit).map(([name, { color, text }]) => {
    const m = calibration.measures[name];
    if (!m?.section) return null;
    const k = (girths[name] || m.baseCm) / m.baseCm;
    const y = (calibration.minY ?? 0) + m.atHeightRatio * modelHeight;
    return (
      <Html
        key={name}
        position={[m.section.cx + m.section.rx * k + 0.05, y, m.section.cz]}
        center={false}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: color || '#9CA3AF',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
            transform: 'translateY(-50%)'
          }}
        >
          {text}
        </div>
      </Html>
    );
  });
}

/**
 * Áo 3D mặc lên người mẫu (tủ đồ). Áo nằm sẵn đúng chỗ trên người mẫu nên đặt cùng nhóm (cùng scale) là vừa;
 * vặn các núm giống cơ thể để áo béo / gầy theo khách, cộng thêm núm Size theo size đang chọn.
 * item: phần tử WARDROBE; color: màu vải; size: S | M | L | XL.
 */
// Đẩy bề mặt đồ ra ngoài theo pháp tuyến (sau khi đã co giãn + bám xương, theo toạ độ camera, đơn vị mét)
// và cho đồ ưu tiên vẽ đè lên da: da không còn lộ răng cưa qua vải ở chỗ vải sát da
const INFLATE_M = 0.005;
function withInflate(base) {
  const m = base.clone();
  // Vẽ cả mặt trong: nhìn vào cổ áo / gấu áo mở thấy lớp vải phía sau (một mặt thì thành lỗ thủng răng cưa)
  m.side = DoubleSide;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      mvPosition.xyz += normalize(transformedNormal) * ${INFLATE_M.toFixed(4)};
      gl_Position = projectionMatrix * mvPosition;`
    );
  };
  m.customProgramCacheKey = () => 'thors-inflate';
  return m;
}

function Garment({ item, color, size, morphs, weights, body, bodyRoot }) {
  const { scene } = useGLTF(item.url, false, true);
  // Bản sao mọi vật liệu của món đồ (không đụng vật liệu trong bộ nhớ đệm của useGLTF): vải chính đổi màu theo biến thể;
  // tất cả được đẩy ra ngoài da một chút (withInflate) để da không xuyên qua vải ở chỗ vải sát da (cổ áo, vai, nách)
  const materials = useMemo(() => {
    const map = new Map();
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      // Luôn sao từ vật liệu gốc trong file (lần đổi màu sau, obj.material đã là bản sao cũ)
      if (!obj.userData.baseMaterial) obj.userData.baseMaterial = obj.material;
      const base = obj.userData.baseMaterial;
      if (map.has(base)) return;
      const m = withInflate(base);
      // Vải chính: màu theo biến thể; chưa khai báo màu -> giữ màu vải gốc trong file
      if (base.name === item.fabric && (color || item.color)) m.color.set(color || item.color);
      map.set(base, m);
    });
    return map;
  }, [scene, item, color]);

  // Người mẫu có khung xương: tạo bản áo bám xương (cử động theo người) - xem skinGarment.js
  // Áo có sẵn xương: nối vào xương người mẫu theo tên; áo chưa có xương: tự tạo bản bám xương (skinToBody)
  const skinned = useMemo(() => {
    if (!body || !bodyRoot) return null;
    if (bindToBodySkeleton(scene, body)) return null;
    return skinToBody(scene, body, bodyRoot);
  }, [scene, body, bodyRoot]);
  useEffect(() => {
    if (!skinned) return undefined;
    const parent = body.parent;
    skinned.forEach((m) => parent.add(m));
    return () =>
      skinned.forEach((m) => {
        parent.remove(m);
        m.geometry.dispose();
      });
  }, [skinned, body]);

  useLayoutEffect(() => {
    // morphs (mô hình của sản phẩm: { Size_up, Size_down } theo size biến thể) ưu tiên hơn bảng size áo mẫu
    const knobs = { ...weights, ...(morphs ?? GARMENT_SIZES[size]) };
    const meshes = [];
    if (skinned) meshes.push(...skinned);
    else scene.traverse((obj) => obj.isMesh && meshes.push(obj));
    meshes.forEach((obj) => {
      obj.castShadow = true;
      const material = materials.get(obj.userData.baseMaterial);
      if (material) obj.material = material;
      if (!obj.morphTargetDictionary) return;
      // Đặt lại mọi núm (đổi size L -> M thì Size_up phải về 0) rồi vặn theo số đo + size
      obj.morphTargetInfluences.fill(0);
      for (const [name, value] of Object.entries(knobs)) {
        const i = obj.morphTargetDictionary[name];
        if (i !== undefined) obj.morphTargetInfluences[i] = value;
      }
    });
  }, [scene, weights, size, morphs, materials, skinned]);

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Bản bám xương đã gắn thẳng vào người mẫu; không có xương thì đặt nguyên file áo cùng chỗ
  return skinned ? null : <primitive object={scene} />;
}

// Đồ lót của người mẫu (mesh riêng: Bra_Web, Briefs_Web / Briefs_Nam) và các ô đồ che nó.
// Đồ lót nằm sát da nên khi mặc áo / quần nó trồi qua vải thành vệt đen lấm tấm -> ẩn khi bị che, hiện lại khi tháo.
const UNDERWEAR = [
  [/^bra/i, ['TOP', 'OUTER', 'DRESS']],
  [/^briefs/i, ['BOTTOM', 'DRESS']]
];
const underwearKind = (obj) => {
  // Mesh nhiều phần (nhiều vật liệu) nằm trong nhóm mang tên node: xét cả tên mesh lẫn tên nhóm cha
  const names = [obj.name, obj.parent?.name ?? ''];
  return UNDERWEAR.find(([re]) => names.some((n) => re.test(n)));
};

function Mannequin({ url, profile, calibration, fit, outfit, wear, pose }) {
  const MATERIALS = MATERIALS_BY_GENDER[profile.gender] ?? MATERIALS_BY_GENDER.FEMALE;
  // useGLTF(đường dẫn, draco, meshopt): file được nén bằng meshopt (three.js giải nén sẵn, không cần CDN)
  const gltf = useGLTF(`${url}.glb?v=${MODEL_VERSION}`, false, true);
  const { scene, animations } = gltf;
  // Mesh cơ thể có khung xương (người mẫu thors_*_avatar): áo bám vào xương của mesh này
  const body = useMemo(() => {
    let found = null;
    scene.traverse((o) => {
      if (!found && o.isSkinnedMesh && /^Body/i.test(o.name)) found = o;
    });
    if (found) captureRest(found.skeleton, gltf); // tư thế gốc đọc từ dữ liệu của file
    return found;
  }, [scene, gltf]);

  // Dáng: phát animation có sẵn trong file (Idle, Walk, Turn, Fashion_Pose...); không chọn = đứng tư thế gốc
  const { actions, mixer } = useAnimations(animations, scene);
  useEffect(() => {
    const action = pose ? actions[pose] : null;
    if (!action) {
      mixer.stopAllAction();
      if (body) toRest(body.skeleton); // về đúng tư thế gốc của file (áo được dựng ở tư thế này)
      return undefined;
    }
    action.reset().fadeIn(0.3).play();
    return () => action.fadeOut(0.3);
  }, [pose, actions, mixer, body]);
  const { scale, weights, girths } = useMemo(() => bodyMorph(profile, calibration), [profile, calibration]);
  const coloring = Boolean(fit || outfit);
  // Có tô màu: vật liệu riêng (không đụng vật liệu dùng chung của trang Số đo)
  const zoneMaterials = useMemo(
    () => (coloring ? { Human: makeZoneMaterial(MATERIALS.Human), underwear: makeZoneMaterial(MATERIALS.underwear) } : null),
    [coloring, MATERIALS]
  );

  // Cập nhật các vùng. Shader so với toạ độ thế giới (mét, đã nhân tỉ lệ chiều cao của khách) nên nhân thêm scale.
  useEffect(() => {
    if (!zoneMaterials) return;
    const zones = zonesFor({ fit, outfit }, calibration, girths);
    for (const material of Object.values(zoneMaterials)) {
      const u = material.userData.zoneUniforms;
      for (let i = 0; i < MAX_ZONES; i++) {
        const z = zones[i];
        u.uOn.value[i] = z ? 1 : 0;
        if (!z) continue;
        u.uY0.value[i] = z.y0 * scale;
        u.uY1.value[i] = z.y1 * scale;
        u.uHalfX.value[i] = z.halfX * scale;
        u.uFeather.value[i] = z.feather * scale;
        u.uMix.value[i] = z.mix;
        u.uColor.value[i].set(z.color);
      }
    }
  }, [zoneMaterials, fit, outfit, calibration, girths, scale]);

  // Da vật lý (một bản cho mỗi người mẫu); giữ vật liệu gốc của file để tạo lại khi cần
  const skinMaterial = useMemo(() => {
    let base = null;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      if (!obj.userData.fileMaterial) obj.userData.fileMaterial = obj.material;
      if (!base && obj.userData.fileMaterial?.name === 'Skin') base = obj.userData.fileMaterial;
    });
    return base ? makeSkinMaterial(base) : null;
  }, [scene]);
  useEffect(() => () => skinMaterial?.dispose(), [skinMaterial]);

  // Vặn các núm (morph target) theo số đo; mọi vật thể có núm cùng tên (thân + đồ lót) đổi cùng lúc
  useLayoutEffect(() => {
    const materials = zoneMaterials ?? MATERIALS;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const part = partOf(obj);
      const material = part ? materials[part] : null;
      if (material) obj.material = material;
      else if (skinMaterial && obj.userData.fileMaterial?.name === 'Skin') obj.material = skinMaterial;
      if (!obj.morphTargetDictionary) return;
      for (const [name, value] of Object.entries(weights)) {
        const i = obj.morphTargetDictionary[name];
        if (i !== undefined) obj.morphTargetInfluences[i] = value;
      }
    });
  }, [scene, weights, zoneMaterials, MATERIALS, skinMaterial]);

  const wearList = Array.isArray(wear) ? wear : wear ? [wear] : [];
  const coveredKey = [...new Set(wearList.map((w) => w.slot).filter(Boolean))].sort().join(',');
  useLayoutEffect(() => {
    const covered = new Set(coveredKey ? coveredKey.split(',') : []);
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      const kind = underwearKind(obj);
      if (kind) obj.visible = !kind[1].some((s) => covered.has(s));
    });
  }, [scene, coveredKey]);

  return (
    <group scale={scale}>
      <primitive object={scene} />
      {/* Mỗi món một Suspense riêng: món đang tải thì người mẫu và các món khác vẫn hiện */}
      {wearList.map((w) => (
        <Suspense key={w.item.id} fallback={null}>
          <Garment item={w.item} color={w.color} size={w.size} morphs={w.morphs} weights={weights} body={body} bodyRoot={scene} />
        </Suspense>
      ))}
      {fit && <FitLabels calibration={calibration} girths={girths} fit={fit} />}
    </group>
  );
}

/**
 * Bảng đo hiệu năng (CHỈ môi trường development - import.meta.env.DEV; bản build production không có):
 * FPS, draw calls, tam giác, số geometry / texture và ước lượng bộ nhớ texture. Ghi thẳng vào thẻ DOM, không render lại React.
 */
function PerfStats({ target }) {
  const { gl, scene } = useThree();
  const acc = useRef({ frames: 0, t: performance.now(), texT: 0, texMB: 0, calls: 0, triangles: 0 });
  // Tự xóa số liệu: three.js mặc định xóa sau mỗi lượt vẽ (bóng đổ ContactShadows cũng là một lượt) -> cộng cả khung hình
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame(() => {
    const a = acc.current;
    a.frames++;
    // Số liệu của khung hình trước (mọi lượt vẽ), rồi xóa để đếm khung hình này
    a.calls = gl.info.render.calls;
    a.triangles = gl.info.render.triangles;
    gl.info.reset();
    const now = performance.now();
    if (now - a.t < 500) return;
    // Bộ nhớ texture (ước lượng: rộng × cao × 4 byte × 1,33 mipmap) - đếm lại mỗi 2 giây
    if (now - a.texT > 2000) {
      const seen = new Set();
      let bytes = 0;
      scene.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const v of Object.values(m)) {
            if (v?.isTexture && !seen.has(v) && v.image?.width) {
              seen.add(v);
              bytes += v.image.width * v.image.height * 4 * 1.33;
            }
          }
        }
      });
      a.texMB = bytes / 1048576;
      a.texT = now;
    }
    const { calls, triangles } = a;
    const { geometries, textures } = gl.info.memory;
    if (target.current) {
      target.current.textContent =
        `${((a.frames * 1000) / (now - a.t)).toFixed(0)} FPS · ${calls} draw calls · ${(triangles / 1000).toFixed(1)}k tam giác` +
        ` · ${geometries} geo · ${textures} tex ≈ ${a.texMB.toFixed(1)} MB`;
    }
    a.frames = 0;
    a.t = now;
  });
  return null;
}

// "Đặt lại góc nhìn": mỗi lần token đổi, đưa camera về vị trí ban đầu (OrbitControls.reset)
function ViewReset({ token }) {
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    if (token) controls?.reset();
  }, [token, controls]);
  return null;
}

// Máy không hỗ trợ WebGL / lỗi tải file -> hiện thông báo thay vì làm trắng cả trang
class ViewerBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Notice text="Không hiển thị được hình 3D trên trình duyệt này." /> : this.props.children;
  }
}

function Notice({ text }) {
  return (
    <div
      style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#6B7280', fontSize: 14, padding: 16, textAlign: 'center' }}
    >
      {text}
    </div>
  );
}

/**
 * Hình người 3D theo số đo: kéo để xoay, lăn chuột để phóng to.
 * profile: { gender, heightCm, weightKg, chestCm, waistCm, hipCm } (lấy thẳng từ form, chưa cần lưu)
 * fit (không bắt buộc): tô màu vùng ngực / eo / hông theo size đang thử - xem zonesFor, FitLabels.
 * outfit (không bắt buộc): mặc thử cả bộ - tô màu áo / quần / đầm / giày lên người mẫu - xem zonesFor.
 * wear (không bắt buộc): 1 món hoặc mảng nhiều món { slot, item: { id, url, fabric, color }, color, size, morphs } - xem Garment.
 *   slot (TOP | OUTER | DRESS | BOTTOM | SHOES): đồ lót bên dưới ô đang mặc được ẩn (xem UNDERWEAR).
 *   morphs = { Size_up, Size_down } của size biến thể (mô hình sản phẩm); không có thì lấy theo size áo mẫu.
 * autoRotate (không bắt buộc): tự xoay chậm quanh người mẫu (Phòng thử đồ).
 * pose (không bắt buộc): tên animation trong file người mẫu (Idle, Walk, Turn, Fashion_Pose...); null = đứng tư thế gốc.
 * viewResetKey (không bắt buộc): đổi giá trị (vd tăng số) để đưa góc nhìn về ban đầu.
 */
export default function AvatarViewer({ profile, fit, outfit, wear, pose = null, autoRotate = false, viewResetKey = 0 }) {
  const url = MODELS[profile.gender];
  const [calibration, setCalibration] = useState(null);
  const statsRef = useRef(null);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    fetch(`${url}.json`)
      .then((r) => r.json())
      .then((c) => alive && setCalibration(c))
      .catch(() => alive && setCalibration(false));
    return () => {
      alive = false;
    };
  }, [url]);

  if (!profile.gender) return <Notice text="Chọn giới tính để xem hình dáng." />;
  if (calibration === false) return <Notice text="Không tải được dữ liệu hình 3D." />;
  if (!calibration) return <Notice text="Đang tải…" />;

  // Camera nhìn vào khoảng ngực theo chiều cao khách
  const h = (Number(profile.heightCm) || calibration.heightCm) / 100;
  return (
    <ViewerBoundary>
      {/* Khung tương đối: bảng đo hiệu năng (dev) nằm góc dưới phải của khung 3D */}
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <Canvas
          shadows
          camera={{ position: [0, h * 0.6, 3.2], fov: 35 }}
          dpr={[1, 2]}
          gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, outputColorSpace: SRGBColorSpace }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = EXPOSURE;
            gl.outputColorSpace = SRGBColorSpace;
          }}
        >
          {/* Ánh sáng môi trường HDRI (tải riêng, không chặn người mẫu) + bộ đèn studio 3 điểm dịu:
            đèn chính ấm có bóng, đèn phụ bên trái làm sáng vùng khuất, đèn viền phía sau tách người khỏi nền */}
          <Suspense fallback={null}>
            <Environment files={HDRI_URL} environmentIntensity={ENV_INTENSITY} />
          </Suspense>
          <hemisphereLight args={['#ffffff', '#cfc6ba', 0.35]} />
          <directionalLight
            position={[2.2, 4, 3]}
            intensity={1.25}
            color="#fff6ec"
            castShadow
            shadow-mapSize={[1024, 1024]}
            shadow-bias={-0.0004}
            shadow-normalBias={0.02}
          />
          <directionalLight position={[-3, 2.2, 1.5]} intensity={0.35} color="#eef2ff" />
          <directionalLight position={[0, 3, -3.5]} intensity={0.55} />
          <Suspense fallback={null}>
            <Mannequin url={url} profile={profile} calibration={calibration} fit={fit} outfit={outfit} wear={wear} pose={pose} />
          </Suspense>
          <ContactShadows position={[0, 0, 0]} opacity={0.28} scale={3} blur={2.8} far={1.2} />
          {import.meta.env.DEV && <PerfStats target={statsRef} />}
          <OrbitControls
            makeDefault
            target={[0, h * 0.55, 0]}
            enablePan={false}
            minDistance={1.2}
            maxDistance={5}
            maxPolarAngle={Math.PI / 1.9}
            autoRotate={autoRotate}
            autoRotateSpeed={1.2}
          />
          <ViewReset token={viewResetKey} />
        </Canvas>
        {import.meta.env.DEV && (
          <div
            ref={statsRef}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              zIndex: 3,
              pointerEvents: 'none',
              background: 'rgba(17,17,17,0.72)',
              color: '#fff',
              font: '11px/1.4 monospace',
              padding: '3px 7px',
              borderRadius: 6
            }}
          />
        )}
      </div>
    </ViewerBoundary>
  );
}

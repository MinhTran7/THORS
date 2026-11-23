import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Color, MeshStandardMaterial } from 'three';
import { bodyMorph } from './bodyMorph';

// Người mẫu theo giới tính: file .glb + .json số đo.
// Nữ: người mẫu tay buông (nguoimau.glb, núm Bust/Waist/Hips_up/down); nam: người mẫu MPFB cũ.
const MODELS = { FEMALE: '/models/avatar-female', MALE: '/models/avatar-male' };

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

// Bộ phận của một mảnh trong .glb: theo tên vật thể (người mẫu MPFB: Human / underwear) hoặc theo tên
// vật liệu gốc (người mẫu nữ mới: MannequinGray = da, UnderwearGray = đồ lót). Tóc, lông mày, mắt: giữ màu gốc.
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

function Mannequin({ url, profile, calibration, fit, outfit }) {
  const MATERIALS = MATERIALS_BY_GENDER[profile.gender] ?? MATERIALS_BY_GENDER.FEMALE;
  // useGLTF(đường dẫn, draco, meshopt): file được nén bằng meshopt (three.js giải nén sẵn, không cần CDN)
  const { scene } = useGLTF(`${url}.glb`, false, true);
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

  // Vặn các núm (morph target) theo số đo; mọi vật thể có núm cùng tên (thân + đồ lót) đổi cùng lúc
  useLayoutEffect(() => {
    const materials = zoneMaterials ?? MATERIALS;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      const part = partOf(obj);
      const material = part ? materials[part] : null;
      if (material) obj.material = material;
      if (!obj.morphTargetDictionary) return;
      for (const [name, value] of Object.entries(weights)) {
        const i = obj.morphTargetDictionary[name];
        if (i !== undefined) obj.morphTargetInfluences[i] = value;
      }
    });
  }, [scene, weights, zoneMaterials, MATERIALS]);

  return (
    <group scale={scale}>
      <primitive object={scene} />
      {fit && <FitLabels calibration={calibration} girths={girths} fit={fit} />}
    </group>
  );
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
 */
export default function AvatarViewer({ profile, fit, outfit }) {
  const url = MODELS[profile.gender];
  const [calibration, setCalibration] = useState(null);

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
      <Canvas shadows camera={{ position: [0, h * 0.6, 3.2], fov: 35 }} dpr={[1, 2]}>
        <hemisphereLight args={['#ffffff', '#d8d2c8', 1.1]} />
        <directionalLight position={[2, 4, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} />
        <Suspense fallback={null}>
          <Mannequin url={url} profile={profile} calibration={calibration} fit={fit} outfit={outfit} />
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={3} blur={2.4} far={1} />
        <OrbitControls target={[0, h * 0.55, 0]} enablePan={false} minDistance={1.2} maxDistance={5} maxPolarAngle={Math.PI / 1.9} />
      </Canvas>
    </ViewerBoundary>
  );
}

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useGLTF } from '@react-three/drei';
import { Color, MeshStandardMaterial } from 'three';
import { bodyMorph } from './bodyMorph';

// Người mẫu theo giới tính: file .glb + .json số đo (tạo bằng scripts/avatar-optimize). Nam: làm sau.
const MODELS = { FEMALE: '/models/avatar-female' };

// Màu do code quyết định (không phụ thuộc màu đặt trong Blender): ma-nơ-canh xám sứ, đồ lót xám than
const MATERIALS = {
  Human: new MeshStandardMaterial({ color: '#E6E2DC', roughness: 0.62 }),
  underwear: new MeshStandardMaterial({ color: '#2B2B2E', roughness: 0.85 })
};

// Thứ tự 3 vùng tô màu trong shader + nửa chiều cao mỗi vùng (mét, theo cỡ người mẫu)
const ZONES = [
  { name: 'bust', halfHeight: 0.07 },
  { name: 'waist', halfHeight: 0.055 },
  { name: 'hips', halfHeight: 0.085 }
];

/**
 * Vật liệu "tô màu độ vừa": bản sao vật liệu gốc + đoạn shader phủ màu lên 3 vùng ngực / eo / hông.
 * Mỗi điểm trên thân lấy toạ độ (sau khi vặn núm số đo); nằm trong dải độ cao của vùng và trong bề ngang thân
 * (không lan ra tay) thì pha màu của vùng, mép vùng chuyển mềm (smoothstep).
 * Giá trị từng vùng nằm trong uniforms (đổi size chỉ đổi số, không phải dựng lại shader).
 */
function makeFitMaterial(base) {
  const material = base.clone();
  const uniforms = {
    uZoneY: { value: [0, 0, 0] },
    uZoneH: { value: [0, 0, 0] },
    uZoneX: { value: [0, 0, 0] },
    uZoneHalfX: { value: [0, 0, 0] },
    uZoneOn: { value: [0, 0, 0] },
    uZoneColor: { value: [new Color(), new Color(), new Color()] }
  };
  material.userData.fitUniforms = uniforms;
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
        uniform float uZoneY[3];
        uniform float uZoneH[3];
        uniform float uZoneX[3];
        uniform float uZoneHalfX[3];
        uniform float uZoneOn[3];
        uniform vec3 uZoneColor[3];`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        for (int i = 0; i < 3; i++) {
          if (uZoneOn[i] < 0.5) continue;
          float wy = 1.0 - smoothstep(uZoneH[i] * 0.6, uZoneH[i], abs(vFitPos.y - uZoneY[i]));
          float wx = 1.0 - smoothstep(uZoneHalfX[i], uZoneHalfX[i] * 1.12, abs(vFitPos.x - uZoneX[i]));
          diffuseColor.rgb = mix(diffuseColor.rgb, uZoneColor[i], wy * wx * 0.85);
        }`
      );
  };
  material.customProgramCacheKey = () => 'thors-fit-zones';
  return material;
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

function Mannequin({ url, profile, calibration, fit }) {
  // useGLTF(đường dẫn, draco, meshopt): file được nén bằng meshopt (three.js giải nén sẵn, không cần CDN)
  const { scene } = useGLTF(`${url}.glb`, false, true);
  const { scale, weights, girths } = useMemo(() => bodyMorph(profile, calibration), [profile, calibration]);
  const fitting = Boolean(fit);
  // Chế độ thử size: vật liệu riêng có tô màu (không đụng vật liệu dùng chung của trang Số đo)
  const fitMaterials = useMemo(
    () => (fitting ? { Human: makeFitMaterial(MATERIALS.Human), underwear: makeFitMaterial(MATERIALS.underwear) } : null),
    [fitting]
  );

  // Cập nhật màu / vị trí 3 vùng theo size đang thử. Shader so với toạ độ thế giới (mét, đã nhân tỉ lệ chiều cao
  // của khách) nên mọi số theo cỡ người mẫu đều nhân thêm scale.
  useEffect(() => {
    if (!fitMaterials) return;
    const modelHeight = calibration.heightCm / 100;
    for (const material of Object.values(fitMaterials)) {
      const u = material.userData.fitUniforms;
      ZONES.forEach(({ name, halfHeight }, i) => {
        const m = calibration.measures[name];
        const zone = fit[name];
        const on = Boolean(m?.section && zone?.color);
        u.uZoneOn.value[i] = on ? 1 : 0;
        if (!on) return;
        const k = (girths[name] || m.baseCm) / m.baseCm;
        u.uZoneY.value[i] = ((calibration.minY ?? 0) + m.atHeightRatio * modelHeight) * scale;
        u.uZoneH.value[i] = halfHeight * scale;
        u.uZoneX.value[i] = m.section.cx * scale;
        u.uZoneHalfX.value[i] = m.section.rx * k * 1.05 * scale;
        u.uZoneColor.value[i].set(zone.color);
      });
    }
  }, [fitMaterials, fit, calibration, girths, scale]);

  // Vặn các núm (morph target) theo số đo; mọi vật thể có núm cùng tên (thân + đồ lót) đổi cùng lúc
  useLayoutEffect(() => {
    const materials = fitMaterials ?? MATERIALS;
    scene.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      const material = materials[obj.name] ?? materials[obj.parent?.name];
      if (material) obj.material = material;
      if (!obj.morphTargetDictionary) return;
      for (const [name, value] of Object.entries(weights)) {
        const i = obj.morphTargetDictionary[name];
        if (i !== undefined) obj.morphTargetInfluences[i] = value;
      }
    });
  }, [scene, weights, fitMaterials]);

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
 * fit (không bắt buộc): tô màu vùng ngực / eo / hông theo size đang thử - xem makeFitMaterial, FitLabels.
 */
export default function AvatarViewer({ profile, fit }) {
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
  if (!url) return <Notice text="Hình 3D cho nam đang được hoàn thiện." />;
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
          <Mannequin url={url} profile={profile} calibration={calibration} fit={fit} />
        </Suspense>
        <ContactShadows position={[0, 0, 0]} opacity={0.35} scale={3} blur={2.4} far={1} />
        <OrbitControls target={[0, h * 0.55, 0]} enablePan={false} minDistance={1.2} maxDistance={5} maxPolarAngle={Math.PI / 1.9} />
      </Canvas>
    </ViewerBoundary>
  );
}

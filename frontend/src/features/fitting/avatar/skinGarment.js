// Gắn quần áo 3D vào khung xương người mẫu ngay trên trình duyệt (không cần làm lại file áo trong Blender).
// Áo được dựng trên chính người mẫu ở tư thế gốc -> mỗi điểm của áo lấy độ bám xương (skinIndex / skinWeight)
// của điểm cơ thể gần nhất, rồi tạo SkinnedMesh dùng chung khung xương với cơ thể: người mẫu đi / tạo dáng thì áo đi theo.
// Áo ôm (sơ mi, áo thun, quần) theo tốt; váy xòe / áo rất rộng có thể méo khi cử động mạnh.
import { BufferAttribute, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Skeleton, SkinnedMesh, Vector3 } from 'three';

/**
 * Tư thế gốc của khung xương = tư thế lưu trong file (không dùng skeleton.pose() của three.js: file nén meshopt
 * cất phép giải nén toạ độ trong tư thế xương, pose() làm mất nó -> người mẫu teo / lệch). captureRest đọc tư thế gốc từ dữ liệu
 * của file (gltf.parser), toRest để đưa xương về tư thế đó.
 */
export function captureRest(skeleton, gltf) {
  // Lấy từ dữ liệu gốc của file (không đọc từ xương đang hiển thị - có thể đã bị animation / code cũ làm lệch)
  const nodes = gltf?.parser?.json?.nodes ?? [];
  const m = new Matrix4();
  for (const b of skeleton.bones) {
    const index = gltf?.parser?.associations?.get(b)?.nodes;
    const node = index !== undefined ? nodes[index] : null;
    if (node?.matrix) {
      const r = { p: new Vector3(), q: new Quaternion(), s: new Vector3() };
      m.fromArray(node.matrix).decompose(r.p, r.q, r.s);
      b.userData.rest = r;
    } else if (node) {
      b.userData.rest = {
        p: new Vector3().fromArray(node.translation ?? [0, 0, 0]),
        q: new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        s: new Vector3().fromArray(node.scale ?? [1, 1, 1])
      };
    } else if (!b.userData.rest) {
      b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() };
    }
  }
}
export function toRest(skeleton) {
  for (const b of skeleton.bones) {
    const r = b.userData.rest;
    if (!r) continue;
    b.position.copy(r.p);
    b.quaternion.copy(r.q);
    b.scale.copy(r.s);
  }
}

/** Thuộc tính 3 thành phần -> Float32 đã nhân ma trận (điểm: matrix4; vector/độ lệch: matrix3). */
function transformed(attr, m4, m3, normalize) {
  const out = new Float32Array(attr.count * 3);
  const v = new Vector3();
  for (let i = 0; i < attr.count; i++) {
    v.fromBufferAttribute(attr, i); // tự giải nén thuộc tính normalized (file nén meshopt / quantization)
    if (m4) v.applyMatrix4(m4);
    else v.applyMatrix3(m3);
    if (normalize) v.normalize();
    v.toArray(out, i * 3);
  }
  return new Float32BufferAttribute(out, 3);
}

/** Lưới không gian các điểm cơ thể để tìm điểm gần nhất nhanh (cơ thể ~13k điểm, áo ~10k điểm). */
function buildGrid(points, cell) {
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < points.length / 3; i++) {
    const k = key(Math.floor(points[i * 3] / cell), Math.floor(points[i * 3 + 1] / cell), Math.floor(points[i * 3 + 2] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return (x, y, z) => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const cz = Math.floor(z / cell);
    // Mở rộng dần vùng tìm tới khi gặp điểm (áo cách da không xa)
    for (let r = 1; r <= 8; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (let dz = -r; dz <= r; dz++) {
            const list = grid.get(key(cx + dx, cy + dy, cz + dz));
            if (!list) continue;
            for (const i of list) {
              const d = (points[i * 3] - x) ** 2 + (points[i * 3 + 1] - y) ** 2 + (points[i * 3 + 2] - z) ** 2;
              if (d < bestD) {
                bestD = d;
                best = i;
              }
            }
          }
      if (best >= 0) return best;
    }
    return 0;
  };
}

/**
 * Tạo bản SkinnedMesh của mọi mảnh trong áo, gắn vào khung xương của bodyMesh (SkinnedMesh cơ thể).
 * bodyRoot: gốc cảnh của người mẫu (áo và người mẫu đặt chung một gốc). Gọi khi cơ thể đang ở tư thế gốc. Trả mảng SkinnedMesh (chưa thêm vào cảnh) - mỗi bản giữ núm co giãn của áo.
 */
export function skinToBody(garmentScene, bodyMesh, bodyRoot) {
  // Tư thế gốc (áo được dựng ở tư thế này); animation đang chạy sẽ đặt lại xương ở khung hình kế tiếp
  toRest(bodyMesh.skeleton);
  bodyRoot.updateMatrixWorld(true);
  garmentScene.updateMatrixWorld(true);
  const relTo = (root, obj) => new Matrix4().copy(root.matrixWorld).invert().multiply(obj.matrixWorld);

  // T: toạ độ trong hình học cơ thể -> toạ độ thế giới đúng như three.js vẽ (skinning ở tư thế gốc).
  // Không dùng thẳng matrixWorld của mesh: file nén meshopt đặt phép giải nén vào ma trận xương (inverse bind).
  const sk = bodyMesh.skeleton;
  const boneMat = new Matrix4().multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]);
  const T = new Matrix4().copy(bodyMesh.matrixWorld).multiply(bodyMesh.bindMatrixInverse).multiply(boneMat).multiply(bodyMesh.bindMatrix);
  const bodyInv = new Matrix4().copy(T).invert();

  // Điểm cơ thể theo toạ độ thế giới (cùng hệ với áo)
  const bp = bodyMesh.geometry.attributes.position;
  const pts = new Float32Array(bp.count * 3);
  const v = new Vector3();
  const lo = new Vector3(Infinity, Infinity, Infinity);
  const hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i)
      .applyMatrix4(T)
      .toArray(pts, i * 3);
    lo.min(v);
    hi.max(v);
  }
  const size = hi.sub(lo);
  const nearest = buildGrid(pts, Math.max(size.x, size.y, size.z) / 60);
  const bodyIndex = bodyMesh.geometry.attributes.skinIndex;
  const bodyWeight = bodyMesh.geometry.attributes.skinWeight;

  const out = [];
  garmentScene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh) return;
    // Đưa hình áo về hệ toạ độ của mesh cơ thể (bỏ phép nén / vị trí node của file áo)
    // Áo đặt cùng gốc với người mẫu: thế giới của áo = gốc người mẫu * vị trí trong file áo
    const garmentWorld = new Matrix4().copy(bodyRoot.matrixWorld).multiply(relTo(garmentScene, mesh));
    const m4 = new Matrix4().multiplyMatrices(bodyInv, garmentWorld);
    const m3 = new Matrix3().setFromMatrix4(m4);
    const nm = new Matrix3().getNormalMatrix(m4);
    const src = mesh.geometry;
    const geom = src.clone();
    geom.setAttribute('position', transformed(src.attributes.position, m4));
    if (src.attributes.normal) geom.setAttribute('normal', transformed(src.attributes.normal, null, nm, true));
    for (const name of Object.keys(src.morphAttributes)) {
      if (name !== 'position' && name !== 'normal') continue;
      geom.morphAttributes[name] = src.morphAttributes[name].map((a) => transformed(a, null, name === 'position' ? m3 : nm));
    }

    // Độ bám xương = của điểm cơ thể gần nhất
    const n = geom.attributes.position.count;
    const idx = new Uint16Array(n * 4);
    const wgt = new Float32Array(n * 4);
    const p = geom.attributes.position;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(T);
      const j = nearest(v.x, v.y, v.z);
      for (let c = 0; c < 4; c++) {
        idx[i * 4 + c] = bodyIndex.getComponent(j, c);
        wgt[i * 4 + c] = bodyWeight.getComponent(j, c);
      }
    }
    geom.setAttribute('skinIndex', new BufferAttribute(idx, 4));
    geom.setAttribute('skinWeight', new BufferAttribute(wgt, 4));

    const sm = new SkinnedMesh(geom, mesh.material);
    sm.name = mesh.name;
    sm.userData.baseMaterial = mesh.userData.baseMaterial ?? mesh.material;
    sm.morphTargetDictionary = { ...mesh.morphTargetDictionary };
    sm.morphTargetInfluences = [...(mesh.morphTargetInfluences ?? [])];
    sm.position.copy(bodyMesh.position);
    sm.quaternion.copy(bodyMesh.quaternion);
    sm.scale.copy(bodyMesh.scale);
    sm.castShadow = true;
    sm.frustumCulled = false; // khung bao tính theo tư thế gốc; khi cử động có thể ra ngoài
    sm.bind(bodyMesh.skeleton, bodyMesh.bindMatrix);
    out.push(sm);
  });
  return out;
}

/**
 * Áo đã có sẵn xương (xuất từ Blender cùng khung xương Mixamo của người mẫu): nối xương của áo vào xương người mẫu
 * theo tên - người mẫu cử động thì áo cử động theo. Giữ ma trận bind của chính file áo (đúng phép nén của file đó).
 * @returns true nếu áo có xương và đã nối (khi đó đặt nguyên file áo vào cảnh, không cần skinToBody)
 */
export function bindToBodySkeleton(garmentScene, bodyMesh) {
  const byName = new Map(bodyMesh.skeleton.bones.map((b) => [b.name, b]));
  let found = false;
  garmentScene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    found = true;
    if (o.userData.boundTo === bodyMesh.uuid) return;
    const bones = o.skeleton.bones.map((b) => byName.get(b.name) ?? b);
    o.skeleton = new Skeleton(bones, o.skeleton.boneInverses);
    o.frustumCulled = false; // khung bao theo tư thế gốc; khi cử động có thể ra ngoài
    o.userData.boundTo = bodyMesh.uuid;
  });
  return found;
}

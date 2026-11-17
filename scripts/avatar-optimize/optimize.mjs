/**
 * Tối ưu người mẫu 3D xuất từ Blender (MPFB) cho web + tự đo số đo của người mẫu.
 *
 *   node optimize.mjs <vào.glb> <ra.glb>
 *
 * 1. "Nướng" (bake) các núm dáng MPFB ($md-...): cộng sẵn vào hình gốc theo giá trị đang đặt rồi bỏ đi.
 *    Chỉ giữ các núm số đo mà web điều khiển (KEEP). File nhẹ đi nhiều, hình dáng không đổi.
 * 2. Đo vòng ngực / eo / hông (cm) của người mẫu ở trạng thái gốc và khi vặn từng núm = 1,
 *    ghi ra <ra>.json để web đổi "số đo của khách (cm)" -> "giá trị núm" (bodyMorph.js).
 * 3. Nén hình học (meshopt) để tải nhanh. three.js giải nén sẵn, không cần CDN.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';

// Các núm web cần (đúng tên shape key trong Blender). Muốn thêm số đo mới thì thêm vào đây.
const MEASURES = {
  // stopAtArmpit: dò lên tới nách thì dừng (trên nách, tay dính vào thân làm chu vi tăng vọt)
  bust: { keys: ['measure-bust-circ-incr', 'measure-bust-circ-decr'], band: [0.68, 0.78], pick: 'max', stopAtArmpit: true },
  waist: { keys: ['measure-waist-circ-incr', 'measure-waist-circ-decr'], band: [0.58, 0.68], pick: 'min' },
  hips: { keys: ['measure-hips-circ-incr', 'measure-hips-circ-decr'], band: [0.45, 0.56], pick: 'max' }
};
const KEEP = Object.values(MEASURES).flatMap((m) => m.keys);
const BODY_NODE = 'Human'; // vật thể thân người trong Blender (để đo)

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Cách dùng: node optimize.mjs <vào.glb> <ra.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();

// ---------- 1. Bake núm dáng, giữ núm số đo ----------
for (const mesh of root.listMeshes()) {
  const names = mesh.getExtras()?.targetNames ?? [];
  const weights = mesh.getWeights();
  for (const prim of mesh.listPrimitives()) {
    const targets = prim.listTargets();
    for (const attr of ['POSITION', 'NORMAL']) {
      const base = prim.getAttribute(attr);
      if (!base) continue;
      const arr = base.getArray().slice();
      targets.forEach((t, i) => {
        if (KEEP.includes(names[i]) || !weights[i]) return;
        const d = t.getAttribute(attr)?.getArray();
        if (!d) return;
        for (let k = 0; k < arr.length; k++) arr[k] += weights[i] * d[k];
      });
      if (attr === 'NORMAL') {
        for (let k = 0; k < arr.length; k += 3) {
          const len = Math.hypot(arr[k], arr[k + 1], arr[k + 2]) || 1;
          arr[k] /= len;
          arr[k + 1] /= len;
          arr[k + 2] /= len;
        }
      }
      base.setArray(arr);
    }
    targets.forEach((t, i) => {
      if (!KEEP.includes(names[i])) prim.removeTarget(t);
    });
  }
  const kept = names.filter((n) => KEEP.includes(n));
  mesh.setWeights(kept.map(() => 0)).setExtras({ ...mesh.getExtras(), targetNames: kept });
  console.log(`${mesh.getName()}: giữ ${kept.length}/${names.length} núm`);
}

// ---------- 2. Đo người mẫu ----------
const bodyNode = root.listNodes().find((n) => n.getName() === BODY_NODE);
if (!bodyNode) throw new Error(`Không thấy vật thể "${BODY_NODE}" trong file`);
const bodyMesh = bodyNode.getMesh();
const bodyPrim = bodyMesh.listPrimitives()[0];
const bodyNames = bodyMesh.getExtras().targetNames;
const basePos = bodyPrim.getAttribute('POSITION').getArray();
const index = bodyPrim.getIndices().getArray();

const withKey = (name) => {
  const d = bodyPrim.listTargets()[bodyNames.indexOf(name)].getAttribute('POSITION').getArray();
  return basePos.map((v, k) => v + d[k]);
};

/** Chu vi "thước dây" ở độ cao y (glTF: trục Y hướng lên): cắt ngang lưới, lấy cụm thân (bỏ 2 tay), bao lồi. */
function girth(pos, y) {
  return torsoSection(pos, y).length;
}

/**
 * Mặt cắt thân ở độ cao y: chu vi bao lồi + khung bao (để web vẽ vòng "thước dây" ôm đúng thân).
 * Trả { length, cx, cz, rx, rz } (mét): tâm và nửa bề rộng theo trục X (ngang) / Z (trước-sau).
 */
function torsoSection(pos, y) {
  const pts = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e] * 3;
      const b = tri[(e + 1) % 3] * 3;
      const ya = pos[a + 1];
      const yb = pos[b + 1];
      if ((ya - y) * (yb - y) >= 0 || ya === yb) continue;
      const f = (y - ya) / (yb - ya);
      pts.push([pos[a] + f * (pos[b] - pos[a]), pos[a + 2] + f * (pos[b + 2] - pos[a + 2])]);
    }
  }
  if (pts.length < 3) return { length: 0, cx: 0, cz: 0, rx: 0, rz: 0 };
  // Cụm thân: các điểm liên tục theo trục X quanh x = 0, gặp khe hở > 1.5 cm (khoảng trống tới cánh tay) thì dừng
  pts.sort((p, q) => p[0] - q[0]);
  let lo = pts.findIndex((p) => p[0] >= 0);
  if (lo < 0) lo = pts.length - 1;
  let hi = lo;
  while (lo > 0 && pts[lo][0] - pts[lo - 1][0] < 0.015) lo--;
  while (hi < pts.length - 1 && pts[hi + 1][0] - pts[hi][0] < 0.015) hi++;
  const torso = pts.slice(lo, hi + 1);
  const xs = torso.map((p) => p[0]);
  const zs = torso.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  return { length: hullPerimeter(torso), cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2 };
}

function hullPerimeter(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const h = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const hull = [...half(p), ...half(p.slice().reverse())];
  let len = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    len += Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  return len;
}

let minY = Infinity;
let maxY = -Infinity;
for (let k = 1; k < basePos.length; k += 3) {
  minY = Math.min(minY, basePos[k]);
  maxY = Math.max(maxY, basePos[k]);
}
const height = maxY - minY;
const cm = (m) => Math.round(m * 1000) / 10;
const round4 = (v) => Math.round(v * 10000) / 10000;
// minY: chân người mẫu (mét, hệ toạ độ của file .glb) - web đặt vòng đo theo atHeightRatio tính từ đây
const calibration = { heightCm: cm(height), minY: round4(minY), measures: {} };

for (const [name, m] of Object.entries(MEASURES)) {
  // Tìm độ cao đặc trưng trong dải (vd. eo = chỗ nhỏ nhất trong khoảng 58-68% chiều cao)
  // Dò từ dưới lên; chu vi tăng vọt > 8% giữa 2 lần dò = chạm nách (tay dính vào thân) -> dừng
  let best = null;
  let prev = 0;
  for (let r = m.band[0]; r <= m.band[1]; r += 0.002) {
    const y = minY + r * height;
    const g = girth(basePos, y);
    if (m.stopAtArmpit && prev && g > prev * 1.08) break;
    prev = g;
    if (!best || (m.pick === 'max' ? g > best.g : g < best.g)) best = { y, g, r };
  }
  const incr = girth(withKey(m.keys[0]), best.y);
  const decr = girth(withKey(m.keys[1]), best.y);
  const sec = torsoSection(basePos, best.y);
  calibration.measures[name] = {
    atHeightRatio: Math.round(best.r * 1000) / 1000,
    // Mặt cắt thân ở trạng thái gốc (mét): tâm + nửa bề rộng, để vẽ vòng đo trên web
    section: { cx: round4(sec.cx), cz: round4(sec.cz), rx: round4(sec.rx), rz: round4(sec.rz) },
    baseCm: cm(best.g),
    incrCm: cm(incr), // khi núm "-incr" = 1
    decrCm: cm(decr), // khi núm "-decr" = 1
    keys: { incr: m.keys[0], decr: m.keys[1] }
  };
}
console.log(JSON.stringify(calibration, null, 2));

// ---------- 3. Dọn + nén ----------
await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);
fs.writeFileSync(output.replace(/\.glb$/, '.json'), JSON.stringify(calibration, null, 2) + '\n');
console.log(`Đã ghi ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(2)} MB) và file .json số đo`);

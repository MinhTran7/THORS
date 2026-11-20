/**
 * Nén file áo 3D (đã mặc lên người mẫu bằng garment-fit.py) cho web.
 *
 *   node garment.mjs <vào.glb> <ra.glb>
 *
 * Giữ nguyên các núm co giãn (morph target) cùng tên với người mẫu để web vặn áo theo số đo của khách.
 * Nén hình học bằng meshopt như người mẫu (three.js giải nén sẵn).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Cách dùng: node garment.mjs <vào.glb> <ra.glb>');
  process.exit(1);
}

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);

// Tên vật thể cố định để web nhận ra là áo
for (const node of doc.getRoot().listNodes()) {
  if (node.getMesh()) node.setName('garment');
}

await doc.transform(dedup(), weld(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(output, doc);

const mesh = doc.getRoot().listMeshes()[0];
const prim = mesh.listPrimitives()[0];
console.log(
  `Xong: ${output} (${(fs.statSync(output).size / 1024 / 1024).toFixed(2)} MB),`,
  `${prim.getAttribute('POSITION').getCount()} điểm, núm: ${(mesh.getExtras().targetNames ?? []).join(', ')}`
);

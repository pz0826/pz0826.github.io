import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
const base = new URL('../public/scenes/room/', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', base), 'utf8'),
);
let bytes = 0;
for (const [name, expected] of Object.entries(manifest.assets)) {
  const buffer = await readFile(new URL(name, base));
  if (
    buffer.byteLength !== expected.bytes ||
    createHash('sha256').update(buffer).digest('hex') !== expected.sha256
  )
    throw new Error(`Asset checksum mismatch: ${name}`);
  bytes += buffer.byteLength;
}
const geometry = gunzipSync(await readFile(new URL(manifest.geometry, base)));
if (geometry.byteLength !== manifest.count * 32)
  throw new Error('Geometry count mismatch');
for (let level = 1; level <= 5; level++) {
  for (const [name, width] of [
    [`labels-level-${level}.i32.gz`, 4],
    [`pca-level-${level}.rgb8.gz`, 3],
  ]) {
    if (
      gunzipSync(await readFile(new URL(name, base))).byteLength !==
      manifest.count * width
    )
      throw new Error(`Sidecar count mismatch: ${name}`);
  }
}
const tree = JSON.parse(await readFile(new URL('nodes.json', base), 'utf8'));
const ids = new Set(tree.nodes.map((node) => node.id));
for (const node of tree.nodes) {
  if (
    node.scene_level < 1 ||
    node.scene_level > 5 ||
    (node.parent_id && !ids.has(node.parent_id)) ||
    node.children.some((id) => !ids.has(id))
  )
    throw new Error(`Invalid hierarchy: ${node.id}`);
}
const queries = JSON.parse(
  await readFile(new URL('queries.json', base), 'utf8'),
).queries;
for (const query of queries) {
  if (
    query.terms.length !== query.primary_chain.length ||
    query.cached_results.some(
      (result) =>
        !ids.has(result.final_cluster_id) ||
        result.chain.some(([id]) => !ids.has(id)),
    )
  )
    throw new Error(`Invalid query: ${query.id}`);
}
console.log(
  `Verified ${manifest.count.toLocaleString()} Gaussians, ${ids.size} nodes, ${queries.length} queries; ${(bytes / 1024 ** 2).toFixed(1)} MiB compressed scene assets.`,
);

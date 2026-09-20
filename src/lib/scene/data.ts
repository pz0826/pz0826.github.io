import type {
  SceneData,
  SceneManifest,
  SceneNode,
  SceneQuery,
  Vec3,
} from './types';
export const SCENE_BASE = '/scenes/room/';
async function json<T>(name: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(SCENE_BASE + name, { signal });
  if (!response.ok) throw new Error(`Scene resource unavailable: ${name}`);
  return response.json();
}
export async function loadSceneData(signal: AbortSignal): Promise<SceneData> {
  const [manifest, tree, queries, neighbors, graphMeta] = await Promise.all([
    json<SceneManifest>('manifest.json', signal),
    json<{ nodes: SceneNode[] }>('nodes.json', signal),
    json<{ queries: SceneQuery[] }>('queries.json', signal),
    json<{
      items: {
        node_id: number;
        neighbors: { node_id: number; cosine: number }[];
      }[];
    }>('semantic_neighbors.json', signal),
    json<{ ids: number[]; centers: Vec3[]; stride: number; file: string }>(
      'graph.json',
      signal,
    ),
  ]);
  const graphBits = await new SceneTables(signal, manifest.count).bytes(
    graphMeta.file,
  );
  return {
    graph: {
      ...graphMeta,
      index: new Map(graphMeta.ids.map((id, i) => [id, i])),
      bits: new Uint8Array(graphBits),
    },
    manifest,
    nodes: new Map(tree.nodes.map((node) => [node.id, node])),
    // Presentation copy only; preserve the exported research/video prompts.
    queries: queries.queries.map((query) =>
      query.id === 'room-query-02'
        ? {
            ...query,
            text: 'Find the head of the stuffed toy resting on the sofa.',
          }
        : query,
    ),
    neighbors: new Map(
      neighbors.items.map((item) => [item.node_id, item.neighbors]),
    ),
  };
}
export class SceneTables {
  readonly labels = new Map<number, Int32Array>();
  private pca = new Map<number, Uint8Array>();
  private pending = new Map<string, Promise<ArrayBuffer>>();
  constructor(
    private signal: AbortSignal,
    private count: number,
  ) {}
  async bytes(name: string): Promise<ArrayBuffer> {
    let request = this.pending.get(name);
    if (!request) {
      request = fetch(
        SCENE_BASE + (name.endsWith('.gz') ? name : name + '.gz'),
        { signal: this.signal },
      ).then((response) => {
        if (!response.ok)
          throw new Error(`Scene resource unavailable: ${name}`);
        if (!response.body) throw new Error('Empty scene response');
        // Vite serves .gz with Content-Encoding; static hosts may serve it as a
        // plain binary file. Fetch already decodes HTTP content encodings.
        if (response.headers.get('content-encoding')?.includes('gzip')) {
          return response.arrayBuffer();
        }
        return new Response(
          response.body.pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer();
      });
      this.pending.set(name, request);
    }
    return request;
  }
  async level(level: number, pca = false) {
    await Promise.all([
      this.labels.has(level)
        ? undefined
        : this.bytes(`labels-level-${level}.i32`).then((buffer) => {
            if (buffer.byteLength !== this.count * 4)
              throw new Error('Scene label count mismatch');
            this.labels.set(level, new Int32Array(buffer));
          }),
      !pca || this.pca.has(level)
        ? undefined
        : this.bytes(`pca-level-${level}.rgb8`).then((buffer) => {
            if (buffer.byteLength !== this.count * 3)
              throw new Error('Scene feature count mismatch');
            this.pca.set(level, new Uint8Array(buffer));
          }),
    ]);
    return { labels: this.labels.get(level)!, pca: this.pca.get(level) };
  }
}

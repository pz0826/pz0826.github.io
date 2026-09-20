export type Vec3 = [number, number, number];
export interface SceneCamera {
  position: Vec3;
  wxyz: [number, number, number, number];
  fov_rad: number;
}
export interface SceneNode {
  id: number;
  scene_level: number;
  parent_id: number;
  children: number[];
  center: Vec3;
  radius: number;
  bounds_min: Vec3;
  bounds_max: Vec3;
  entity_count: number;
}
export interface SceneQuery {
  id: string;
  text: string;
  terms: string[];
  featured: boolean;
  camera: SceneCamera;
  cached_results: {
    chain: [number, number][];
    total_score: number;
    final_cluster_id: number;
  }[];
  primary_chain: { node_id: number; scene_level: number; score: number }[];
}
export interface SceneManifest {
  schemaVersion: number;
  count: number;
  levels: number[];
  geometry: string;
  initialCamera: SceneCamera;
}
export interface SceneData {
  manifest: SceneManifest;
  nodes: Map<number, SceneNode>;
  queries: SceneQuery[];
  graph: {
    ids: number[];
    centers: Vec3[];
    index: Map<number, number>;
    stride: number;
    bits: Uint8Array;
  };
  neighbors: Map<number, { node_id: number; cosine: number }[]>;
}
export interface SceneState {
  view: 'human' | 'ai';
  level: number;
  selected: number | null;
  relation: 'none' | 'nearby' | 'similar';
  queryId: string | null;
  step: number;
  playing: boolean;
  complete: boolean;
}
export interface SceneAdapter {
  apply(state: SceneState): Promise<void>;
  moveTo(camera: SceneCamera, animate?: boolean): void;
  cancelMotion(): void;
  home(): void;
  setInteractive(enabled: boolean): void;
  setVisible(visible: boolean): void;
  zoom(factor: number): void;
  dispose(): void;
}

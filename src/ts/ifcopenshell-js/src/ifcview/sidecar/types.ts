export const SIDECAR_MAGIC = 0x49465657; // "IFVW"
export const SIDECAR_ENDIAN = 0x01020304;
export const SIDECAR_VERTEX_STRIDE = 12;
export const MESH_INFO_BYTE_LENGTH = 56;
export const PACKED_ELEMENT_BYTE_LENGTH = 12;

export { VIEWER_SIDECAR_FORMAT_VERSION } from "./viewer-sidecar-format.generated.js";

export const SIDECAR_CHUNK_BYTE_LENGTH = 56;
export const INSTANCE_CPU_BYTE_LENGTH = 232;

export interface SidecarHeader {
  magic: number;
  version: number;
  endian: number;
}

export interface SidecarMeshInfo {
  vboByteOffset: number;
  vertexCount: number;
  eboByteOffset: number;
  indexCount: number;
  localAabbMin: [number, number, number];
  localAabbMax: [number, number, number];
  firstInstance: number;
  instanceCount: number;
  lod1EboByteOffset: number;
  lod1IndexCount: number;
}

export interface SidecarInstanceCpu {
  meshId: number;
  objectId: number;
  colorOverrideRgba8: number;
  modelId: number;
  /** Column-major 4×4 — use `transform` for rendering. */
  placementTransformation: Float64Array | Float32Array;
  transform: Float32Array;
  worldAabbMin: [number, number, number];
  worldAabbMax: [number, number, number];
}

export interface SidecarElementInfo {
  objectId: number;
  modelId: number;
  ifcId: number;
}

/** Element metadata keyed by IFC express id during sidecar ingest. */
export interface SidecarElementMetadata {
  id: number;
  type: string;
  name: string;
  guid: string;
}

/** Nested spatial tree for the project panel (Project → Site → Storey → products). */
export interface SpatialNode {
  id: number;
  type: string;
  name: string;
  guid: string;
  children: SpatialNode[];
  /** Spatial-structure container vs contained product. */
  isStructure?: boolean;
}

export interface SidecarGeoref {
  hasCoordinateOperation: boolean;
  coordinateOperationMeters: Float64Array;
  projectLengthToMeters: number;
  mapUnitToMeters: number;
}

/** Chunk TOC entry before compressed blob offsets are filled. */
export interface SidecarChunkToc {
  firstMesh: number;
  meshCount: number;
  vCompOff?: bigint;
  vCompSize?: bigint;
  vRawSize?: bigint;
  iCompOff?: bigint;
  iCompSize?: bigint;
  iRawSize?: bigint;
}

export interface SidecarData {
  header: SidecarHeader;
  vertices: Uint8Array;
  indices: Uint32Array;
  meshes: SidecarMeshInfo[];
  instances: SidecarInstanceCpu[];
  georef: SidecarGeoref;
  elements: SidecarElementInfo[];
  stringTable: string;
  chunks?: SidecarChunkToc[];
}

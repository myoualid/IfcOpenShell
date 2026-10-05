import type { Mesh } from '../../geom/mesh.js';

import { materialKeyFromRgba, meshFingerprint } from '../geometry.js';
import {
  SIDECAR_ENDIAN,
  SIDECAR_MAGIC,
  VIEWER_SIDECAR_FORMAT_VERSION,
  type SidecarData,
  type SidecarElementInfo,
  type SidecarElementMetadata,
  type SidecarGeoref,
  type SidecarInstanceCpu,
  type SidecarMeshInfo
} from "./types.js";
import { quantizeSidecarVertex, writeColorFloatSlot } from "./vertex.js";

const DEFAULT_MESH_COLOR: [number, number, number, number] = [0.72, 0.72, 0.74, 1];
const HIDDEN_ELEMENT_TYPES = new Set(["IfcAnnotation", "IfcOpeningElement"]);

interface PendingInstance {
  elementId: number;
  transform: Float32Array;
}

interface UniqueMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Int32Array;
  /** Per-vertex RGBA when a mesh has multiple face materials; otherwise null. */
  vertexColors: Float32Array | null;
  /** Uniform mesh color when all faces share one resolved material. */
  rgba: [number, number, number, number];
  instances: PendingInstance[];
}

export interface BuildSidecarOptions {
  modelId?: number;
}

/**
 * Incremental mesh-group collector for IFCAPI {@link Mesh} tessellation.
 * Call {@link appendMesh} per iterator result, then {@link build}.
 */
export class SidecarMeshAccumulator {
  private readonly meshGroups = new Map<string, UniqueMesh>();

  /** Append one IFCAPI {@link Mesh} from {@link GeomIterator}. */
  appendMesh(
    mesh: Mesh,
    elementMetadata: ReadonlyMap<number, SidecarElementMetadata> = new Map()
  ): void {
    collectMeshFromIfcApi(mesh, elementMetadata, this.meshGroups);
  }

  get uniqueMeshCount(): number {
    return this.meshGroups.size;
  }

  build(
    elementMetadata: ReadonlyMap<number, SidecarElementMetadata>,
    options: BuildSidecarOptions = {}
  ): SidecarData {
    return finalizeMeshGroups(this.meshGroups, elementMetadata, options);
  }
}

/** Build in-memory sidecar data from IFCAPI meshes. */
export function buildSidecarFromMeshes(
  meshes: readonly Mesh[],
  elementMetadata: ReadonlyMap<number, SidecarElementMetadata>,
  options: BuildSidecarOptions = {}
): SidecarData {
  const accumulator = new SidecarMeshAccumulator();
  for (const mesh of meshes) {
    accumulator.appendMesh(mesh, elementMetadata);
  }
  return accumulator.build(elementMetadata, options);
}

function finalizeMeshGroups(
  meshGroups: Map<string, UniqueMesh>,
  elementMetadata: ReadonlyMap<number, SidecarElementMetadata>,
  options: BuildSidecarOptions
): SidecarData {
  const modelId = options.modelId ?? 1;
  const meshes: SidecarMeshInfo[] = [];
  const instances: SidecarInstanceCpu[] = [];
  const elements: SidecarElementInfo[] = [];

  let totalVertexCount = 0;
  let totalIndexCount = 0;
  for (const mesh of meshGroups.values()) {
    const vertexCount = mesh.positions.length / 3;
    const indexCount = mesh.indices.length;
    if (vertexCount === 0 || indexCount === 0) {
      continue;
    }
    totalVertexCount += vertexCount;
    totalIndexCount += indexCount;
  }

  const vertices = new Uint8Array(totalVertexCount * 12);
  const indices = new Uint32Array(totalIndexCount);
  const vertexScratch = new Uint8Array(12);

  let vboByteOffset = 0;
  let eboByteOffset = 0;
  let vertexWrite = 0;
  let indexWrite = 0;
  let objectId = 1;
  let meshId = 0;

  for (const mesh of meshGroups.values()) {
    const vertexCount = mesh.positions.length / 3;
    const indexCount = mesh.indices.length;
    if (vertexCount === 0 || indexCount === 0) {
      continue;
    }

    const localAabb = tightAabb(mesh.positions);
    const extentRecip = extentReciprocal(localAabb.min, localAabb.max);
    const meshInstanceStart = instances.length;

    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
      const pos: [number, number, number] = [
        mesh.positions[vertexIndex * 3]!,
        mesh.positions[vertexIndex * 3 + 1]!,
        mesh.positions[vertexIndex * 3 + 2]!
      ];
      const normal: [number, number, number] =
        mesh.normals.length === mesh.positions.length
          ? [
              mesh.normals[vertexIndex * 3]!,
              mesh.normals[vertexIndex * 3 + 1]!,
              mesh.normals[vertexIndex * 3 + 2]!
            ]
          : [0, 0, 1];

      const rgba: [number, number, number, number] = mesh.vertexColors
        ? [
            mesh.vertexColors[vertexIndex * 4]!,
            mesh.vertexColors[vertexIndex * 4 + 1]!,
            mesh.vertexColors[vertexIndex * 4 + 2]!,
            mesh.vertexColors[vertexIndex * 4 + 3]!
          ]
        : mesh.rgba;

      quantizeSidecarVertex(pos, normal, rgba, localAabb.min, extentRecip, vertexScratch, 0);
      vertices.set(vertexScratch, vertexWrite);
      vertexWrite += 12;
    }

    for (let i = 0; i < indexCount; i += 1) {
      indices[indexWrite + i] = mesh.indices[i]!;
    }
    indexWrite += indexCount;

    meshes.push({
      vboByteOffset,
      vertexCount,
      eboByteOffset,
      indexCount,
      localAabbMin: localAabb.min,
      localAabbMax: localAabb.max,
      firstInstance: meshInstanceStart,
      instanceCount: 0,
      lod1EboByteOffset: 0,
      lod1IndexCount: 0
    });

    for (const pending of mesh.instances) {
      const metadata = elementMetadata.get(pending.elementId);
      const elementType = metadata?.type ?? "";
      if (HIDDEN_ELEMENT_TYPES.has(elementType)) {
        continue;
      }

      const placement = new Float64Array(16);
      const transform = new Float32Array(16);
      for (let i = 0; i < 16; i += 1) {
        const value = pending.transform[i]!;
        placement[i] = value;
        transform[i] = value;
      }

      const worldAabb = worldAabbFromLocal(localAabb.min, localAabb.max, transform);
      instances.push({
        meshId,
        objectId,
        colorOverrideRgba8: 0,
        modelId,
        placementTransformation: placement,
        transform,
        worldAabbMin: worldAabb.min,
        worldAabbMax: worldAabb.max
      });

      elements.push({
        objectId,
        modelId,
        ifcId: pending.elementId
      });

      objectId += 1;
    }

    meshes[meshId]!.instanceCount = instances.length - meshInstanceStart;
    vboByteOffset += vertexCount * 12;
    eboByteOffset += indexCount * 4;
    meshId += 1;
  }

  return {
    header: {
      magic: SIDECAR_MAGIC,
      version: VIEWER_SIDECAR_FORMAT_VERSION,
      endian: SIDECAR_ENDIAN
    },
    vertices,
    indices,
    meshes,
    instances,
    georef: defaultGeoref(),
    elements,
    stringTable: ""
  };
}

function collectMeshFromIfcApi(
  mesh: Mesh,
  elementMetadata: ReadonlyMap<number, SidecarElementMetadata>,
  meshGroups: Map<string, UniqueMesh>
): void {
  const metadata = elementMetadata.get(mesh.id);
  const elementType = metadata?.type ?? mesh.type;
  if (HIDDEN_ELEMENT_TYPES.has(elementType)) {
    return;
  }

  const baked = bakeIfcApiMesh(mesh);
  if (!baked.positions.length || !baked.indices.length) {
    return;
  }

  const fingerprint = meshFingerprint(baked.positions, baked.indices, baked.materialKey);
  const transform = new Float32Array(mesh.transform);

  const existing = meshGroups.get(fingerprint);
  if (existing) {
    existing.instances.push({
      elementId: mesh.id,
      transform
    });
    return;
  }

  meshGroups.set(fingerprint, {
    positions: baked.positions,
    normals: baked.normals,
    indices: baked.indices,
    vertexColors: baked.vertexColors,
    rgba: baked.rgba,
    instances: [
      {
        elementId: mesh.id,
        transform
      }
    ]
  });
}

function bakeIfcApiMesh(mesh: Mesh): BakedMeshGeometry {
  const srcPositions =
    mesh.vertices instanceof Float32Array ? mesh.vertices : new Float32Array(mesh.vertices);
  const srcNormals =
    mesh.normals == null
      ? new Float32Array(0)
      : mesh.normals instanceof Float32Array
        ? mesh.normals
        : new Float32Array(mesh.normals);
  const srcIndices = new Int32Array(mesh.faces);
  const numTris = mesh.faces.length / 3;

  const rgbaForFace = (faceIndex: number): [number, number, number, number] => {
    const matId = faceIndex < mesh.materialIds.length ? mesh.materialIds[faceIndex]! : 0;
    const base = matId * 4;
    let rgba: [number, number, number, number] = [...DEFAULT_MESH_COLOR];
    if (base + 3 < mesh.colors.length) {
      rgba = [
        mesh.colors[base]!,
        mesh.colors[base + 1]!,
        mesh.colors[base + 2]!,
        mesh.colors[base + 3]!
      ];
    }
    return sanitizeMaterialRgba(rgba);
  };

  if (numTris === 0) {
    const rgba = rgbaForFace(0);
    return {
      positions: new Float32Array(srcPositions),
      normals: new Float32Array(srcNormals),
      indices: new Int32Array(srcIndices),
      vertexColors: null,
      rgba,
      materialKey: materialKeyFromRgba(rgba)
    };
  }

  const firstRgba = rgbaForFace(0);
  let singleMaterial = true;
  const materialKeyParts: string[] = [materialKeyFromRgba(firstRgba)];
  for (let faceIndex = 1; faceIndex < numTris; faceIndex += 1) {
    const rgba = rgbaForFace(faceIndex);
    materialKeyParts.push(materialKeyFromRgba(rgba));
    if (!rgbaEqual(rgba, firstRgba)) {
      singleMaterial = false;
    }
  }

  if (singleMaterial) {
    return {
      positions: new Float32Array(srcPositions),
      normals: new Float32Array(srcNormals),
      indices: new Int32Array(srcIndices),
      vertexColors: null,
      rgba: firstRgba,
      materialKey: materialKeyParts.join("|")
    };
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const vertexColors: number[] = [];
  const outIndices: number[] = [];
  const remap = new Map<string, number>();

  const emitVertex = (
    origIdx: number,
    matId: number,
    rgba: readonly [number, number, number, number]
  ): number => {
    const key = `${origIdx}:${matId}`;
    const existing = remap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const newIdx = positions.length / 3;
    positions.push(
      srcPositions[origIdx * 3]!,
      srcPositions[origIdx * 3 + 1]!,
      srcPositions[origIdx * 3 + 2]!
    );

    if (srcNormals.length === srcPositions.length) {
      normals.push(
        srcNormals[origIdx * 3]!,
        srcNormals[origIdx * 3 + 1]!,
        srcNormals[origIdx * 3 + 2]!
      );
    } else {
      normals.push(0, 0, 1);
    }

    vertexColors.push(rgba[0], rgba[1], rgba[2], rgba[3]);
    remap.set(key, newIdx);
    return newIdx;
  };

  for (let tri = 0; tri < numTris; tri += 1) {
    const matId = tri < mesh.materialIds.length ? mesh.materialIds[tri]! : 0;
    const rgba = rgbaForFace(tri);
    outIndices.push(
      emitVertex(srcIndices[tri * 3]!, matId, rgba),
      emitVertex(srcIndices[tri * 3 + 1]!, matId, rgba),
      emitVertex(srcIndices[tri * 3 + 2]!, matId, rgba)
    );
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Int32Array(outIndices),
    vertexColors: new Float32Array(vertexColors),
    rgba: firstRgba,
    materialKey: materialKeyParts.join("|")
  };
}

interface BakedMeshGeometry {
  positions: Float32Array;
  normals: Float32Array;
  indices: Int32Array;
  vertexColors: Float32Array | null;
  rgba: [number, number, number, number];
  materialKey: string;
}

/** Pass tessellation RGBA through unchanged (matches desktop GeometryStreamer). */
function sanitizeMaterialRgba(
  rgba: [number, number, number, number]
): [number, number, number, number] {
  const clamp = (value: number): number =>
    Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const alpha = rgba[3];
  const a = Number.isFinite(alpha) && alpha > 0 ? clamp(alpha) : 1;
  return [clamp(rgba[0]!), clamp(rgba[1]!), clamp(rgba[2]!), a];
}

function rgbaEqual(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): boolean {
  return (
    Math.abs(a[0]! - b[0]!) < 1e-4 &&
    Math.abs(a[1]! - b[1]!) < 1e-4 &&
    Math.abs(a[2]! - b[2]!) < 1e-4 &&
    Math.abs(a[3]! - b[3]!) < 1e-4
  );
}

function defaultGeoref(): SidecarGeoref {
  const coordinateOperationMeters = new Float64Array(16);
  coordinateOperationMeters[0] = 1;
  coordinateOperationMeters[5] = 1;
  coordinateOperationMeters[10] = 1;
  coordinateOperationMeters[15] = 1;
  return {
    hasCoordinateOperation: false,
    coordinateOperationMeters,
    projectLengthToMeters: 1,
    mapUnitToMeters: 1
  };
}

function tightAabb(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]!;
      if (value < min[axis]!) {
        min[axis] = value;
      }
      if (value > max[axis]!) {
        max[axis] = value;
      }
    }
  }

  for (let axis = 0; axis < 3; axis += 1) {
    if (!Number.isFinite(min[axis]!) || !Number.isFinite(max[axis]!)) {
      min[axis] = 0;
      max[axis] = 0;
    } else if (min[axis] === max[axis]) {
      max[axis] = min[axis]! + 1e-6;
    }
  }

  return { min, max };
}

function extentReciprocal(
  min: readonly [number, number, number],
  max: readonly [number, number, number]
): [number, number, number] {
  return [
    max[0]! - min[0]! > 0 ? 1 / (max[0]! - min[0]!) : 0,
    max[1]! - min[1]! > 0 ? 1 / (max[1]! - min[1]!) : 0,
    max[2]! - min[2]! > 0 ? 1 / (max[2]! - min[2]!) : 0
  ];
}

function worldAabbFromLocal(
  localMin: readonly [number, number, number],
  localMax: readonly [number, number, number],
  transform: Float32Array
): { min: [number, number, number]; max: [number, number, number] } {
  const corners: [number, number, number][] = [];
  for (const x of [localMin[0]!, localMax[0]!]) {
    for (const y of [localMin[1]!, localMax[1]!]) {
      for (const z of [localMin[2]!, localMax[2]!]) {
        corners.push(transformPoint(transform, x, y, z));
      }
    }
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const corner of corners) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (corner[axis]! < min[axis]!) {
        min[axis] = corner[axis]!;
      }
      if (corner[axis]! > max[axis]!) {
        max[axis] = corner[axis]!;
      }
    }
  }
  return { min, max };
}

function transformPoint(matrix: Float32Array, x: number, y: number, z: number): [number, number, number] {
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  const invW = w !== 0 ? 1 / w : 1;
  return [
    (matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) * invW,
    (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) * invW,
    (matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!) * invW
  ];
}

export interface MeshUploadInstance {
  objectId: number;
  elementId: number;
  transform: Float64Array;
  colorOverrideRgba8: number;
}

export interface MeshUploadBundle {
  localMeshId: number;
  vertices: Float32Array;
  indices: Uint32Array;
  instances: MeshUploadInstance[];
}

export type MeshUploadDelta =
  | {
      kind: "mesh";
      localMeshId: number;
      vertices: Float32Array;
      indices: Uint32Array;
      instance: MeshUploadInstance;
    }
  | {
      kind: "instance";
      localMeshId: number;
      instance: MeshUploadInstance;
    };

interface StreamingUploadState {
  fingerprintToLocalMeshId: Map<string, number>;
  nextLocalMeshId: number;
  nextObjectId: number;
}

function createStreamingUploadState(): StreamingUploadState {
  return {
    fingerprintToLocalMeshId: new Map(),
    nextLocalMeshId: 0,
    nextObjectId: 1
  };
}

/** Incremental mesh/instance deltas for direct viewer upload during tessellation. */
export class StreamingMeshUploadState {
  private readonly accumulator = new SidecarMeshAccumulator();
  private readonly stream = createStreamingUploadState();

  get uniqueMeshCount(): number {
    return this.accumulator.uniqueMeshCount;
  }

  appendMesh(
    mesh: Mesh,
    elementMetadata: ReadonlyMap<number, SidecarElementMetadata> = new Map()
  ): MeshUploadDelta[] {
    const beforeCount = this.accumulator.uniqueMeshCount;
    const metadata = elementMetadata.get(mesh.id);
    const elementType = metadata?.type ?? mesh.type;
    if (HIDDEN_ELEMENT_TYPES.has(elementType)) {
      return [];
    }

    const baked = bakeIfcApiMesh(mesh);
    if (!baked.positions.length || !baked.indices.length) {
      return [];
    }

    const fingerprint = meshFingerprint(baked.positions, baked.indices, baked.materialKey);
    const transform = new Float32Array(mesh.transform);
    const existingLocalMeshId = this.stream.fingerprintToLocalMeshId.get(fingerprint);
    const instance = buildMeshUploadInstance(
      this.stream.nextObjectId,
      mesh.id,
      transform
    );
    this.stream.nextObjectId += 1;

    this.accumulator.appendMesh(mesh, elementMetadata);

    if (existingLocalMeshId != null) {
      return [{ kind: "instance", localMeshId: existingLocalMeshId, instance }];
    }

    if (this.accumulator.uniqueMeshCount <= beforeCount) {
      return [];
    }

    const localMeshId = this.stream.nextLocalMeshId;
    this.stream.nextLocalMeshId += 1;
    this.stream.fingerprintToLocalMeshId.set(fingerprint, localMeshId);

    return [
      {
        kind: "mesh",
        localMeshId,
        vertices: uniqueMeshToStreamVertices({
          positions: baked.positions,
          normals: baked.normals,
          indices: baked.indices,
          vertexColors: baked.vertexColors,
          rgba: baked.rgba,
          instances: []
        }),
        indices: new Uint32Array(baked.indices),
        instance
      }
    ];
  }

  build(
    elementMetadata: ReadonlyMap<number, SidecarElementMetadata>,
    options: BuildSidecarOptions = {}
  ): SidecarData {
    return this.accumulator.build(elementMetadata, options);
  }
}

function buildMeshUploadInstance(
  objectId: number,
  elementId: number,
  transform: Float32Array
): MeshUploadInstance {
  const placement = new Float64Array(16);
  for (let i = 0; i < 16; i += 1) {
    placement[i] = transform[i]!;
  }
  return {
    objectId,
    elementId,
    transform: placement,
    colorOverrideRgba8: 0
  };
}

function uniqueMeshToStreamVertices(mesh: UniqueMesh): Float32Array {
  const vertexCount = mesh.positions.length / 3;
  const out = new Float32Array(vertexCount * 7);
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    const base = vertexIndex * 7;
    out[base] = mesh.positions[vertexIndex * 3]!;
    out[base + 1] = mesh.positions[vertexIndex * 3 + 1]!;
    out[base + 2] = mesh.positions[vertexIndex * 3 + 2]!;
    const hasNormals = mesh.normals.length === mesh.positions.length;
    out[base + 3] = hasNormals ? mesh.normals[vertexIndex * 3]! : 0;
    out[base + 4] = hasNormals ? mesh.normals[vertexIndex * 3 + 1]! : 0;
    out[base + 5] = hasNormals ? mesh.normals[vertexIndex * 3 + 2]! : 1;
    const rgba: [number, number, number, number] = mesh.vertexColors
      ? [
          mesh.vertexColors[vertexIndex * 4]!,
          mesh.vertexColors[vertexIndex * 4 + 1]!,
          mesh.vertexColors[vertexIndex * 4 + 2]!,
          mesh.vertexColors[vertexIndex * 4 + 3]!
        ]
      : mesh.rgba;
    out[base + 6] = 0;
    writeColorFloatSlot(out, base + 6, rgba);
  }
  return out;
}

/** Build direct-load mesh/instance chunks for IfcViewerWeb from IFCAPI meshes. */
export function buildMeshUploadBundlesFromMeshes(
  meshes: readonly Mesh[],
  elementMetadata: ReadonlyMap<number, SidecarElementMetadata>
): MeshUploadBundle[] {
  const meshGroups = new Map<string, UniqueMesh>();
  for (const mesh of meshes) {
    collectMeshFromIfcApi(mesh, elementMetadata, meshGroups);
  }

  const bundles: MeshUploadBundle[] = [];
  let objectId = 1;
  let localMeshId = 0;

  for (const mesh of meshGroups.values()) {
    const vertexCount = mesh.positions.length / 3;
    const indexCount = mesh.indices.length;
    if (vertexCount === 0 || indexCount === 0) {
      continue;
    }

    const instances: MeshUploadInstance[] = [];
    for (const pending of mesh.instances) {
      const metadata = elementMetadata.get(pending.elementId);
      const elementType = metadata?.type ?? "";
      if (HIDDEN_ELEMENT_TYPES.has(elementType)) {
        continue;
      }

      const transform = new Float64Array(16);
      for (let i = 0; i < 16; i += 1) {
        transform[i] = pending.transform[i]!;
      }

      instances.push({
        objectId,
        elementId: pending.elementId,
        transform,
        colorOverrideRgba8: 0
      });
      objectId += 1;
    }

    if (instances.length === 0) {
      continue;
    }

    bundles.push({
      localMeshId,
      vertices: uniqueMeshToStreamVertices(mesh),
      indices: new Uint32Array(mesh.indices),
      instances
    });
    localMeshId += 1;
  }

  return bundles;
}

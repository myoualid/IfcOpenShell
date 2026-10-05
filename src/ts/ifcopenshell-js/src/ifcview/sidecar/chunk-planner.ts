import {
  SIDECAR_VERTEX_STRIDE,
  type SidecarChunkToc,
  type SidecarData,
  type SidecarInstanceCpu,
  type SidecarMeshInfo
} from "./types.js";

/** Matches ChunkPlanner.h WGPU_CHUNK_VERTEX_BYTES_LIMIT. */
export const WGPU_CHUNK_VERTEX_BYTES_LIMIT = 4 * 1024 * 1024;

function mortonSplit21(v: number): bigint {
  let r = BigInt(v & 0x1fffff);
  r = ((r | (r << 32n)) & 0x001f00000000ffffn) as bigint;
  r = ((r | (r << 16n)) & 0x001f0000ff0000ffn) as bigint;
  r = ((r | (r << 8n)) & 0x100f00f00f00f00fn) as bigint;
  r = ((r | (r << 4n)) & 0x10c30c30c30c30c3n) as bigint;
  r = ((r | (r << 2n)) & 0x1249249249249249n) as bigint;
  return r;
}

function mortonCode3D(x: number, y: number, z: number): bigint {
  return mortonSplit21(x) | (mortonSplit21(y) << 1n) | (mortonSplit21(z) << 2n);
}

export function sortMeshIdsByMorton(
  meshCount: number,
  meshCentroidX: Float32Array | number[],
  meshCentroidY: Float32Array | number[],
  meshCentroidZ: Float32Array | number[],
  meshInstanceCount: Uint32Array | number[]
): number[] {
  const bmin = [Infinity, Infinity, Infinity];
  const bmax = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < meshCount; i += 1) {
    if ((meshInstanceCount[i] ?? 0) === 0) {
      continue;
    }
    bmin[0] = Math.min(bmin[0]!, meshCentroidX[i]!);
    bmax[0] = Math.max(bmax[0]!, meshCentroidX[i]!);
    bmin[1] = Math.min(bmin[1]!, meshCentroidY[i]!);
    bmax[1] = Math.max(bmax[1]!, meshCentroidY[i]!);
    bmin[2] = Math.min(bmin[2]!, meshCentroidZ[i]!);
    bmax[2] = Math.max(bmax[2]!, meshCentroidZ[i]!);
  }

  const ext = [
    Math.max(bmax[0]! - bmin[0]!, 1e-3),
    Math.max(bmax[1]! - bmin[1]!, 1e-3),
    Math.max(bmax[2]! - bmin[2]!, 1e-3)
  ];
  const mortonMax = (1 << 21) - 1;
  const codes = new BigUint64Array(meshCount);

  for (let i = 0; i < meshCount; i += 1) {
    if ((meshInstanceCount[i] ?? 0) === 0) {
      continue;
    }
    const qx = Math.min(Math.floor(((meshCentroidX[i]! - bmin[0]!) / ext[0]!) * (mortonMax + 1)), mortonMax);
    const qy = Math.min(Math.floor(((meshCentroidY[i]! - bmin[1]!) / ext[1]!) * (mortonMax + 1)), mortonMax);
    const qz = Math.min(Math.floor(((meshCentroidZ[i]! - bmin[2]!) / ext[2]!) * (mortonMax + 1)), mortonMax);
    codes[i] = mortonCode3D(qx, qy, qz);
  }

  const sorted = Array.from({ length: meshCount }, (_, index) => index);
  sorted.sort((a, b) => {
    const diff = codes[a]! - codes[b]!;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return a - b;
  });
  return sorted;
}

export function greedyPackChunks(
  sortedMeshIds: readonly number[],
  meshVertexCount: readonly number[],
  vertexStrideBytes: number,
  chunkVertexBytesLimit: number
): number[][] {
  const chunks: number[][] = [];
  if (sortedMeshIds.length === 0) {
    return chunks;
  }

  chunks.push([]);
  let currentChunkBytes = 0;
  for (const meshId of sortedMeshIds) {
    const meshBytes = meshVertexCount[meshId]! * vertexStrideBytes;
    if (currentChunkBytes > 0 && currentChunkBytes + meshBytes > chunkVertexBytesLimit) {
      chunks.push([]);
      currentChunkBytes = 0;
    }
    chunks[chunks.length - 1]!.push(meshId);
    currentChunkBytes += meshBytes;
  }

  if (chunks[chunks.length - 1]!.length === 0) {
    chunks.pop();
  }
  return chunks;
}

/** Reorder geometry/instances to Morton chunk order (SidecarLayout.cpp). */
export function reorderSidecarByMorton(data: SidecarData): SidecarData {
  const meshCount = data.meshes.length;
  if (meshCount < 2) {
    return {
      ...data,
      chunks: meshCount === 1 ? [{ firstMesh: 0, meshCount: 1 }] : []
    };
  }

  const meshCentroidX = new Float32Array(meshCount);
  const meshCentroidY = new Float32Array(meshCount);
  const meshCentroidZ = new Float32Array(meshCount);
  const meshInstanceCount = new Uint32Array(meshCount);

  for (const instance of data.instances) {
    if (instance.meshId >= meshCount) {
      continue;
    }
    meshCentroidX[instance.meshId]! += 0.5 * (instance.worldAabbMin[0]! + instance.worldAabbMax[0]!);
    meshCentroidY[instance.meshId]! += 0.5 * (instance.worldAabbMin[1]! + instance.worldAabbMax[1]!);
    meshCentroidZ[instance.meshId]! += 0.5 * (instance.worldAabbMin[2]! + instance.worldAabbMax[2]!);
    meshInstanceCount[instance.meshId]! += 1;
  }

  for (let i = 0; i < meshCount; i += 1) {
    if (meshInstanceCount[i]! > 0) {
      const inv = 1 / meshInstanceCount[i]!;
      meshCentroidX[i]! *= inv;
      meshCentroidY[i]! *= inv;
      meshCentroidZ[i]! *= inv;
    }
  }

  const order = sortMeshIdsByMorton(
    meshCount,
    meshCentroidX,
    meshCentroidY,
    meshCentroidZ,
    meshInstanceCount
  );

  const meshVertexCount = data.meshes.map((mesh) => mesh.vertexCount);
  const packed = greedyPackChunks(order, meshVertexCount, SIDECAR_VERTEX_STRIDE, WGPU_CHUNK_VERTEX_BYTES_LIMIT);

  const chunks: SidecarChunkToc[] = [];
  let firstMesh = 0;
  for (const chunk of packed) {
    chunks.push({ firstMesh, meshCount: chunk.length });
    firstMesh += chunk.length;
  }

  const instsByMesh: number[][] = Array.from({ length: meshCount }, () => []);
  for (let instanceIndex = 0; instanceIndex < data.instances.length; instanceIndex += 1) {
    const meshId = data.instances[instanceIndex]!.meshId;
    if (meshId < meshCount) {
      instsByMesh[meshId]!.push(instanceIndex);
    }
  }

  let totalVertexBytes = 0;
  let totalIndexCount = 0;
  for (let newMeshIndex = 0; newMeshIndex < meshCount; newMeshIndex += 1) {
    const oldMesh = data.meshes[order[newMeshIndex]!]!;
    totalVertexBytes += oldMesh.vertexCount * SIDECAR_VERTEX_STRIDE;
    totalIndexCount += oldMesh.indexCount + oldMesh.lod1IndexCount;
  }

  const newVertices = new Uint8Array(totalVertexBytes);
  const newIndices = new Uint32Array(totalIndexCount);
  const newMeshes: SidecarMeshInfo[] = [];
  const newInstances: SidecarInstanceCpu[] = [];
  let vertexOffset = 0;
  let indexOffset = 0;

  for (let newMeshIndex = 0; newMeshIndex < meshCount; newMeshIndex += 1) {
    const old = order[newMeshIndex]!;
    const oldMesh = data.meshes[old]!;
    const newMesh: SidecarMeshInfo = { ...oldMesh };

    const vertexByteCount = oldMesh.vertexCount * SIDECAR_VERTEX_STRIDE;
    newMesh.vboByteOffset = vertexOffset;
    if (vertexByteCount > 0) {
      newVertices.set(
        data.vertices.subarray(oldMesh.vboByteOffset, oldMesh.vboByteOffset + vertexByteCount),
        vertexOffset
      );
      vertexOffset += vertexByteCount;
    }

    newMesh.eboByteOffset = indexOffset * 4;
    if (oldMesh.indexCount > 0) {
      const indexStart = oldMesh.eboByteOffset / 4;
      newIndices.set(
        data.indices.subarray(indexStart, indexStart + oldMesh.indexCount),
        indexOffset
      );
      indexOffset += oldMesh.indexCount;
    }

    newMesh.firstInstance = newInstances.length;
    newMesh.instanceCount = instsByMesh[old]!.length;
    for (const instanceIndex of instsByMesh[old]!) {
      const instance = { ...data.instances[instanceIndex]! };
      instance.meshId = newMeshIndex;
      newInstances.push(instance);
    }

    newMeshes.push(newMesh);
  }

  for (let newMeshIndex = 0; newMeshIndex < meshCount; newMeshIndex += 1) {
    const oldMesh = data.meshes[order[newMeshIndex]!]!;
    const newMesh = newMeshes[newMeshIndex]!;
    if (oldMesh.lod1IndexCount === 0) {
      newMesh.lod1EboByteOffset = 0;
      newMesh.lod1IndexCount = 0;
      continue;
    }
    newMesh.lod1EboByteOffset = indexOffset * 4;
    const lod1Start = oldMesh.lod1EboByteOffset / 4;
    newIndices.set(
      data.indices.subarray(lod1Start, lod1Start + oldMesh.lod1IndexCount),
      indexOffset
    );
    indexOffset += oldMesh.lod1IndexCount;
  }

  return {
    ...data,
    vertices: newVertices,
    indices: newIndices,
    meshes: newMeshes,
    instances: newInstances,
    chunks
  };
}

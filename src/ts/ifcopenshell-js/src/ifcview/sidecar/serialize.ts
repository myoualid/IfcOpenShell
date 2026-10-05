import {
  INSTANCE_CPU_BYTE_LENGTH,
  MESH_INFO_BYTE_LENGTH,
  PACKED_ELEMENT_BYTE_LENGTH,
  SIDECAR_CHUNK_BYTE_LENGTH,
  SIDECAR_ENDIAN,
  SIDECAR_MAGIC,
  SIDECAR_VERTEX_STRIDE,
  VIEWER_SIDECAR_FORMAT_VERSION,
  type SidecarChunkToc,
  type SidecarData,
  type SidecarElementInfo,
  type SidecarInstanceCpu,
  type SidecarMeshInfo
} from "./types.js";
import { reorderSidecarByMorton } from "./chunk-planner.js";
import { concatByteChunks, SidecarByteBuilder } from "./byte-builder.js";
import { compressSidecarBlock } from "./compress.js";

function writeMeshInfo(view: DataView, offset: number, mesh: SidecarMeshInfo): void {
  view.setUint32(offset, mesh.vboByteOffset, true);
  view.setUint32(offset + 4, mesh.vertexCount, true);
  view.setUint32(offset + 8, mesh.eboByteOffset, true);
  view.setUint32(offset + 12, mesh.indexCount, true);
  view.setFloat32(offset + 16, mesh.localAabbMin[0]!, true);
  view.setFloat32(offset + 20, mesh.localAabbMin[1]!, true);
  view.setFloat32(offset + 24, mesh.localAabbMin[2]!, true);
  view.setFloat32(offset + 28, mesh.localAabbMax[0]!, true);
  view.setFloat32(offset + 32, mesh.localAabbMax[1]!, true);
  view.setFloat32(offset + 36, mesh.localAabbMax[2]!, true);
  view.setUint32(offset + 40, mesh.firstInstance, true);
  view.setUint32(offset + 44, mesh.instanceCount, true);
  view.setUint32(offset + 48, mesh.lod1EboByteOffset, true);
  view.setUint32(offset + 52, mesh.lod1IndexCount, true);
}

function writeInstanceCpu(view: DataView, offset: number, instance: SidecarInstanceCpu): void {
  view.setUint32(offset, instance.meshId, true);
  view.setUint32(offset + 4, instance.objectId, true);
  view.setUint32(offset + 8, instance.colorOverrideRgba8, true);
  view.setUint32(offset + 12, instance.modelId, true);

  for (let i = 0; i < 16; i += 1) {
    view.setFloat64(offset + 16 + i * 8, instance.placementTransformation[i]!, true);
    view.setFloat32(offset + 144 + i * 4, instance.transform[i]!, true);
  }

  view.setFloat32(offset + 208, instance.worldAabbMin[0]!, true);
  view.setFloat32(offset + 212, instance.worldAabbMin[1]!, true);
  view.setFloat32(offset + 216, instance.worldAabbMin[2]!, true);
  view.setFloat32(offset + 220, instance.worldAabbMax[0]!, true);
  view.setFloat32(offset + 224, instance.worldAabbMax[1]!, true);
  view.setFloat32(offset + 228, instance.worldAabbMax[2]!, true);
}

function extractChunkGeometry(
  data: SidecarData,
  chunk: SidecarChunkToc
): { vertices: Uint8Array; indices: Uint8Array } {
  const vertexParts: Uint8Array[] = [];
  const indexParts: Uint8Array[] = [];
  const end = chunk.firstMesh + chunk.meshCount;

  for (let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1) {
    const mesh = data.meshes[meshIndex]!;
    const vertexByteCount = mesh.vertexCount * SIDECAR_VERTEX_STRIDE;
    if (vertexByteCount > 0) {
      vertexParts.push(
        data.vertices.subarray(mesh.vboByteOffset, mesh.vboByteOffset + vertexByteCount)
      );
    }
  }

  for (let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1) {
    const mesh = data.meshes[meshIndex]!;
    if (mesh.indexCount > 0) {
      const wordStart = mesh.eboByteOffset / 4;
      const indexSlice = data.indices.subarray(wordStart, wordStart + mesh.indexCount);
      indexParts.push(new Uint8Array(indexSlice.buffer, indexSlice.byteOffset, indexSlice.byteLength));
    }
  }

  for (let meshIndex = chunk.firstMesh; meshIndex < end && meshIndex < data.meshes.length; meshIndex += 1) {
    const mesh = data.meshes[meshIndex]!;
    if (mesh.lod1IndexCount > 0) {
      const wordStart = mesh.lod1EboByteOffset / 4;
      const indexSlice = data.indices.subarray(wordStart, wordStart + mesh.lod1IndexCount);
      indexParts.push(new Uint8Array(indexSlice.buffer, indexSlice.byteOffset, indexSlice.byteLength));
    }
  }

  return { vertices: concatByteChunks(vertexParts), indices: concatByteChunks(indexParts) };
}

function appendVecMeshOrInstance(
  builder: SidecarByteBuilder,
  elementSize: number,
  writer: (view: DataView, offset: number, value: SidecarMeshInfo | SidecarInstanceCpu) => void,
  values: readonly (SidecarMeshInfo | SidecarInstanceCpu)[]
): void {
  builder.appendU32(values.length);
  if (values.length === 0) {
    return;
  }
  const bytes = new Uint8Array(elementSize * values.length);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i += 1) {
    writer(view, i * elementSize, values[i]!);
  }
  builder.append(bytes);
}

function buildGeometryMetadataRaw(data: SidecarData, chunks: SidecarChunkToc[]): Uint8Array {
  const builder = new SidecarByteBuilder();
  appendVecMeshOrInstance(builder, MESH_INFO_BYTE_LENGTH, writeMeshInfo as never, data.meshes);
  appendVecMeshOrInstance(builder, INSTANCE_CPU_BYTE_LENGTH, writeInstanceCpu as never, data.instances);
  builder.appendU32(data.georef.hasCoordinateOperation ? 1 : 0);
  for (let i = 0; i < 16; i += 1) {
    builder.appendF64(data.georef.coordinateOperationMeters[i] ?? 0);
  }
  builder.appendF64(data.georef.projectLengthToMeters);
  builder.appendF64(data.georef.mapUnitToMeters);
  builder.appendU32(chunks.length);
  for (const chunk of chunks) {
    const slot = new ArrayBuffer(SIDECAR_CHUNK_BYTE_LENGTH);
    writeSidecarChunk(new DataView(slot), 0, chunk);
    builder.append(new Uint8Array(slot));
  }
  return builder.toUint8Array();
}

function buildElementMetadataRaw(data: SidecarData): Uint8Array {
  const builder = new SidecarByteBuilder();
  builder.appendU32(data.elements.length);
  for (const element of data.elements) {
    const slot = new ArrayBuffer(PACKED_ELEMENT_BYTE_LENGTH);
    writePackedElement(new DataView(slot), 0, element);
    builder.append(new Uint8Array(slot));
  }
  const stringTableBytes = new TextEncoder().encode(data.stringTable);
  builder.appendU32(stringTableBytes.byteLength);
  builder.append(stringTableBytes);
  return builder.toUint8Array();
}

function writePackedElement(view: DataView, offset: number, element: SidecarElementInfo): void {
  view.setUint32(offset, element.objectId, true);
  view.setUint32(offset + 4, element.modelId, true);
  view.setInt32(offset + 8, element.ifcId, true);
}

function writeSidecarChunk(view: DataView, offset: number, chunk: SidecarChunkToc): void {
  view.setUint32(offset, chunk.firstMesh, true);
  view.setUint32(offset + 4, chunk.meshCount, true);
  view.setBigUint64(offset + 8, chunk.vCompOff ?? 0n, true);
  view.setBigUint64(offset + 16, chunk.vCompSize ?? 0n, true);
  view.setBigUint64(offset + 24, chunk.vRawSize ?? 0n, true);
  view.setBigUint64(offset + 32, chunk.iCompOff ?? 0n, true);
  view.setBigUint64(offset + 40, chunk.iCompSize ?? 0n, true);
  view.setBigUint64(offset + 48, chunk.iRawSize ?? 0n, true);
}

async function writeCompressedBlock(raw: Uint8Array): Promise<Uint8Array> {
  const compressed = await compressSidecarBlock(raw);
  const out = new Uint8Array(16 + compressed.byteLength);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, BigInt(compressed.byteLength), true);
  view.setBigUint64(8, BigInt(raw.byteLength), true);
  out.set(compressed, 16);
  return out;
}

/** Serialize structured sidecar data to viewer `.ifcview` bytes for IfcViewerWeb. */
export async function writeViewerSidecarBytes(data: SidecarData): Promise<Uint8Array> {
  const laidOut = reorderSidecarByMorton(data);
  const chunks = laidOut.chunks ?? [];
  if (laidOut.meshes.length > 0 && chunks.length === 0) {
    chunks.push({ firstMesh: 0, meshCount: laidOut.meshes.length });
  }

  const geometryChunks: Uint8Array[] = [];
  const chunkToc: SidecarChunkToc[] = [];
  let geometryOffset = 0;

  for (const chunk of chunks) {
    const { vertices, indices } = extractChunkGeometry(laidOut, chunk);
    const vCompressed = await compressSidecarBlock(vertices);
    const iCompressed = await compressSidecarBlock(indices);

    const tocEntry: SidecarChunkToc = {
      firstMesh: chunk.firstMesh,
      meshCount: chunk.meshCount,
      vCompOff: BigInt(geometryOffset),
      vCompSize: BigInt(vCompressed.byteLength),
      vRawSize: BigInt(vertices.byteLength),
      iCompOff: 0n,
      iCompSize: 0n,
      iRawSize: 0n
    };
    geometryChunks.push(vCompressed);
    geometryOffset += vCompressed.byteLength;

    tocEntry.iCompOff = BigInt(geometryOffset);
    tocEntry.iCompSize = BigInt(iCompressed.byteLength);
    tocEntry.iRawSize = BigInt(indices.byteLength);
    geometryChunks.push(iCompressed);
    geometryOffset += iCompressed.byteLength;

    chunkToc.push(tocEntry);
  }

  const geometrySection = concatByteChunks(geometryChunks);
  const geometryMetadataBlock = await writeCompressedBlock(buildGeometryMetadataRaw(laidOut, chunkToc));
  const elementMetadataBlock = await writeCompressedBlock(buildElementMetadataRaw(laidOut));

  const totalSize =
    12 + 8 + geometrySection.byteLength + geometryMetadataBlock.byteLength + elementMetadataBlock.byteLength;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let offset = 0;

  view.setUint32(offset, SIDECAR_MAGIC, true);
  view.setUint32(offset + 4, VIEWER_SIDECAR_FORMAT_VERSION, true);
  view.setUint32(offset + 8, SIDECAR_ENDIAN, true);
  offset += 12;

  view.setBigUint64(offset, BigInt(geometrySection.byteLength), true);
  offset += 8;

  out.set(geometrySection, offset);
  offset += geometrySection.byteLength;
  out.set(geometryMetadataBlock, offset);
  offset += geometryMetadataBlock.byteLength;
  out.set(elementMetadataBlock, offset);

  return out;
}

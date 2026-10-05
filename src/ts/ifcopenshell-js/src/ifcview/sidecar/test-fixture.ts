import {
  SIDECAR_ENDIAN,
  SIDECAR_MAGIC,
  VIEWER_SIDECAR_FORMAT_VERSION,
  type SidecarData,
  type SidecarElementInfo
} from "./types.js";

function buildFixtureElements(): SidecarElementInfo[] {
  return [
    { objectId: 100, modelId: 1, ifcId: 1000 },
    { objectId: 101, modelId: 1, ifcId: 1001 },
    { objectId: 102, modelId: 1, ifcId: 1002 }
  ];
}

/** Minimal in-memory sidecar used by unit tests. */
export function buildTestSidecarData(): SidecarData {
  const elements = buildFixtureElements();
  return {
    header: {
      magic: SIDECAR_MAGIC,
      version: VIEWER_SIDECAR_FORMAT_VERSION,
      endian: SIDECAR_ENDIAN
    },
    vertices: new Uint8Array(48),
    indices: new Uint32Array([0, 1, 2, 1, 2, 3]),
    meshes: [
      {
        vboByteOffset: 0,
        vertexCount: 2,
        eboByteOffset: 0,
        indexCount: 3,
        localAabbMin: [-1, -2, -3],
        localAabbMax: [4, 5, 6],
        firstInstance: 0,
        instanceCount: 3,
        lod1EboByteOffset: 0,
        lod1IndexCount: 0
      },
      {
        vboByteOffset: 24,
        vertexCount: 2,
        eboByteOffset: 12,
        indexCount: 3,
        localAabbMin: [10, 11, 12],
        localAabbMax: [13, 14, 15],
        firstInstance: 3,
        instanceCount: 2,
        lod1EboByteOffset: 0,
        lod1IndexCount: 0
      }
    ],
    instances: Array.from({ length: 5 }, (_, index) => ({
      meshId: index < 3 ? 0 : 1,
      objectId: 100 + index,
      colorOverrideRgba8: 0xaa000000 | index * 0x010203,
      modelId: 1,
      placementTransformation: Float64Array.from({ length: 16 }, (_, k) => index * 0.25 + k),
      transform: Float32Array.from({ length: 16 }, (_, k) => index * 0.5 + k),
      worldAabbMin: [index, index + 1, index + 2],
      worldAabbMax: [index + 10, index + 11, index + 12]
    })),
    georef: {
      hasCoordinateOperation: true,
      coordinateOperationMeters: Float64Array.from({ length: 16 }, (_, k) => 0.5 + 0.1 * k),
      projectLengthToMeters: 0.001,
      mapUnitToMeters: 1
    },
    elements,
    stringTable: ""
  };
}

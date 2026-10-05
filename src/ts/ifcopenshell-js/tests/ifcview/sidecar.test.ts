import { describe, expect, it } from 'vitest';

import { buildSidecarFromMeshes } from '../../src/ifcview/sidecar/mesh-builder.js';
import {
  assertSidecarHeader,
  readSidecarElementMetadata,
  readSidecarHeader,
  validateSidecarBytes,
  VIEWER_SIDECAR_VERSION,
} from '../../src/ifcview/sidecar/parse.js';
import { writeViewerSidecarBytes } from '../../src/ifcview/sidecar/serialize.js';
import { buildTestSidecarData } from '../../src/ifcview/sidecar/test-fixture.js';
import { SIDECAR_MAGIC } from '../../src/ifcview/sidecar/types.js';
import { readSidecarVertexColor } from '../../src/ifcview/sidecar/vertex.js';

function identityTransform(): Float64Array {
  const transform = new Float64Array(16);
  transform[0] = 1;
  transform[5] = 1;
  transform[10] = 1;
  transform[15] = 1;
  return transform;
}

describe('ifcview sidecar writer/parser', () => {
  it('round-trips header and element metadata through write + validate', async () => {
    const bytes = await writeViewerSidecarBytes(buildTestSidecarData());
    expect(bytes.byteLength).toBeGreaterThan(20);

    const header = readSidecarHeader(bytes);
    expect(header.magic).toBe(SIDECAR_MAGIC);
    expect(header.version).toBe(VIEWER_SIDECAR_VERSION);

    assertSidecarHeader(bytes);
    validateSidecarBytes(bytes);

    const elements = readSidecarElementMetadata(bytes);
    expect(elements.map((entry) => entry.ifcId)).toEqual([1000, 1001, 1002]);
  });

  it('builds sidecar geometry from Mesh snapshots with multi-material colors', async () => {
    const mesh = {
      id: 101,
      guid: 'wall-guid',
      type: 'IfcWall',
      name: 'Wall',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      faces: Uint32Array.from([0, 1, 2, 1, 3, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      transform: identityTransform(),
      materialIds: Int32Array.from([0, 1]),
      colors: new Float32Array([0, 0, 0, 1, 0.75, 0.8, 0.65, 1]),
      edges: new Uint32Array(0),
      itemIds: Int32Array.from([0, 1]),
      edgeItemIds: new Int32Array(0),
      uvs: new Float32Array(0),
    };

    const metadata = new Map([
      [101, { id: 101, type: 'IfcWall', name: 'Wall', guid: 'wall-guid' }],
    ]);

    const sidecar = buildSidecarFromMeshes([mesh], metadata);
    expect(sidecar.meshes.length).toBe(1);
    expect(sidecar.instances.length).toBe(1);

    const meshInfo = sidecar.meshes[0]!;
    const colors = new Set<string>();
    for (let vertexIndex = 0; vertexIndex < meshInfo.vertexCount; vertexIndex += 1) {
      const offset = meshInfo.vboByteOffset + vertexIndex * 12;
      colors.add(readSidecarVertexColor(sidecar.vertices, offset).slice(0, 3).join(','));
    }
    expect(colors.has('0,0,0')).toBe(true);

    const bytes = await writeViewerSidecarBytes(sidecar);
    validateSidecarBytes(bytes);
    expect(readSidecarElementMetadata(bytes)[0]?.ifcId).toBe(101);
  });
});

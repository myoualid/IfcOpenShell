
/**
 * IFC → `.ifcview` geometry sidecar conversion and parser.
 *
 * Standalone feature (not part of the Python SWIG parity surface). Ported from
 * the bonsai-web ifc-pipeline sidecar writer / reader.
 *
 * @module IfcView
 */

export { detectFormat, formatLabel, type InputFormat } from './detect.js';

export {
  convert,
  convertBytes,
  DEFAULT_GEOMETRY_LIBRARY,
  GEOMETRY_EXCLUDED_TYPES,
  type ConvertOptions,
  type ConvertResult,
} from './convert.js';

export { buildElementMetadataMap } from './context.js';

export { geometryBatchSize, materialKeyFromRgba, meshFingerprint } from './geometry.js';

export {
  configureCompressor,
  warmSidecarCompressor as warmCompressor,
  SIDECAR_ZSTD_LEVEL,
  SIDECAR_ZSTD_WEB_LEVEL,
} from './sidecar/compress.js';

export {
  SidecarMeshAccumulator,
  StreamingMeshUploadState,
  buildSidecarFromMeshes,
  buildMeshUploadBundlesFromMeshes,
  type BuildSidecarOptions,
  type MeshUploadBundle,
  type MeshUploadDelta,
  type MeshUploadInstance,
} from './sidecar/mesh-builder.js';

export {
  assertSidecarHeader as assertHeader,
  formatSidecarHeader as formatHeader,
  readSidecarElementMetadata as readElements,
  readSidecarHeader as readHeader,
  SidecarReadError,
  validateSidecarBytes as validate,
  VIEWER_SIDECAR_VERSION,
  type SidecarHeaderSummary,
} from './sidecar/parse.js';

export { writeViewerSidecarBytes as write } from './sidecar/serialize.js';

export {
  SIDECAR_ENDIAN,
  SIDECAR_MAGIC,
  SIDECAR_VERTEX_STRIDE,
  VIEWER_SIDECAR_FORMAT_VERSION,
  type SidecarChunkToc,
  type SidecarData,
  type SidecarElementInfo,
  type SidecarElementMetadata,
  type SidecarGeoref,
  type SidecarHeader,
  type SidecarInstanceCpu,
  type SidecarMeshInfo,
  type SpatialNode,
} from './sidecar/types.js';

export {
  dequantSidecarVertex,
  packRgba8,
  readSidecarVertexColor,
  rgbColor,
} from './sidecar/vertex.js';

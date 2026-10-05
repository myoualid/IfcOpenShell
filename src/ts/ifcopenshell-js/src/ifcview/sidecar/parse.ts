import { decompress as zstdDecompress } from "fzstd";

import {
  PACKED_ELEMENT_BYTE_LENGTH,
  SIDECAR_ENDIAN,
  SIDECAR_MAGIC,
  VIEWER_SIDECAR_FORMAT_VERSION,
  type SidecarElementInfo
} from "./types.js";

export class SidecarReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SidecarReadError";
  }
}

/** Sidecar schema version the IfcViewerWeb WASM build accepts via `viewer_load_sidecar`. */
export const VIEWER_SIDECAR_VERSION = VIEWER_SIDECAR_FORMAT_VERSION;

export interface SidecarHeaderSummary {
  magic: number;
  version: number;
  endian: number;
  byteLength: number;
}

function readPackedElement(view: DataView, byteOffset: number): SidecarElementInfo {
  return {
    objectId: view.getUint32(byteOffset, true),
    modelId: view.getUint32(byteOffset + 4, true),
    ifcId: view.getInt32(byteOffset + 8, true)
  };
}

function decompressSidecarBlock(bytes: Uint8Array, offset: number): Uint8Array {
  if (offset + 16 > bytes.byteLength) {
    throw new SidecarReadError("Sidecar metadata block header extends past file end.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const compSize = Number(view.getBigUint64(offset, true));
  const rawSize = Number(view.getBigUint64(offset + 8, true));
  const frameOffset = offset + 16;
  if (frameOffset + compSize > bytes.byteLength) {
    throw new SidecarReadError("Sidecar compressed metadata frame extends past file end.");
  }
  if (rawSize === 0) {
    return new Uint8Array(0);
  }
  const frame = bytes.slice(frameOffset, frameOffset + compSize);
  return zstdDecompress(frame, new Uint8Array(rawSize));
}

function parseElementMetadataBlock(raw: Uint8Array): { elements: SidecarElementInfo[]; stringTable: string } {
  if (raw.byteLength < 4) {
    throw new SidecarReadError("Sidecar element metadata block is truncated.");
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let offset = 0;
  const elementCount = view.getUint32(offset, true);
  offset += 4;

  if (offset + elementCount * PACKED_ELEMENT_BYTE_LENGTH + 4 > raw.byteLength) {
    throw new SidecarReadError("Sidecar element table extends past metadata block.");
  }

  const elementRecordsOffset = offset;
  offset += elementCount * PACKED_ELEMENT_BYTE_LENGTH;
  const stringTableBytes = view.getUint32(offset, true);
  offset += 4;
  if (offset + stringTableBytes > raw.byteLength) {
    throw new SidecarReadError("Sidecar string table extends past metadata block.");
  }
  const stringTable = new TextDecoder().decode(raw.slice(offset, offset + stringTableBytes));

  const elements: SidecarElementInfo[] = [];
  let elementOffset = elementRecordsOffset;
  for (let i = 0; i < elementCount; i += 1) {
    elements.push(readPackedElement(view, elementOffset));
    elementOffset += PACKED_ELEMENT_BYTE_LENGTH;
  }

  return { elements, stringTable };
}

/** Read element metadata from a viewer `.ifcview` sidecar. */
export function readSidecarElementMetadata(bytes: Uint8Array): SidecarElementInfo[] {
  if (bytes.byteLength < 12) {
    throw new SidecarReadError(`Sidecar too small (${bytes.byteLength} B).`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  if (version !== VIEWER_SIDECAR_FORMAT_VERSION) {
    throw new SidecarReadError(
      `Unsupported sidecar version ${version} (expected v${VIEWER_SIDECAR_FORMAT_VERSION}).`
    );
  }

  const geomBytes = Number(view.getBigUint64(12, true));
  let offset = 20 + geomBytes;
  decompressSidecarBlock(bytes, offset);
  offset += 16 + Number(view.getBigUint64(offset, true));
  const elementRaw = decompressSidecarBlock(bytes, offset);
  return parseElementMetadataBlock(elementRaw).elements;
}

export function readSidecarHeader(bytes: Uint8Array): SidecarHeaderSummary {
  if (bytes.byteLength < 12) {
    throw new SidecarReadError(`Sidecar too small (${bytes.byteLength} B).`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    endian: view.getUint32(8, true),
    byteLength: bytes.byteLength
  };
}

/** Quick header check before handing bytes to IfcViewerWeb. */
export function assertSidecarHeader(bytes: Uint8Array): void {
  const header = readSidecarHeader(bytes);
  if (header.magic !== SIDECAR_MAGIC) {
    throw new SidecarReadError(
      `Invalid sidecar magic 0x${header.magic.toString(16)} (expected IFVW).`
    );
  }
  if (header.endian !== SIDECAR_ENDIAN) {
    throw new SidecarReadError("Sidecar endian marker mismatch.");
  }
  if (header.version !== VIEWER_SIDECAR_VERSION) {
    throw new SidecarReadError(
      `Unsupported sidecar version ${header.version} (expected v${VIEWER_SIDECAR_VERSION}).`
    );
  }
}

/** Structural parse — validates compressed metadata frames. */
export function validateSidecarBytes(bytes: Uint8Array): void {
  assertSidecarHeader(bytes);
  readSidecarElementMetadata(bytes);
}

export function formatSidecarHeader(bytes: Uint8Array): string {
  try {
    const header = readSidecarHeader(bytes);
    const magic =
      header.magic === SIDECAR_MAGIC
        ? "IFVW"
        : `0x${header.magic.toString(16)}`;
    return `${magic} v${header.version}, ${header.byteLength} B`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

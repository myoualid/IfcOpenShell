/** Concatenate byte chunks without spread (avoids stack overflow on large models). */
export function concatByteChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.byteLength;
  }
  if (total === 0) {
    return new Uint8Array(0);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    if (chunk.byteLength === 0) {
      continue;
    }
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Growable byte buffer for sidecar metadata blocks (small; no spread on append). */
export class SidecarByteBuilder {
  private readonly chunks: Uint8Array[] = [];
  private totalBytes = 0;

  append(bytes: Uint8Array): void {
    if (bytes.byteLength === 0) {
      return;
    }
    this.chunks.push(bytes);
    this.totalBytes += bytes.byteLength;
  }

  appendU32(value: number): void {
    const slot = new Uint8Array(4);
    new DataView(slot.buffer).setUint32(0, value, true);
    this.append(slot);
  }

  appendF64(value: number): void {
    const slot = new Uint8Array(8);
    new DataView(slot.buffer).setFloat64(0, value, true);
    this.append(slot);
  }

  byteLength(): number {
    return this.totalBytes;
  }

  toUint8Array(): Uint8Array {
    return concatByteChunks(this.chunks);
  }
}

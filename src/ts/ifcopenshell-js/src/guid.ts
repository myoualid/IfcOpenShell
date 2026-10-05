
const CHARS64_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CHARS64_IFC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

function translate(value: string, from: string, to: string): string {
  let out = '';
  for (const ch of value) {
    const index = from.indexOf(ch);
    out += index >= 0 ? to[index] : ch;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Convert a hex UUID to a 22-character IFC GUID. */
export function compress(uuid: string): string {
  const hex = `0000${uuid.toLowerCase().replace(/\W/g, '')}`;
  const bytes = hexToBytes(hex);
  const std = btoa(String.fromCharCode(...bytes));
  return translate(std.slice(2), CHARS64_STD, CHARS64_IFC);
}

/** Convert a 22-character IFC GUID to a hex UUID. */
export function expand(guid: string): string {
  const std = translate(`AA${guid}`, CHARS64_IFC, CHARS64_STD);
  const binary = atob(std);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return bytesToHex(bytes).slice(4);
}

/** Format a hex UUID with hyphens. */
export function split(uuid: string): string {
  return [uuid.slice(0, 8), uuid.slice(8, 12), uuid.slice(12, 16), uuid.slice(16, 20), uuid.slice(20)].join('-');
}

/** Generate a random IFC GlobalId. */
export function newGuid(): string {
  return compress(crypto.randomUUID().replace(/-/g, ''));
}

/** Python-shaped `ifcopenshell.guid` helpers. */
export const guid = {
  compress,
  expand,
  split,
  new: newGuid,
};

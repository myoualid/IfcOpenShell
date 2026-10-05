/** Detected input format for the format router. */
export type InputFormat =
  | "ifc-spf"
  | "ifcview"
  | "rdbview"
  | "unknown";

const IFVW_MAGIC = [0x49, 0x46, 0x56, 0x57] as const; // "IFVW"
const ZIP_MAGIC = [0x50, 0x4b] as const; // "PK"
const IFC_SPF_PREFIX = "ISO-10303-21";

function matchesMagic(bytes: Uint8Array, magic: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) {
    return false;
  }
  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[offset + index] !== magic[index]) {
      return false;
    }
  }
  return true;
}

function readAsciiPrefix(bytes: Uint8Array, maxLength: number): string {
  const length = Math.min(bytes.length, maxLength);
  let text = "";
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[index] ?? 0);
  }
  return text;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) {
    return "";
  }
  return filename.slice(dot).toLowerCase();
}

/**
 * Detect format from filename and leading bytes.
 * Extension is a hint; magic bytes take precedence when they disagree.
 */
export function detectFormat(bytes: Uint8Array, filename: string): InputFormat {
  const extension = extensionOf(filename);

  if (matchesMagic(bytes, IFVW_MAGIC)) {
    return "ifcview";
  }

  if (matchesMagic(bytes, ZIP_MAGIC)) {
    return "rdbview";
  }

  const prefix = readAsciiPrefix(bytes, 128).trimStart();
  if (prefix.startsWith(IFC_SPF_PREFIX)) {
    return "ifc-spf";
  }

  switch (extension) {
    case ".ifc":
      return "ifc-spf";
    case ".ifcview":
      return "ifcview";
    default:
      return "unknown";
  }
}

export function formatLabel(format: InputFormat): string {
  switch (format) {
    case "ifc-spf":
      return "IFC SPF";
    case "ifcview":
      return "IFC sidecar (.ifcview)";
    case "rdbview":
      return "RDBView bundle (.rdbview)";
    default:
      return "unknown format";
  }
}

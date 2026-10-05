import { describe, expect, it } from 'vitest';

import { detectFormat, formatLabel } from '../../src/ifcview/detect.js';

describe('ifcview detectFormat', () => {
  it('recognizes IFVW magic as ifcview', () => {
    const bytes = new Uint8Array([0x49, 0x46, 0x56, 0x57, 0, 0, 0, 0]);
    expect(detectFormat(bytes, 'model.ifc')).toBe('ifcview');
    expect(formatLabel('ifcview')).toMatch(/ifcview/i);
  });

  it('recognizes ISO-10303-21 as ifc-spf', () => {
    const text = "ISO-10303-21;\nHEADER;\n";
    const bytes = new TextEncoder().encode(text);
    expect(detectFormat(bytes, 'model.ifc')).toBe('ifc-spf');
  });

  it('falls back to extension hints', () => {
    expect(detectFormat(new Uint8Array([1, 2, 3]), 'cache.ifcview')).toBe('ifcview');
    expect(detectFormat(new Uint8Array([1, 2, 3]), 'model.ifc')).toBe('ifc-spf');
  });
});

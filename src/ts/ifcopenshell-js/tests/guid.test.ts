import { describe, expect, it } from 'vitest';
import { guid } from '../src/guid.js';

describe('guid', () => {
  it('compresses and expands IFC GlobalIds', () => {
    const uuid = '3dc010b8-44c5-4a9b-90ac-eabc54d1f6f9';
    const compressed = guid.compress(uuid);
    expect(compressed).toBe('0zm12uHCLAcv2iwhnKqVRv');
    expect(guid.expand(compressed)).toBe(uuid.replace(/-/g, ''));
    expect(guid.split(guid.expand(compressed))).toBe(uuid);
  });

  it('generates 22-character IFC GUIDs', () => {
    const value = guid.new();
    expect(value).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });
});

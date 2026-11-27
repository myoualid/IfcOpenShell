// This file was generated with the assistance of an AI coding tool.

import { describe, it, expect } from 'vitest';
import * as guid from '../src/guid.js';

// Reference values from Python ifcopenshell.guid.
const UUID = '1c2b2f6a3f4e4a1b9c8d7e6f5a4b3c2d';
const GLOBAL_ID = '0SAozgFqvA6voDVczQIpmj';

describe('guid', () => {
  it('compresses a UUID as Python does', () => {
    expect(guid.compress(UUID)).toBe(GLOBAL_ID);
    expect(guid.compress('1c2b2f6a-3f4e-4a1b-9c8d-7e6f5a4b3c2d')).toBe(GLOBAL_ID);
    expect(guid.compress('00000000000000000000000000000000')).toBe('0000000000000000000000');
    expect(guid.compress('ffffffffffffffffffffffffffffffff')).toBe('3$$$$$$$$$$$$$$$$$$$$$');
  });

  it('expands a GlobalId back to the UUID', () => {
    expect(guid.expand(GLOBAL_ID)).toBe(UUID);
  });

  it('splits a UUID into groups', () => {
    expect(guid.split(UUID)).toBe('1c2b2f6a-3f4e-4a1b-9c8d-7e6f5a4b3c2d');
  });

  it('generates valid GlobalIds', () => {
    const value = guid.new();
    expect(value).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    expect(guid.compress(guid.expand(value))).toBe(value);
    expect(guid.new()).not.toBe(value);
  });
});

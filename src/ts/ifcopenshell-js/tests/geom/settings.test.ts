import { beforeAll, expect, it } from 'vitest';
import { createInstance, describeOrSkip } from '../_helper.js';
import { IfcOpenShellError, settings, type IfcOpenShell } from '../../src/index.js';

describeOrSkip('geom.settings', () => {
  let shell: IfcOpenShell;

  beforeAll(async () => {
    shell = await createInstance();
  });

  it('lists setting names', async () => {
    await using geomSettings = new settings();
    const names = geomSettings.settingNames();
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((name) => typeof name === 'string')).toBe(true);
  });

  it('sets and gets values through the public settings API', async () => {
    await using geomSettings = new settings();
    geomSettings.set('weld-vertices', true);
    expect(geomSettings.get('weld-vertices')).toBe(true);

    geomSettings.set('mesher-linear-deflection', 0.0125);
    expect(geomSettings.get('mesher-linear-deflection')).toBeCloseTo(0.0125, 6);
  });

  it('reads enum option settings as ints (iterator-output)', async () => {
    await using geomSettings = new settings();
    expect(geomSettings.getType('iterator-output')).toMatch(/IteratorOutputOptions/i);
    expect(geomSettings.get('iterator-output')).toBe(0);
  });

  it('accepts an explicit shell override', async () => {
    await using geomSettings = new settings(shell);
    expect(geomSettings.settingNames().length).toBeGreaterThan(0);
  });

  it('dispose is idempotent and guards released handles', async () => {
    const geomSettings = new settings();
    geomSettings.dispose();
    geomSettings.dispose();
    expect(() => geomSettings.settingNames()).toThrow(IfcOpenShellError);
  });
});

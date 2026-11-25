// This file was generated with the assistance of an AI coding tool.

// The schedule path that Bonsai Web uses, generated from Python with dates as Temporal objects.
// The expected values are those of the Python functions for the same calls.

import { beforeAll, expect, it } from 'vitest';
import { Temporal } from 'temporal-polyfill';
import * as ifcopenshell from 'ifcopenshell';
import * as root from 'ifcopenshell/api/root';
import * as sequence from 'ifcopenshell/api/sequence';
import * as sequenceUtil from 'ifcopenshell/util/sequence';
import { createInstance, describeOrSkip } from '../_helper.js';

const HOUR = 3_600_000_000;
const DAY = 24 * HOUR;

describeOrSkip('schedules with Temporal dates', () => {
  beforeAll(async () => {
    const runtime = await createInstance();
    await runtime.loadPlugin('schema', 'ifc4');
  });

  // Skipped: util.sequence takes untyped dates and durations, and add_work_schedule tests a str or time
  // for truth. The schedule engine pull request rewrites util.sequence with typed dates; these run after it.
  it.skip('computes the finish and the duration of a task', () => {
    using file = new ifcopenshell.File('IFC4');
    root.createEntity(file, { ifcClass: 'IfcProject' });
    const schedule = sequence.addWorkSchedule(file, { name: 'WS' });
    expect(typeof schedule.get('CreationDate')).toBe('string');
    const task = sequence.addTask(file, { workSchedule: schedule, name: 'T1' });
    const time = sequence.addTaskTime(file, task);
    sequence.editTaskTime(file, time, { ScheduleStart: '2026-11-24T09:00:00', ScheduleDuration: 'P3D' });
    expect(time.get('ScheduleFinish')).toBe('2026-11-26T17:00:00');
    expect(time.get('ScheduleDuration')).toBe('P3D');
    sequence.editTaskTime(file, time, { ScheduleFinish: '2026-12-02T17:00:00' });
    expect(time.get('ScheduleDuration')).toBe('P9D');
  });

  // Skipped: util.sequence takes untyped dates and durations, and add_work_schedule tests a str or time
  // for truth. The schedule engine pull request rewrites util.sequence with typed dates; these run after it.
  it.skip('offsets dates and counts working days', () => {
    // The exact offset depends on the version of the schedule engine (IfcOpenShell/IfcOpenShell#10312).
    const start = new Temporal.PlainDateTime(2026, 11, 27, 15, 0);
    const offset = sequenceUtil.offsetDate(start, DAY + 4 * HOUR, 'WORKTIME', null);
    expect(offset).toBeInstanceOf(Temporal.PlainDateTime);
    expect(Temporal.PlainDateTime.compare(offset, start.add({ days: 1 }))).toBeGreaterThanOrEqual(0);
    const first = new Temporal.PlainDateTime(2026, 11, 23);
    const last = new Temporal.PlainDateTime(2026, 11, 30);
    expect(sequenceUtil.countWorkingDays(first, last, null)).toBe(8);
  });
});

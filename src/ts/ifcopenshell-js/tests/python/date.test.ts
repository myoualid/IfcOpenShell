// This file was generated with the assistance of an AI coding tool.

// util.date (written by hand with Temporal) and the date arithmetic of generated code. The expected
// values are those that Python ifcopenshell.util.date and isodate give for the same input.

import { expect, it, describe } from 'vitest';
import * as date from 'ifcopenshell/util/date';
import { Temporal } from 'temporal-polyfill';

const HOUR = 3_600_000_000;
const DAY = 24 * HOUR;

describe('util.date with Temporal', () => {
  it('parses ISO 8601 and loose durations', () => {
    expect(date.parseDuration('P1D')).toBe(DAY);
    expect(date.parseDuration('PT8H')).toBe(8 * HOUR);
    expect(date.parseDuration('P1DT2H30M')).toBe(95_400_000_000);
    expect(date.parseDuration('P2W')).toBe(14 * DAY);
    expect(date.parseDuration('PT1.5S')).toBe(1_500_000);
    expect(date.parseDuration('P1Y2M3D')).toEqual({ years: 1, months: 2, tdelta: 3 * DAY });
    expect(date.parseDuration('P0D')).toBe(0);
    expect(date.parseDuration('PT2500H')).toBe(2500 * HOUR);
    expect(date.parseDuration('-P1D')).toBe(-DAY);
    expect(date.parseDuration('P1.5D')).toBe(1.5 * DAY);
    expect(date.parseDuration('5d 4h')).toBe(5 * DAY + 4 * HOUR);
    expect(date.parseDuration('2h30min')).toBe(2.5 * HOUR);
    expect(date.parseDuration('3 days')).toBeNull();
  });

  it('writes IFC durations and dates', () => {
    expect(date.datetime2ifc(DAY + 2 * HOUR, 'IfcDuration')).toBe('P1DT2H');
    expect(date.datetime2ifc(0, 'IfcDuration')).toBe('P0D');
    expect(date.datetime2ifc(1_500_000, 'IfcDuration')).toBe('PT1.5S');
    expect(date.datetime2ifc(-26 * HOUR, 'IfcDuration')).toBe('-P1DT2H');
    expect(date.datetime2ifc(10 * DAY + 300_000_000, 'IfcDuration')).toBe('P10DT5M');
    expect(date.datetime2ifc(1, 'IfcDuration')).toBe('PT0.000001S');
    expect(date.datetime2ifc({ years: 1, months: 2, tdelta: 3 * DAY }, 'IfcDuration')).toBe('P1Y2M3D');
    const at = new Temporal.PlainDateTime(2026, 11, 24, 8, 30, 0);
    expect(date.datetime2ifc(at, 'IfcDateTime')).toBe('2026-11-24T08:30:00');
    expect(date.datetime2ifc(new Temporal.PlainDateTime(2026, 11, 24, 8, 30, 0, 0, 5), 'IfcDateTime')).toBe('2026-11-24T08:30:00.000005');
    expect(date.datetime2ifc(new Temporal.PlainDate(2026, 11, 24), 'IfcDateTime')).toBe('2026-11-24T00:00:00');
    expect(date.datetime2ifc(at, 'IfcDate')).toBe('2026-11-24');
    expect(date.datetime2ifc(new Temporal.PlainDateTime(2026, 11, 24, 8, 30, 15), 'IfcTime')).toBe('08:30:15');
    expect(date.datetime2ifc('2026-11-24T08:00:00', 'IfcDate')).toBe('2026-11-24');
    expect(date.datetime2ifc(new Temporal.PlainDate(2026, 11, 24), 'IfcCalendarDate')).toEqual({ DayComponent: 24, MonthComponent: 11, YearComponent: 2026 });
    expect(date.datetime2ifc(null, 'IfcDate')).toBeNull();
  });

  it('reads IFC dates and helpers', () => {
    expect(String(date.ifc2datetime('2026-11-24T08:30:00'))).toBe('2026-11-24T08:30:00');
    expect(date.ifc2datetime('2026-11-24')).toBeInstanceOf(Temporal.PlainDate);
    expect(String(date.ifc2datetime('08:30:00'))).toBe('08:30:00');
    expect(date.ifc2datetime('P1D')).toBe(DAY);
    expect(date.stringToDuration('2d 3h 15m 10s')).toBe('P2DT3H15M10S');
    expect(date.canonicaliseTime(new Temporal.PlainDateTime(2026, 11, 4, 8, 0))).toBe('04/11/26');
    expect(String(date.stringToDate('2026-11-24T08:00:00'))).toBe('2026-11-24T08:00:00');
    expect(date.readableIfcDuration('P1DT2H')).toBe('1D 2h');
  });
});

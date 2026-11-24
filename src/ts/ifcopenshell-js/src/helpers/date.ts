// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// util.date functions that use isodate, dateutil or datetime formatting in Python, written by hand
// with Temporal. The generated util/date re-exports them (see `hand_written` in src/transpiler/ts.yaml).
// A day-time duration is a number of microseconds (see dates.ts). A duration with years or months is
// { years, months, tdelta }, as isodate.Duration.

import type { EntityInstance } from '../entity_instance.js';
import { MICROSECONDS_PER_DAY, Temporal, combine, isoformat } from './dates.js';

/** A duration with calendar years or months, as isodate.Duration. */
export interface CalendarDuration {
  years: number;
  months: number;
  tdelta: number;
}

export type Duration = number | CalendarDuration;

type DateValue = Temporal.PlainDate | Temporal.PlainDateTime | Temporal.PlainTime;

const ISO_DURATION =
  /^([+-])?P(?:(\d+(?:[.,]\d+)?)Y)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)W)?(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;

function parseIsoDuration(text: string): Duration {
  const match = ISO_DURATION.exec(text);
  if (!match || text.endsWith('T') || text === 'P') throw new SyntaxError(`Invalid ISO 8601 duration: ${text}`);
  const value = (i: number) => (match[i] ? Number(match[i]!.replace(',', '.')) : 0);
  const sign = match[1] === '-' ? -1 : 1;
  const tdelta = sign * Math.round(
    ((value(4) * 7 + value(5)) * 24 * 3600 + value(6) * 3600 + value(7) * 60 + value(8)) * 1e6,
  );
  const years = sign * value(2);
  const months = sign * value(3);
  return years || months ? { years, months, tdelta } : tdelta;
}

/** A duration from ISO 8601 text, or from loose text such as "5d 4h"; null when it cannot be read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a number or a CalendarDuration, as in Python
export function parseDuration(value: string | null | undefined): any {
  if (!value) return null;
  if (value.includes('P')) {
    try {
      return parseIsoDuration(value);
    } catch {
      return null;
    }
  }
  // Loose text: keep the digits and the unit letters, as the Python code does.
  let result = 'P';
  const upper = value.toUpperCase();
  const time = () => {
    if (!result.includes('T')) result = result.slice(0, 1) + 'T' + result.slice(1);
  };
  for (const char of upper) {
    if (/\d/.test(char)) result += char;
    else if (char === 'D') {
      result += 'D';
      if (upper.includes('H') || upper.includes('S') || upper.includes('MIN')) result += 'T';
    } else if (char === 'W' || char === 'M' || char === 'Y') result += char;
    else if (char === 'H' || char === 'S') {
      time();
      result += char;
    }
  }
  try {
    return parseIsoDuration(result);
  } catch {
    return null;
  }
}

/** The duration unchanged: in TS a duration has one form already (see isodate.Duration in Python). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as parseDuration
export function timedelta2duration(timedelta: Duration): any {
  return timedelta;
}

/** ISO 8601 text of a duration, as isodate.duration_isoformat. */
export function durationIsoformat(duration: Duration): string {
  const { years, months, tdelta } = typeof duration === 'number' ? { years: 0, months: 0, tdelta: duration } : duration;
  const negative = tdelta < 0 || (tdelta === 0 && (years < 0 || months < 0));
  const sign = negative ? -1 : 1;
  const rest = Math.abs(tdelta);
  const days = Math.floor(rest / MICROSECONDS_PER_DAY);
  const inDay = rest - days * MICROSECONDS_PER_DAY;
  const hours = Math.floor(inDay / 3_600_000_000);
  const minutes = Math.floor((inDay - hours * 3_600_000_000) / 60_000_000);
  const micro = inDay - hours * 3_600_000_000 - minutes * 60_000_000;
  const seconds = micro % 1_000_000 ? (micro / 1e6).toFixed(6).replace(/0+$/, '') : String(micro / 1e6);
  let text = 'P';
  if (years) text += `${sign * years}Y`;
  if (months) text += `${sign * months}M`;
  if (days) text += `${days}D`;
  if (hours || minutes || micro) {
    text += 'T';
    if (hours) text += `${hours}H`;
    if (minutes) text += `${minutes}M`;
    if (micro) text += `${seconds}S`;
  }
  if (text === 'P') text = 'P0D';
  return negative ? `-${text}` : text;
}

/** A date, time, datetime or duration from IFC text, a timestamp or an IfcDateAndTime/IfcCalendarDate. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the type depends on the IFC value, as in Python
export function ifc2datetime(element: string | number | EntityInstance): any {
  if (typeof element === 'string') {
    if (element.slice(0, 2).includes('P')) return parseDuration(element);
    if (element.length > 3 && element[2] === ':') return Temporal.PlainTime.from(element);
    if (element.includes(':')) return Temporal.PlainDateTime.from(element);
    return Temporal.PlainDate.from(element);
  }
  if (typeof element === 'number') {
    // A timestamp is read in the local time zone, as Python datetime.fromtimestamp.
    return Temporal.Instant.fromEpochMilliseconds(element * 1000).toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDateTime();
  }
  if (element.isA('IfcDateAndTime')) {
    const day = element.get('DateComponent') as EntityInstance;
    const time = element.get('TimeComponent') as EntityInstance;
    return new Temporal.PlainDateTime(
      day.get('YearComponent') as number, day.get('MonthComponent') as number, day.get('DayComponent') as number,
      time.get('HourComponent') as number, time.get('MinuteComponent') as number, Math.trunc(time.get('SecondComponent') as number),
    );
  }
  if (element.isA('IfcCalendarDate')) {
    return new Temporal.PlainDate(element.get('YearComponent') as number, element.get('MonthComponent') as number, element.get('DayComponent') as number);
  }
  return undefined;
}

type IfcDateType = 'IfcDuration' | 'IfcTimeStamp' | 'IfcDateTime' | 'IfcDate' | 'IfcTime' | 'IfcCalendarDate' | 'IfcLocalTime';

/** The IFC value of a date, time, datetime or duration. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the type depends on ifcType, as in Python
export function datetime2ifc(dt: DateValue | Duration | string | null | undefined, ifcType: IfcDateType | string): any {
  let value = dt;
  if (typeof value === 'string') {
    if (ifcType === 'IfcDuration') return value;
    try {
      value = Temporal.PlainDateTime.from(value);
    } catch {
      value = Temporal.PlainTime.from(value);
    }
  } else if (value === null || value === undefined) {
    return null;
  }
  if (ifcType === 'IfcDuration') return durationIsoformat(value as Duration);
  const isDateTime = value instanceof Temporal.PlainDateTime;
  const isDate = value instanceof Temporal.PlainDate;
  const isTime = value instanceof Temporal.PlainTime;
  if (ifcType === 'IfcTimeStamp' && isDateTime) {
    return Math.trunc((value as Temporal.PlainDateTime).toZonedDateTime(Temporal.Now.timeZoneId()).epochMilliseconds / 1000);
  }
  if (ifcType === 'IfcDateTime') {
    if (isDateTime) return isoformat(value as Temporal.PlainDateTime);
    if (isDate) return isoformat(combine(value as Temporal.PlainDate));
  } else if (ifcType === 'IfcDate') {
    if (isDateTime) return (value as Temporal.PlainDateTime).toPlainDate().toString();
    if (isDate) return (value as Temporal.PlainDate).toString();
  } else if (ifcType === 'IfcTime') {
    if (isDateTime) return isoformat((value as Temporal.PlainDateTime).toPlainTime());
    if (isTime) return isoformat(value as Temporal.PlainTime);
  } else if (ifcType === 'IfcCalendarDate' && (isDate || isDateTime)) {
    const day = value as Temporal.PlainDate;
    return { DayComponent: day.day, MonthComponent: day.month, YearComponent: day.year };
  } else if (ifcType === 'IfcLocalTime' && (isTime || isDateTime)) {
    const time = value as Temporal.PlainTime;
    return { HourComponent: time.hour, MinuteComponent: time.minute, SecondComponent: time.second };
  }
  throw new TypeError(`Unsupported ifc_type for conversion from datetime.datetime = ${ifcType}, value = ${String(value)}`);
}

/** A datetime from ISO 8601 text, or null. Python also tries a fuzzy, day-first parse; TS reads ISO 8601 only. */
export function stringToDate(text: string | null | undefined): Temporal.PlainDateTime | null {
  if (!text) return null;
  try {
    return Temporal.PlainDateTime.from(text);
  } catch {
    try {
      return Temporal.PlainDate.from(text).toPlainDateTime();
    } catch {
      return null;
    }
  }
}

/** An ISO 8601 duration from text such as "2d 3h 15m 10s". */
export function stringToDuration(durationString: string): string {
  const read = (unit: string) => {
    const match = new RegExp(`(\\d+\\.?\\d*)${unit}`).exec(durationString);
    return match ? Number(match[1]) : 0;
  };
  const total = Math.round((((read('d') * 24 + read('h')) * 60 + read('m')) * 60 + read('s')) * 1e6);
  return durationIsoformat(total);
}

/** dd/mm/yy, or "-" for no date. */
export function canonicaliseTime(time: Temporal.PlainDateTime | Temporal.PlainDate | null | undefined): string {
  if (!time) return '-';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(time.day)}/${pad(time.month)}/${pad(time.year % 100)}`;
}

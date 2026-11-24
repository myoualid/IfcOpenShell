// This file was generated with the assistance of an AI coding tool.
// SPDX-License-Identifier: LGPL-3.0-or-later

// Dates of generated code. Python naive datetime, date and time are Temporal.PlainDateTime,
// PlainDate and PlainTime. A Python timedelta is a number of microseconds, so duration
// arithmetic (+, -, *, abs, max, sum, comparisons) is plain number arithmetic.

import { Temporal } from 'temporal-polyfill';

export { Temporal };

/** A date or a date with a time, as Python date and datetime. */
export type DateLike = Temporal.PlainDate | Temporal.PlainDateTime;

export const MICROSECONDS_PER_DAY = 86_400_000_000;

/** A duration in microseconds, as Python timedelta(...). */
export function timedelta(parts: {
  weeks?: number; days?: number; hours?: number; minutes?: number;
  seconds?: number; milliseconds?: number; microseconds?: number;
} = {}): number {
  const { weeks = 0, days = 0, hours = 0, minutes = 0, seconds = 0, milliseconds = 0, microseconds = 0 } = parts;
  return Math.round(((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds) * 1e6 + milliseconds * 1e3 + microseconds);
}

/** timedelta.days: whole days, rounded down as Python does for negative durations. */
export function days(duration: number): number {
  return Math.floor(duration / MICROSECONDS_PER_DAY);
}

/** timedelta.seconds: the seconds after the whole days. */
export function seconds(duration: number): number {
  return Math.floor((duration - days(duration) * MICROSECONDS_PER_DAY) / 1e6);
}

/** timedelta.microseconds: the microseconds after the whole seconds. */
export function microseconds(duration: number): number {
  return duration - Math.floor(duration / 1e6) * 1e6;
}

/** The current local date and time, as Python datetime.now(). */
export function now(): Temporal.PlainDateTime {
  return Temporal.Now.plainDateTimeISO();
}

/** A date, as Python date(year, month, day). */
export function date(year: number, month: number, day: number): Temporal.PlainDate {
  return new Temporal.PlainDate(year, month, day);
}

/** A time, as Python time(hour, minute, second, microsecond). */
export function time(hour = 0, minute = 0, second = 0, microsecond = 0): Temporal.PlainTime {
  return new Temporal.PlainTime(hour, minute, second, Math.floor(microsecond / 1000), microsecond % 1000);
}

/** A date and a time, as Python datetime(...). */
export function datetime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, microsecond = 0): Temporal.PlainDateTime {
  return new Temporal.PlainDateTime(year, month, day, hour, minute, second, Math.floor(microsecond / 1000), microsecond % 1000);
}

/** datetime.combine(date, time). */
export function combine(day: DateLike, at: Temporal.PlainTime = time()): Temporal.PlainDateTime {
  // Python accepts a datetime as the date part, as a datetime is a date.
  return (day instanceof Temporal.PlainDateTime ? day.toPlainDate() : day).toPlainDateTime(at);
}

/** A date with a time, or a date alone, from ISO 8601 text: datetime.fromisoformat / date.fromisoformat. */
export function fromIsoDateTime(text: string): Temporal.PlainDateTime {
  return Temporal.PlainDateTime.from(text);
}

export function fromIsoDate(text: string): Temporal.PlainDate {
  return Temporal.PlainDate.from(text);
}

/** value + duration. A date moves by whole days, as Python date + timedelta does. */
export function add<T extends DateLike>(value: T, duration: number): T {
  if (value instanceof Temporal.PlainDate) return value.add({ days: days(duration) }) as T;
  return value.add({ microseconds: duration }) as T;
}

/** value - duration. */
export function subtract<T extends DateLike>(value: T, duration: number): T {
  return add(value, -duration);
}

/** a - b in microseconds, as Python datetime - datetime (or date - date). */
export function between(a: DateLike, b: DateLike): number {
  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return b.until(a, { largestUnit: 'days' }).days * MICROSECONDS_PER_DAY;
  const toDateTime = (v: DateLike) => (v instanceof Temporal.PlainDate ? v.toPlainDateTime() : v);
  return toDateTime(b).until(toDateTime(a), { largestUnit: 'hours' }).total({ unit: 'microseconds' });
}

/** The datetime in the local time zone, as Python datetime.astimezone() of a naive datetime. */
export function astimezone(value: Temporal.PlainDateTime): Temporal.ZonedDateTime {
  return value.toZonedDateTime(Temporal.Now.timeZoneId());
}

/** a - b when the type of b is not known: a date moved back by a duration, or the duration between two dates. */
export function minus(a: DateLike, b: DateLike): number;
export function minus(a: DateLike, b: number): DateLike;
export function minus(a: DateLike, b: DateLike | number): DateLike | number;
export function minus(a: DateLike, b: DateLike | number): DateLike | number {
  return typeof b === 'number' ? subtract(a, b) : between(a, b);
}

/** -1, 0 or 1, as Python compares two dates or two datetimes. */
export function compare(a: DateLike, b: DateLike): number {
  if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate) return Temporal.PlainDate.compare(a, b);
  if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime) return Temporal.PlainDateTime.compare(a, b);
  throw new TypeError("can't compare datetime.datetime to datetime.date");
}

/** date.weekday(): Monday is 0. */
export function weekday(value: DateLike): number {
  return value.dayOfWeek - 1;
}

/** The ISO 8601 text of a date, time or datetime, as Python isoformat(). */
export function isoformat(value: DateLike | Temporal.PlainTime | Temporal.ZonedDateTime): string {
  if (value instanceof Temporal.PlainDate) return value.toString();
  if (value instanceof Temporal.ZonedDateTime) {
    return value.toString({ timeZoneName: 'never', fractionalSecondDigits: value.millisecond || value.microsecond ? 6 : 0 });
  }
  // Python writes six fraction digits when there are microseconds, else none.
  return value.toString({ fractionalSecondDigits: value.millisecond || value.microsecond ? 6 : 0 });
}

/** "just now", "20m ago", "3h ago", "2d ago". */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Program times are typed as wall-clock times ("2026-12-01T15:00") with no zone. They are read and
 * shown in one fixed zone so the server, the browser and the edit form always agree.
 * Set APP_TIMEZONE to an IANA name (e.g. "Asia/Kathmandu"); the default is UTC.
 */
export function appTimeZone(): string {
  const tz = process.env.APP_TIMEZONE?.trim();
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Wall-clock parts of an instant in a zone. */
function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

const offsetMs = (date: Date, timeZone: string) => {
  const p = zoneParts(date, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(date.getTime() / 1000) * 1000
  );
};

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** "2026-12-01T15:00" read in `timeZone`. Strings that already carry a zone use `new Date`. */
export function parseZoned(text: string, timeZone: string = appTimeZone()): Date {
  const m = NAIVE.exec(text.trim());
  if (!m) return new Date(text);
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0));
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(wall - offsetMs(new Date(wall), timeZone));
  guess = new Date(wall - offsetMs(guess, timeZone)); // settle across a DST change
  return guess;
}

/** An instant as "YYYY-MM-DDTHH:mm" in `timeZone`, for <input type="datetime-local">. */
export function toZonedInput(iso: string | Date, timeZone: string = appTimeZone()): string {
  const p = zoneParts(new Date(iso), timeZone);
  const n = (v: number, w = 2) => String(v).padStart(w, '0');
  return `${n(p.year, 4)}-${n(p.month)}-${n(p.day)}T${n(p.hour)}:${n(p.minute)}`;
}

/** "Mon, Dec 1, 3:00 PM – 5:00 PM UTC": a program's time range in the app's zone, zone named. */
export function formatWhen(start: Date, end: Date, timeZone: string) {
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
  const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
  const clockZone = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
  const sameDay = day.format(start) === day.format(end);
  return sameDay
    ? `${day.format(start)}, ${clock.format(start)} – ${clockZone.format(end)}`
    : `${day.format(start)}, ${clock.format(start)} – ${day.format(end)}, ${clockZone.format(end)}`;
}

/** "12 of 20 places taken", or "12 registered · open access". A count only, never names. */
export function placesLine(registered: number, capacity: number | null) {
  return capacity === null
    ? `${registered} registered · open access`
    : `${registered} of ${capacity} places taken`;
}

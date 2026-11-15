/**
 * Recorded-shape replies for the flood route's upstream services, built in code so the dates
 * line up with a fixed "today". The shapes follow real replies:
 *  - GEOGloWS v2 getriverid:         { river_id: 441090123 }
 *  - GEOGloWS v2 retrospectivedaily: { "<id>": [flows...], datetime: ["1984-01-01T00:00:00+00:00", ...] }
 *  - GEOGloWS v2 forecaststats:      { datetime: [...3-hourly], flow_min, flow_25p, flow_med, flow_75p,
 *                                      flow_max, ... } with gaps written as ""
 *  - Open-Meteo flood:               { latitude, longitude, daily: { time, river_discharge } } (array
 *                                      for several points)
 */

export const RIVER_ID = 441090123;

function* daysFrom(start: string, end: string) {
  const d = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (d <= stop) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** A seasonal river around 100 m3/s with a different wet-season peak every year. */
export function dailyFlow(day: string): number {
  const d = new Date(`${day}T00:00:00Z`);
  const year = d.getUTCFullYear();
  const doy = (d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000;
  const season = Math.max(0, Math.sin(((doy - 120) / 365) * 2 * Math.PI));
  const peak = 150 + ((year * 37) % 11) * 25;
  return Math.round((60 + season * peak) * 100) / 100;
}

export function geoglowsRiverId(id = RIVER_ID) {
  return { river_id: id };
}

export function geoglowsRetrospective(startYmd: string, endYmd: string, id = RIVER_ID) {
  const days = [...daysFrom(startYmd, endYmd)];
  return {
    [String(id)]: days.map(dailyFlow),
    datetime: days.map((d) => `${d}T00:00:00+00:00`),
  };
}

export function geoglowsForecastStats(todayYmd: string, days = 15) {
  const datetime: string[] = [];
  const med: (number | string)[] = [];
  const min: (number | string)[] = [];
  const max: (number | string)[] = [];
  const p25: (number | string)[] = [];
  const p75: (number | string)[] = [];
  const start = new Date(`${todayYmd}T00:00:00Z`);
  for (let h = 0; h < days * 24; h += 3) {
    const t = new Date(start.getTime() + h * 3_600_000);
    datetime.push(t.toISOString().replace('.000Z', '+00:00'));
    const base = dailyFlow(t.toISOString().slice(0, 10));
    const gap = h === 6; // one empty step, as the service sends
    med.push(gap ? '' : base);
    min.push(gap ? '' : base * 0.8 - (h % 24));
    max.push(gap ? '' : base * 1.3 + (h % 24));
    p25.push(gap ? '' : base * 0.9);
    p75.push(gap ? '' : base * 1.1);
  }
  return {
    datetime,
    flow_min: min,
    flow_25p: p25,
    flow_med: med,
    flow_75p: p75,
    flow_max: max,
    high_res: datetime.map(() => ''),
  };
}

export function openMeteoCell(lat: number, lng: number, startYmd: string, endYmd: string) {
  const time = [...daysFrom(startYmd, endYmd)];
  return {
    latitude: lat,
    longitude: lng,
    daily_units: { time: 'iso8601', river_discharge: 'm³/s' },
    daily: { time, river_discharge: time.map(dailyFlow) },
  };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

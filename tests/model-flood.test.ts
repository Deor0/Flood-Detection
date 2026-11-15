import { describe, expect, it } from 'vitest';
import {
  floodUrl,
  neighbourCoordinates,
  parseFloodResponse,
  pickRiverCell,
} from '@/model/openMeteo';

describe('Open-Meteo flood client', () => {
  it('builds a discharge URL and a 3 by 3 neighbourhood with the click first', () => {
    const url = new URL(floodUrl({ lat: 27.7, lng: 85.32, forecastDays: 16 }));
    expect(url.origin + url.pathname).toBe('https://flood-api.open-meteo.com/v1/flood');
    expect(url.searchParams.get('daily')).toBe('river_discharge');
    expect(url.searchParams.get('latitude')).toBe('27.7');
    expect(url.searchParams.get('longitude')).toBe('85.32');
    expect(url.searchParams.get('forecast_days')).toBe('16');

    const many = new URL(floodUrl({ lat: [1, 2], lng: [3, 4] }));
    expect(many.searchParams.get('latitude')).toBe('1,2');
    expect(many.searchParams.get('longitude')).toBe('3,4');

    const neighbours = neighbourCoordinates(10, 20);
    expect(neighbours).toHaveLength(9);
    expect(neighbours[0]).toEqual({ lat: 10, lng: 20 });
    expect(neighbours).toContainEqual({ lat: 10.05, lng: 20.05 });
    expect(neighbours).toContainEqual({ lat: 9.95, lng: 19.95 });
  });

  it('keeps null discharge and throws on an API error', () => {
    const one = parseFloodResponse({
      latitude: 1,
      longitude: 2,
      daily: { time: ['2020-01-01', '2020-01-02'], river_discharge: [1.5, null] },
    });
    expect(one).toEqual([
      { lat: 1, lng: 2, days: ['2020-01-01', '2020-01-02'], discharge: [1.5, null] },
    ]);
    expect(() => parseFloodResponse({ error: true, reason: 'No data' })).toThrow(/No data/);
  });

  it('picks the river cell with the largest mean, then the nearest, and none when every cell is empty', () => {
    const click = { lat: 0, lng: 0 };
    const strong = { lat: 0.05, lng: 0, discharge: [0, 10, 10] };
    const weak = { lat: 0, lng: 0, discharge: [1, 1, 1] };
    expect(pickRiverCell([weak, strong], click)).toEqual(strong);

    const east = { lat: 0, lng: 0.05, discharge: [4, 4] };
    const west = { lat: 0, lng: -0.05, discharge: [4, 4] };
    expect(pickRiverCell([east, west], { lat: 0, lng: 0.04 })).toBe(east);

    expect(pickRiverCell([{ lat: 0, lng: 0, discharge: [null, 0, null] }], click)).toBeNull();
  });
});

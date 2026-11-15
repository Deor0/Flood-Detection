"""Request validation and the cache key. Pure Python, no GIS libraries, so it is easy to test."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime

MAX_BOX_KM = 20.0
MIN_RES, MAX_RES, DEFAULT_RES = 30.0, 200.0, 100.0
MIN_HOURS, MAX_HOURS = 1, 72


class InvalidRequest(ValueError):
    pass


@dataclass(frozen=True)
class SimulateRequest:
    bbox: tuple[float, float, float, float]  # west, south, east, north (degrees)
    lat: float
    lng: float
    times: tuple[str, ...]  # ISO 8601, ascending
    discharge: tuple[float, ...]  # m3/s
    hours: int
    resolution: float  # metres

    def cache_key(self) -> str:
        """Same normalized request, same key. Coordinates are rounded to about 1 m."""
        payload = {
            "bbox": [round(v, 5) for v in self.bbox],
            "lat": round(self.lat, 5),
            "lng": round(self.lng, 5),
            "times": list(self.times),
            "discharge": [round(v, 3) for v in self.discharge],
            "hours": self.hours,
            "resolution": round(self.resolution, 1),
        }
        raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _num(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise InvalidRequest(f"{name} must be a finite number")
    return float(value)


def box_size_km(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    west, south, east, north = bbox
    mid = math.radians((south + north) / 2)
    return (east - west) * 111.32 * math.cos(mid), (north - south) * 110.574


def parse_request(body: object) -> SimulateRequest:
    if not isinstance(body, dict):
        raise InvalidRequest("body must be a JSON object")

    bbox_raw = body.get("bbox")
    if not isinstance(bbox_raw, list) or len(bbox_raw) != 4:
        raise InvalidRequest("bbox must be [west, south, east, north]")
    west, south, east, north = (_num(v, "bbox") for v in bbox_raw)
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
        raise InvalidRequest("bbox is out of range or inverted")
    bbox = (west, south, east, north)
    width_km, height_km = box_size_km(bbox)
    if width_km > MAX_BOX_KM + 0.01 or height_km > MAX_BOX_KM + 0.01:
        raise InvalidRequest(f"bbox is larger than {MAX_BOX_KM:g} x {MAX_BOX_KM:g} km")

    inflow = body.get("inflow")
    if not isinstance(inflow, dict):
        raise InvalidRequest("inflow is required")
    lat = _num(inflow.get("lat"), "inflow.lat")
    lng = _num(inflow.get("lng"), "inflow.lng")
    if not (west <= lng <= east and south <= lat <= north):
        raise InvalidRequest("inflow point must be inside the bbox")

    times_raw, dis_raw = inflow.get("times"), inflow.get("discharge")
    if not isinstance(times_raw, list) or not isinstance(dis_raw, list):
        raise InvalidRequest("inflow.times and inflow.discharge must be arrays")
    if len(times_raw) != len(dis_raw):
        raise InvalidRequest("inflow.times and inflow.discharge differ in length")
    if len(times_raw) < 2:
        raise InvalidRequest("the hydrograph needs at least 2 values")
    parsed_times: list[datetime] = []
    for t in times_raw:
        if not isinstance(t, str):
            raise InvalidRequest("inflow.times must be ISO strings")
        try:
            parsed_times.append(datetime.fromisoformat(t.replace("Z", "+00:00")))
        except ValueError as exc:
            raise InvalidRequest(f"bad time: {t}") from exc
    if any(b <= a for a, b in zip(parsed_times, parsed_times[1:])):
        raise InvalidRequest("inflow.times must be strictly ascending")
    discharge = tuple(_num(v, "inflow.discharge") for v in dis_raw)
    if any(v < 0 for v in discharge):
        raise InvalidRequest("discharge must be >= 0")

    hours_raw = _num(body.get("hours"), "hours")
    if hours_raw != int(hours_raw) or not (MIN_HOURS <= hours_raw <= MAX_HOURS):
        raise InvalidRequest(f"hours must be a whole number from {MIN_HOURS} to {MAX_HOURS}")

    res_raw = body.get("resolution", DEFAULT_RES)
    resolution = _num(res_raw, "resolution")
    if not (MIN_RES <= resolution <= MAX_RES):
        raise InvalidRequest(f"resolution must be {MIN_RES:g} to {MAX_RES:g} m")

    return SimulateRequest(
        bbox=bbox,
        lat=lat,
        lng=lng,
        times=tuple(t.isoformat() for t in parsed_times),
        discharge=discharge,
        hours=int(hours_raw),
        resolution=resolution,
    )

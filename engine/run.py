"""Runs SFINCS on a built model and turns the maximum depth into a map image for Leaflet."""

from __future__ import annotations

import json
import math
import os
import subprocess
import time

import numpy as np
from netCDF4 import Dataset
from PIL import Image
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject

from build import Model, build_model, write_inputs
from validate import SimulateRequest

RUNS_DIR = os.environ.get("RUNS_DIR", "/tmp/runs")
SFINCS_BIN = os.environ.get("SFINCS_BIN", "sfincs")
TIMEOUT_S = int(os.environ.get("SFINCS_TIMEOUT", "180"))
WET_M = 0.05  # depths at or below this are drawn as dry
FLOODED_M = 0.1  # depth counted towards the flooded area
HOLLOW_M = 1.0  # ground raised more than this when filling counts as a closed hollow

# Same ramp as src/app/dashboard/ramp.ts.
RAMP_SHALLOW = np.array([25, 195, 232], dtype="float64")
RAMP_DEEP = np.array([8, 42, 92], dtype="float64")

ATTRIBUTION = (
    "Flood model: SFINCS (Deltares, GPL-3.0). Elevation: Copernicus GLO-30 DEM. "
    "Land cover: ESA WorldCover 2021."
)


class EngineTimeout(RuntimeError):
    pass


def run_dir(key: str) -> str:
    return os.path.join(RUNS_DIR, key)


def cached(key: str) -> dict | None:
    path = os.path.join(run_dir(key), "result.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def _read_hmax(folder: str) -> np.ndarray:
    """Max depth (rows south to north, as SFINCS writes them), NaN where never wet."""
    with Dataset(os.path.join(folder, "sfincs_map.nc")) as nc:
        if "hmax" in nc.variables:
            h = np.array(nc.variables["hmax"][:], dtype="float64")
        else:
            zs = np.array(nc.variables["zsmax"][:], dtype="float64")
            zb = np.array(nc.variables["zb"][:], dtype="float64")
            h = zs - zb
    if h.ndim == 3:
        h = np.nanmax(h, axis=0)
    h[~np.isfinite(h)] = 0.0
    h[h < 0] = 0.0
    return h


def _to_web_mercator(depth_north_up: np.ndarray, model: Model, bbox) -> tuple[np.ndarray, list[float]]:
    """Warps depth onto a Web Mercator grid over the bbox so Leaflet can stretch it exactly."""
    west, south, east, north = bbox
    to_merc = Transformer.from_crs(4326, 3857, always_xy=True)
    (mx0, mx1), (my0, my1) = to_merc.transform([west, east], [south, north])
    # Keep about the model resolution on the ground.
    scale = 1 / math.cos(math.radians((south + north) / 2))
    px = model.grid.dx * scale
    width = max(1, round((mx1 - mx0) / px))
    height = max(1, round((my1 - my0) / px))
    out = np.zeros((height, width), dtype="float64")
    reproject(
        source=depth_north_up,
        destination=out,
        src_transform=model.grid.transform,
        src_crs=model.grid.crs,
        dst_transform=from_bounds(mx0, my0, mx1, my1, width, height),
        dst_crs=CRS.from_epsg(3857),
        resampling=Resampling.bilinear,
        src_nodata=np.nan,
        dst_nodata=0.0,
    )
    return out, [south, west, north, east]


def _cell_latlng(model: Model, rc: tuple[int, int]) -> dict:
    g = model.grid
    r, c = rc
    x = g.x0 + (c + 0.5) * g.dx
    y = g.y0 + (g.nmax - r - 0.5) * g.dx
    lng, lat = Transformer.from_crs(g.epsg, 4326, always_xy=True).transform(x, y)
    return {"lat": round(lat, 6), "lng": round(lng, 6)}


def _png(depth: np.ndarray, scale_max: float, path: str) -> None:
    t = np.clip(depth / scale_max, 0, 1)[..., None]
    rgb = RAMP_SHALLOW * (1 - t) + RAMP_DEEP * t
    alpha = np.where(depth > WET_M, 255, 0)[..., None]
    rgba = np.concatenate([rgb, alpha], axis=2).astype("uint8")
    Image.fromarray(rgba, "RGBA").save(path, optimize=True)


def simulate(req: SimulateRequest) -> dict:
    key = req.cache_key()
    hit = cached(key)
    if hit:
        return hit

    folder = run_dir(key)
    started = time.monotonic()
    model = build_model(req)
    write_inputs(model, req, folder)
    try:
        proc = subprocess.run(
            [SFINCS_BIN],
            cwd=folder,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise EngineTimeout("timeout") from exc
    with open(os.path.join(folder, "sfincs.log"), "w") as f:
        f.write(proc.stdout[-20000:])
        f.write(proc.stderr[-20000:])
    if proc.returncode != 0 or not os.path.exists(os.path.join(folder, "sfincs_map.nc")):
        raise RuntimeError(f"SFINCS failed (exit {proc.returncode})")

    depth = np.flipud(_read_hmax(folder))  # north-up
    wet = depth > FLOODED_M
    max_depth = float(depth.max()) if depth.size else 0.0
    p98 = float(np.percentile(depth[wet], 98)) if wet.any() else 1.0
    scale_max = max(1.0, math.ceil(p98))

    in_hollow = wet & (model.raised > HOLLOW_M)
    hollow_km2 = float(in_hollow.sum()) * model.grid.dx**2 / 1e6
    flooded_km2 = float(wet.sum()) * model.grid.dx**2 / 1e6
    warnings = []
    if not model.entry_traced:
        warnings.append(
            "The river's entry into the area could not be traced, so the water enters at the "
            "selected river point; the river upstream of it is not flooded."
        )
    if hollow_km2 >= 0.25 and hollow_km2 >= 0.2 * flooded_km2:
        warnings.append(
            f"{hollow_km2:.1f} km² of the flooded area lies in hollows the elevation data shows as "
            "closed, often because a narrow gorge, bridge or culvert is too small to see. Water "
            "there is drawn at its spill level, so depth and extent are less certain."
        )

    merc, bounds = _to_web_mercator(np.where(depth > 0, depth, np.nan), model, req.bbox)
    _png(merc, scale_max, os.path.join(folder, "maxdepth.png"))

    result = {
        "id": key,
        "bbox": list(req.bbox),
        "bounds": bounds,
        "width": int(merc.shape[1]),
        "height": int(merc.shape[0]),
        "resolution": req.resolution,
        "maxDepth": {"url": f"/runs/{key}/maxdepth.png", "scaleMax": scale_max},
        "stats": {
            "floodedKm2": round(flooded_km2, 3),
            "hollowKm2": round(hollow_km2, 3),
            "maxDepthM": round(max_depth, 2),
            "runSeconds": round(time.monotonic() - started, 1),
        },
        "inflow": {
            "lat": req.lat,
            "lng": req.lng,
            "peak": max(req.discharge),
            # Where the water was actually put in (where the river enters the box).
            "source": _cell_latlng(model, model.source_rc),
        },
        "warnings": warnings,
        "attribution": ATTRIBUTION,
    }
    with open(os.path.join(folder, "result.json"), "w") as f:
        json.dump(result, f)
    return result

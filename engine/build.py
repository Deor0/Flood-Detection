"""Builds a regular-grid SFINCS model for one request from public global data.

- Elevation: Copernicus GLO-30 DEM (public COGs on AWS, 1 degree tiles).
- Roughness: ESA WorldCover 2021 (public COGs on AWS, 3 degree tiles) mapped to Manning's n.
- River: D8 flow directions on the filled DEM (closed hollows raised to their spill level). The
  inflow goes in where the river enters the box, found by walking up the valley from the clicked
  river cell.
"""

from __future__ import annotations

import heapq
import math
import os
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.errors import RasterioIOError
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from validate import SimulateRequest

DEM_URL = (
    "https://copernicus-dem-30m.s3.amazonaws.com/"
    "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lng:03d}_00_DEM/"
    "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lng:03d}_00_DEM.tif"
)
LC_URL = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
    "ESA_WorldCover_10m_2021_v200_{ns}{lat:02d}{ew}{lng:03d}_Map.tif"
)

# ESA WorldCover class -> Manning's n (s/m^(1/3)), after common HydroMT-SFINCS tables.
MANNING = {
    10: 0.12,  # tree cover
    20: 0.05,  # shrubland
    30: 0.035,  # grassland
    40: 0.04,  # cropland
    50: 0.10,  # built-up
    60: 0.023,  # bare / sparse vegetation
    70: 0.02,  # snow and ice
    80: 0.03,  # permanent water
    90: 0.08,  # herbaceous wetland
    95: 0.12,  # mangroves
    100: 0.035,  # moss and lichen
}
DEFAULT_MANNING = 0.04
UPSTREAM_SEARCH_M = 1500.0
EDGE_GAP = 2  # cells between the inflow point and the box edge


@dataclass
class Grid:
    epsg: int
    x0: float
    y0: float
    dx: float
    mmax: int  # columns
    nmax: int  # rows

    @property
    def crs(self) -> CRS:
        return CRS.from_epsg(self.epsg)

    @property
    def transform(self):
        """North-up affine transform (row 0 is the north edge)."""
        return from_origin(self.x0, self.y0 + self.nmax * self.dx, self.dx, self.dx)


@dataclass
class Model:
    grid: Grid
    dem: np.ndarray  # north-up, metres
    manning: np.ndarray
    mask: np.ndarray  # SFINCS mask codes, north-up
    source_rc: tuple[int, int]
    river_rc: tuple[int, int]
    tref: datetime
    raised: np.ndarray  # metres each cell was raised when closed hollows were filled
    entry_traced: bool  # False: the water goes in at the clicked river cell


def utm_epsg(lat: float, lng: float) -> int:
    zone = int((lng + 180) // 6) + 1
    return (32600 if lat >= 0 else 32700) + min(zone, 60)


def make_grid(req: SimulateRequest) -> Grid:
    west, south, east, north = req.bbox
    epsg = utm_epsg((south + north) / 2, (west + east) / 2)
    to_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = to_utm.transform([west, east, east, west], [south, south, north, north])
    res = req.resolution
    x0 = math.floor(min(xs) / res) * res
    y0 = math.floor(min(ys) / res) * res
    mmax = math.ceil((max(xs) - x0) / res)
    nmax = math.ceil((max(ys) - y0) / res)
    return Grid(epsg=epsg, x0=x0, y0=y0, dx=res, mmax=mmax, nmax=nmax)


def _tiles(bbox, step: int):
    west, south, east, north = bbox
    lat0 = math.floor(south / step) * step
    lng0 = math.floor(west / step) * step
    for lat in range(lat0, math.floor(north) + 1, step):
        if lat > north:
            continue
        for lng in range(lng0, math.floor(east) + 1, step):
            if lng > east:
                continue
            yield lat, lng


def _name_parts(lat: int, lng: int) -> dict:
    return {
        "ns": "N" if lat >= 0 else "S",
        "lat": abs(lat),
        "ew": "E" if lng >= 0 else "W",
        "lng": abs(lng),
    }


def _mosaic(urls: list[str], grid: Grid, resampling: Resampling, nodata: float) -> np.ndarray:
    """Warps every source tile onto the model grid; later tiles only fill cells still empty."""
    out = np.full((grid.nmax, grid.mmax), np.nan, dtype="float64")
    for url in urls:
        try:
            with rasterio.open(f"/vsicurl/{url}") as src:
                with WarpedVRT(
                    src,
                    crs=grid.crs,
                    transform=grid.transform,
                    width=grid.mmax,
                    height=grid.nmax,
                    resampling=resampling,
                    src_nodata=src.nodata if src.nodata is not None else nodata,
                    nodata=np.nan,
                    dtype="float64",
                ) as vrt:
                    data = vrt.read(1)
        except RasterioIOError:
            continue  # tile does not exist (open ocean); leave the gap
        fill = np.isnan(out) & ~np.isnan(data)
        out[fill] = data[fill]
    return out


def read_dem(bbox, grid: Grid) -> np.ndarray:
    pad = (bbox[0] - 0.01, bbox[1] - 0.01, bbox[2] + 0.01, bbox[3] + 0.01)
    urls = [DEM_URL.format(**_name_parts(lat, lng)) for lat, lng in _tiles(pad, 1)]
    # The lowest 30 m pixel in each cell keeps narrow channels open (a surface model's trees,
    # bridges and gorge walls otherwise dam the river).
    dem = _mosaic(urls, grid, Resampling.min, nodata=-32767)
    if np.isnan(dem).all():
        raise RuntimeError("no elevation data for this area")
    return np.where(np.isnan(dem), 0.0, dem)  # missing tiles are sea


def read_manning(bbox, grid: Grid) -> np.ndarray:
    pad = (bbox[0] - 0.01, bbox[1] - 0.01, bbox[2] + 0.01, bbox[3] + 0.01)
    urls = [LC_URL.format(**_name_parts(lat, lng)) for lat, lng in _tiles(pad, 3)]
    classes = _mosaic(urls, grid, Resampling.mode, nodata=0)
    n = np.full(classes.shape, DEFAULT_MANNING)
    for cls, value in MANNING.items():
        n[classes == cls] = value
    return n


# --- flow routing ------------------------------------------------------------------------------

NEIGHBOURS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def flow_routing(dem: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Priority-flood fill (Barnes 2014) from the edges. Returns (receiver, accumulation, filled).

    `filled` is the elevation with every closed hollow raised to its spill level (plus a tiny slope).

    receiver[i] is the flat index each cell drains to (-1 for edge cells, which drain out of the box).
    """
    rows, cols = dem.shape
    size = rows * cols
    flat = dem.ravel()
    receiver = np.full(size, -1, dtype=np.int64)
    done = np.zeros(size, dtype=bool)
    order: list[int] = []
    heap: list[tuple[float, int, int]] = []
    counter = 0
    for r in range(rows):
        for c in range(cols):
            if r in (0, rows - 1) or c in (0, cols - 1):
                i = r * cols + c
                done[i] = True
                heapq.heappush(heap, (float(flat[i]), counter, i))
                counter += 1
    filled = flat.astype("float64").copy()
    while heap:
        z, _, i = heapq.heappop(heap)
        order.append(i)
        r, c = divmod(i, cols)
        for dr, dc in NEIGHBOURS:
            rr, cc = r + dr, c + dc
            if 0 <= rr < rows and 0 <= cc < cols:
                j = rr * cols + cc
                if not done[j]:
                    done[j] = True
                    filled[j] = max(filled[j], z + 1e-4)
                    receiver[j] = i
                    heapq.heappush(heap, (filled[j], counter, j))
                    counter += 1
    acc = np.ones(size, dtype="float64")
    for i in reversed(order):
        k = receiver[i]
        if k >= 0:
            acc[k] += acc[i]
    return receiver, acc, filled.reshape(dem.shape)


def find_river(acc: np.ndarray, shape, rc: tuple[int, int], radius_cells: int) -> int:
    rows, cols = shape
    r0, c0 = rc
    best, best_acc = -1, -1.0
    for r in range(max(0, r0 - radius_cells), min(rows, r0 + radius_cells + 1)):
        for c in range(max(0, c0 - radius_cells), min(cols, c0 + radius_cells + 1)):
            if (r - r0) ** 2 + (c - c0) ** 2 > radius_cells**2:
                continue
            a = acc[r * cols + c]
            if a > best_acc:
                best, best_acc = r * cols + c, a
    return best


ROUTING_MARGIN_M = 10_000.0  # the wider area used only to trace the river
ROUTING_RES_M = 150.0


def grid_bbox(grid: Grid) -> tuple[float, float, float, float]:
    """The grid's extent in degrees (west, south, east, north)."""
    to_geo = Transformer.from_crs(grid.epsg, 4326, always_xy=True)
    x1 = grid.x0 + grid.mmax * grid.dx
    y1 = grid.y0 + grid.nmax * grid.dx
    lngs, lats = to_geo.transform([grid.x0, x1, x1, grid.x0], [grid.y0, grid.y0, y1, y1])
    return min(lngs), min(lats), max(lngs), max(lats)


def _rc_of(grid: Grid, x: float, y: float) -> tuple[int, int]:
    r = int((grid.y0 + grid.nmax * grid.dx - y) // grid.dx)
    c = int((x - grid.x0) // grid.dx)
    return min(grid.nmax - 1, max(0, r)), min(grid.mmax - 1, max(0, c))


def _xy_of(grid: Grid, rc: tuple[int, int]) -> tuple[float, float]:
    r, c = rc
    return grid.x0 + (c + 0.5) * grid.dx, grid.y0 + (grid.nmax - r - 0.5) * grid.dx


def trace_entry(grid: Grid, x: float, y: float) -> tuple[float, float] | None:
    """Where the river at (x, y) enters the model box, in the model's UTM coordinates.

    Inside the model box the main river's catchment lies mostly outside it, so the in-box drainage
    area cannot tell it from a side stream. Flow is routed on a wider, coarser grid instead, where the
    main stem has by far the largest catchment, and followed upstream until it crosses the box edge.
    Returns None when the river starts inside the box.
    """
    m = ROUTING_MARGIN_M
    res = ROUTING_RES_M
    rg = Grid(
        epsg=grid.epsg,
        x0=grid.x0 - m,
        y0=grid.y0 - m,
        dx=res,
        mmax=math.ceil((grid.mmax * grid.dx + 2 * m) / res),
        nmax=math.ceil((grid.nmax * grid.dx + 2 * m) / res),
    )
    rdem = read_dem(grid_bbox(rg), rg)
    receiver, acc, _ = flow_routing(rdem)
    rows, cols = rdem.shape
    cur = find_river(acc, rdem.shape, _rc_of(rg, x, y), max(2, int(UPSTREAM_SEARCH_M / res)))

    inset = (EDGE_GAP + 1) * grid.dx
    x_lo, x_hi = grid.x0 + inset, grid.x0 + grid.mmax * grid.dx - inset
    y_lo, y_hi = grid.y0 + inset, grid.y0 + grid.nmax * grid.dx - inset
    last = _xy_of(rg, divmod(cur, cols))
    seen = {cur}
    while True:
        r, c = divmod(cur, cols)
        best, best_acc = -1, 0.0
        for dr, dc in NEIGHBOURS:
            rr, cc = r + dr, c + dc
            if 0 <= rr < rows and 0 <= cc < cols:
                j = rr * cols + cc
                if receiver[j] == cur and acc[j] > best_acc and j not in seen:
                    best, best_acc = j, acc[j]
        if best < 0:
            return None
        bx, by = _xy_of(rg, divmod(best, cols))
        if not (x_lo <= bx <= x_hi and y_lo <= by <= y_hi):
            return last
        last = (bx, by)
        seen.add(best)
        cur = best


def _edge_distance(rc, shape) -> int:
    r, c = rc
    rows, cols = shape
    return min(r, c, rows - 1 - r, cols - 1 - c)


def build_model(req: SimulateRequest) -> Model:
    grid = make_grid(req)
    dem = read_dem(req.bbox, grid)
    manning = read_manning(req.bbox, grid)
    shape = dem.shape

    to_utm = Transformer.from_crs(4326, grid.epsg, always_xy=True)
    x, y = to_utm.transform(req.lng, req.lat)
    click_rc = (
        min(shape[0] - 1, max(0, int((grid.y0 + grid.nmax * grid.dx - y) // grid.dx))),
        min(shape[1] - 1, max(0, int((x - grid.x0) // grid.dx))),
    )

    # A surface model at this resolution cannot see narrow gorges, bridges or culverts, so the river
    # looks dammed and the inflow would pond tens of metres deep behind false walls. As in the desk's
    # quick estimate (HAND), closed hollows are filled to their spill level and depth is measured
    # above that filled ground.
    receiver, acc, filled = flow_routing(dem)
    raised = filled - dem
    dem = filled
    radius = max(3, int(UPSTREAM_SEARCH_M / grid.dx))
    river = find_river(acc, shape, click_rc, radius)
    # The inflow goes in on the river where it enters the box. If the river could not be traced to
    # the edge, it goes in at the clicked river cell.
    source = river
    entry = trace_entry(grid, x, y)
    reached_edge = entry is not None
    if entry is not None:
        # Snap to the channel: the cell with the largest drainage area close to the traced point.
        source = find_river(acc, shape, _rc_of(grid, *entry), 4)
    source_rc = divmod(source, shape[1])

    # Every cell is active; the box edges are outflow cells, except near the inflow, so the water
    # it brings in cannot leave straight back out.
    mask = np.ones(shape, dtype=np.int8)
    mask[0, :] = mask[-1, :] = 3
    mask[:, 0] = mask[:, -1] = 3
    sr, sc = source_rc
    keep = 6
    near = (slice(max(0, sr - keep), sr + keep + 1), slice(max(0, sc - keep), sc + keep + 1))
    mask[near] = 1

    tref = datetime.fromisoformat(req.times[0]).replace(tzinfo=None)
    return Model(
        grid=grid,
        dem=dem,
        manning=manning,
        mask=mask,
        source_rc=source_rc,
        river_rc=divmod(river, shape[1]),
        tref=tref,
        raised=raised,
        entry_traced=reached_edge,
    )


def _write_grid(path: str, north_up: np.ndarray, fmt: str) -> None:
    # SFINCS reads rows from y0 (the south edge) upwards.
    np.savetxt(path, np.flipud(north_up), fmt=fmt, delimiter=" ")


def write_inputs(model: Model, req: SimulateRequest, folder: str) -> None:
    os.makedirs(folder, exist_ok=True)
    g = model.grid
    stop = model.tref + timedelta(hours=req.hours)
    fmt_t = lambda t: t.strftime("%Y%m%d %H%M%S")  # noqa: E731
    seconds = req.hours * 3600
    inp = {
        "mmax": g.mmax,
        "nmax": g.nmax,
        "dx": g.dx,
        "dy": g.dx,
        "x0": g.x0,
        "y0": g.y0,
        "rotation": 0,
        "epsg": g.epsg,
        "tref": fmt_t(model.tref),
        "tstart": fmt_t(model.tref),
        "tstop": fmt_t(stop),
        "inputformat": "asc",
        "outputformat": "net",
        "depfile": "sfincs.dep",
        "mskfile": "sfincs.msk",
        "manningfile": "sfincs.man",
        "srcfile": "sfincs.src",
        "disfile": "sfincs.dis",
        "alpha": 0.5,
        "huthresh": 0.01,
        "dtmapout": seconds,
        "dtmaxout": seconds,
        "dthisout": 0,
    }
    with open(os.path.join(folder, "sfincs.inp"), "w") as f:
        for key, value in inp.items():
            f.write(f"{key:<16}= {value}\n")

    _write_grid(os.path.join(folder, "sfincs.dep"), model.dem, "%.2f")
    _write_grid(os.path.join(folder, "sfincs.msk"), model.mask, "%d")
    _write_grid(os.path.join(folder, "sfincs.man"), model.manning, "%.3f")

    sr, sc = model.source_rc
    sx = g.x0 + (sc + 0.5) * g.dx
    sy = g.y0 + (g.nmax - sr - 0.5) * g.dx
    with open(os.path.join(folder, "sfincs.src"), "w") as f:
        f.write(f"{sx:.2f} {sy:.2f}\n")
    with open(os.path.join(folder, "sfincs.dis"), "w") as f:
        for t, q in zip(req.times, req.discharge):
            dt = (datetime.fromisoformat(t).replace(tzinfo=None) - model.tref).total_seconds()
            f.write(f"{dt:.0f} {q:.3f}\n")
        # Hold the last value to the end of the run.
        last_t = (datetime.fromisoformat(req.times[-1]).replace(tzinfo=None) - model.tref).total_seconds()
        if last_t < seconds:
            f.write(f"{seconds:.0f} {req.discharge[-1]:.3f}\n")

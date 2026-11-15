"""HTTP front for the SFINCS flood engine. Called only by the Poseidon Surge server (`/api/simulate`)."""

from __future__ import annotations

import hmac
import os
import re
import threading

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse

from validate import InvalidRequest, parse_request

app = FastAPI(title="Poseidon Surge flood engine", docs_url=None, redoc_url=None)
ID = re.compile(r"^[0-9a-f]{16}$")
# One SFINCS run at a time; a second request waits rather than doubling memory.
_lock = threading.Lock()


def _check_key(key: str | None) -> None:
    secret = os.environ.get("ENGINE_SECRET", "")
    if not secret:
        return  # local development without a secret
    if not key or not hmac.compare_digest(key, secret):
        raise HTTPException(status_code=401, detail="unauthorized")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "sfincs": "v2.5.0-Hautacam"}


@app.post("/simulate")
async def simulate_route(request: Request, x_engine_key: str | None = Header(default=None)):
    _check_key(x_engine_key)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"error": "body must be JSON"}, status_code=400)
    try:
        req = parse_request(body)
    except InvalidRequest as exc:
        return JSONResponse({"error": str(exc)}, status_code=400)

    from run import EngineTimeout, simulate  # GIS imports only when a run is asked for

    def work():
        with _lock:
            return simulate(req)

    try:
        return await run_in_threadpool(work)
    except EngineTimeout:
        return JSONResponse({"error": "timeout"}, status_code=504)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": f"run failed: {exc}"}, status_code=500)


@app.get("/runs/{run_id}/maxdepth.png")
def run_png(run_id: str, x_engine_key: str | None = Header(default=None)):
    _check_key(x_engine_key)
    if not ID.match(run_id):
        raise HTTPException(status_code=404)
    from run import run_dir

    path = os.path.join(run_dir(run_id), "maxdepth.png")
    if not os.path.exists(path):
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

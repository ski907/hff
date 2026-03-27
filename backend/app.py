"""
Heat Flux Forecast — FastAPI backend
Serves the API and the built SvelteKit frontend as static files.

Run with:
    uvicorn app:app --host 0.0.0.0 --port 8000
"""

import pathlib
import time

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from utils import (
    build_energy_df,
    calc_cooling_rate,
    calc_fluxes,
    get_elevation,
    get_full_forecast,
    get_is_day,
)

app = FastAPI(title="Heat Flux Forecast API", version="1.0.0")

# Allow CORS so the Svelte dev server (different port) can call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache
# ---------------------------------------------------------------------------
_CACHE: dict = {}
_CACHE_TTL = 3600  # seconds


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if entry and (time.time() - entry["ts"] < _CACHE_TTL):
        return entry["val"]
    return None


def _cache_set(key: str, val):
    _CACHE[key] = {"ts": time.time(), "val": val}


def _forecast_key(lat: float, lon: float) -> str:
    return f"forecast_{round(lat, 4)}_{round(lon, 4)}"


def _get_forecast_df(lat: float, lon: float) -> pd.DataFrame:
    """Fetch full forecast, using cache if fresh."""
    key = _forecast_key(lat, lon)
    cached = _cache_get(key)
    if cached is not None:
        return cached
    df = get_full_forecast(lat, lon)
    df = df.replace([np.inf, -np.inf], np.nan)
    _cache_set(key, df)
    return df


def _safe_list(series) -> list:
    """Convert a pandas Series to a JSON-safe list (NaN → None)."""
    return [None if (v is None or (isinstance(v, float) and np.isnan(v))) else v
            for v in series]


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.get("/api/forecast")
def api_forecast(lat: float, lon: float):
    """Return NWS hourly forecast data for a location."""
    try:
        df = _get_forecast_df(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch NOAA forecast: {e}")

    # Locate columns (names can vary slightly)
    def find_col(keywords: list[str]) -> str | None:
        for kw in keywords:
            match = next((c for c in df.columns if kw.lower() in c.lower()), None)
            if match:
                return match
        return None

    temp_col = find_col(["Temperature"])
    dew_col = find_col(["Dewpoint", "Dew Point"])
    wind_col = find_col(["Surface Wind"])
    sky_col = find_col(["Sky Cover"])
    pop_col = find_col(["Precip"])
    rh_col = find_col(["Humidity"])
    wind_dir_col = find_col(["Wind Direction", "Wind Dir"])

    def get_col(col):
        return _safe_list(df[col].tolist()) if col else [None] * len(df)

    try:
        is_day = get_is_day(df.index, lat, lon)

        result = {
            "timestamps": [str(t) for t in df.index],
            "temperature_f": get_col(temp_col),
            "dewpoint_f": get_col(dew_col),
            "wind_mph": get_col(wind_col),
            "sky_pct": get_col(sky_col),
            "pop_pct": get_col(pop_col),
            "rh_pct": get_col(rh_col),
            "wind_dir_deg": get_col(wind_dir_col),
            "is_day": is_day,
        }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing forecast: {e}")


@app.get("/api/elevation")
def api_elevation(lat: float, lon: float):
    """Return terrain elevation at a lat/lon."""
    key = f"elev_{round(lat, 4)}_{round(lon, 4)}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        elev = get_elevation(lat, lon)
        result = {"elevation": elev}
        _cache_set(key, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch elevation: {e}")


@app.get("/api/heatflux")
def api_heatflux(lat: float, lon: float, water_temp: float = 10.0, depth: float = 2.0):
    """Return calculated heat flux components and cooling rate."""
    try:
        df = _get_forecast_df(lat, lon)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch NOAA forecast: {e}")

    try:
        q_sw, q_atm, q_b, q_l, q_h, q_net = calc_fluxes(df, water_temp, lat, lon)
        energy_df = build_energy_df(q_sw, q_atm, q_b, q_l, q_h)
        cooling_rate = calc_cooling_rate(q_net, depth)

        result = {
            "timestamps": [str(t) for t in energy_df.index],
            "sw_down":  _safe_list(energy_df["downwelling SW"].tolist()),
            "lw_down":  _safe_list(energy_df["downwelling LW"].tolist()),
            "lw_up":    _safe_list(energy_df["upwelling LW"].tolist()),
            "sensible": _safe_list(energy_df["sensible heat"].tolist()),
            "latent":   _safe_list(energy_df["latent heat"].tolist()),
            "net":      _safe_list(energy_df["net flux"].tolist()),
            "cooling_rate_c_per_min": _safe_list(cooling_rate.tolist()),
        }
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating heat flux: {e}")


# ---------------------------------------------------------------------------
# Serve built SvelteKit frontend (must be last so API routes take priority)
# ---------------------------------------------------------------------------
_static_dir = pathlib.Path(__file__).parent / "static"
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")

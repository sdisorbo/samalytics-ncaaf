"""Thin cached client for the CollegeFootballData API (https://collegefootballdata.com).

Reads the key from CFBD_API_KEY (or a local .env next to the project). Responses
are cached under scripts/.cache/cfbd/ so re-runs during model development are
free and don't hammer the API.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://api.collegefootballdata.com"
CACHE = Path(__file__).resolve().parent / ".cache" / "cfbd"


def _load_env():
    if os.environ.get("CFBD_API_KEY"):
        return os.environ["CFBD_API_KEY"]
    envp = Path(__file__).resolve().parent.parent / ".env"
    if envp.exists():
        for line in envp.read_text().splitlines():
            line = line.strip()
            if line.startswith("CFBD_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def get(path: str, ttl_days: float = 120.0, **params):
    """GET /path?params -> parsed JSON, cached. Raises if no key / on error."""
    key = _load_env()
    if not key:
        raise RuntimeError("CFBD_API_KEY not set. Put it in samalytics-ncaaf/.env")
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    url = f"{BASE}{path}" + (f"?{qs}" if qs else "")
    CACHE.mkdir(parents=True, exist_ok=True)
    ck = CACHE / (path.strip("/").replace("/", "_") + "__" + qs.replace("&", "_").replace("=", "-") + ".json")
    if ck.exists() and (time.time() - ck.stat().st_mtime) < ttl_days * 86400:
        return json.loads(ck.read_text())
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.loads(r.read().decode())
            ck.write_text(json.dumps(data))
            time.sleep(0.4)  # be polite to the free tier
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:      # rate limited -> back off
                time.sleep(2.5 * (attempt + 1))
                continue
            raise

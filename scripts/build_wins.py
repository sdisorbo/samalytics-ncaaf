#!/usr/bin/env python3
"""
build_wins.py — Samalytics NCAAF win-total model

Predicts each FBS team's regular-season wins from preseason-known inputs, then
compares to the Vegas win total. Every feature is knowable BEFORE the season:

    prev_wins   regular-season wins last year
    prev_sp     last year's SP+ rating (CFBD)
    prev_elo    last year's end-of-season Elo (CFBD)
    talent      247 roster talent composite (CFBD)
    recruiting  incoming recruiting-class points (CFBD)
    ret_prod    returning production, % of PPA back (CFBD)
    transfer    net transfer-portal star haul (in - out, CFBD)
    sos         strength of schedule = mean of opponents' prev_elo (from schedule)

Model: ridge regression on standardized features, validated leave-one-season-out
so the reported error is genuinely out-of-sample. We benchmark against the Vegas
line (sentiment_backtest/outcomes.csv) on the overlapping team-seasons.

Usage:
    python scripts/build_wins.py            # validate + write data/wins.json
"""
import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import cfbd

ROOT = Path(__file__).resolve().parent.parent
OUTCOMES = ROOT.parent / "sentiment_backtest" / "outcomes.csv"
OUT = ROOT / "data"

# 2020 was COVID-shortened (≈10 games, distorted totals) -> excluded everywhere.
TRAIN_YEARS = [2018, 2019, 2021, 2022, 2023, 2024]
FEATURES = ["prev_wins", "prev_sp", "prev_elo", "talent", "recruiting", "ret_prod", "transfer", "sos"]
RIDGE_LAMBDA = 5.0


# ── name normalization (CFBD <-> sportsbook <-> our logos) ───────────────────
def norm(s: str) -> str:
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", "", s)
    return re.sub(r"\s+", " ", s).strip()

VEGAS_ALIAS = {  # sportsbook name -> CFBD name
    "mississippi": "ole miss", "southern miss": "southern mississippi",
    "miami fl": "miami", "miami oh": "miami (oh)", "nc state": "nc state",
    "uconn": "connecticut", "pitt": "pittsburgh", "usf": "south florida",
    "ucf": "ucf", "smu": "smu", "byu": "byu", "tcu": "tcu", "utsa": "ut san antonio",
    "utep": "utep", "lsu": "lsu", "ul monroe": "louisiana monroe",
    "louisiana lafayette": "louisiana", "hawaii": "hawai'i", "san jose state": "san josé state",
}
def vnorm(name: str) -> str:
    n = norm(name)
    return norm(VEGAS_ALIAS.get(n, n))


# ── pull all CFBD inputs for a set of years ──────────────────────────────────
def load_cfbd(years):
    yrs = sorted(set(years) | {y - 1 for y in years})  # need year-1 too
    fbs = {}          # year -> set(team)
    meta = {}         # (year,team) -> {abbr,logo,conf,color}
    wins = {}         # (year,team) -> regular-season wins
    sp = {}           # (year,team) -> SP+ rating
    elo = {}          # (year,team) -> CFBD Elo
    talent = {}       # (year,team) -> talent
    recruit = {}      # (year,team) -> recruiting points
    retprod = {}      # (year,team) -> percentPPA
    portal = defaultdict(float)  # (year,team) -> net stars
    sched = defaultdict(list)    # (year,team) -> [opponent,...]

    def safe(path, **kw):
        try:
            return cfbd.get(path, **kw) or []
        except Exception as e:
            print(f"    (skip {path} {kw.get('year')}: {e})")
            return []

    for y in yrs:
        for r in safe("/teams/fbs", year=y):   # membership + logos, works preseason
            t = r["school"]; fbs.setdefault(y, set()).add(t)
            logos = r.get("logos") or []
            meta[(y, t)] = {"abbr": r.get("abbreviation") or t, "conf": r.get("conference"),
                            "color": r.get("color"), "logo": logos[0] if logos else None}
        for r in safe("/records", year=y):
            if r.get("classification") != "fbs":
                continue
            t = r["team"]; fbs.setdefault(y, set()).add(t)
            rs = r.get("regularSeason") or {}
            if rs.get("wins") is not None:
                wins[(y, t)] = rs["wins"]
        for r in safe("/ratings/sp", year=y):
            if r.get("rating") is not None:
                sp[(y, r["team"])] = r["rating"]
        for r in safe("/ratings/elo", year=y):
            if r.get("elo") is not None:
                elo[(y, r["team"])] = r["elo"]
        for r in safe("/talent", year=y):
            talent[(y, r["team"])] = r["talent"]
        for r in safe("/recruiting/teams", year=y):
            recruit[(y, r["team"])] = r.get("points")
        for r in safe("/player/returning", year=y):
            if r.get("percentPPA") is not None:
                retprod[(y, r["team"])] = r["percentPPA"]
        for p in safe("/player/portal", year=y):
            st = p.get("stars") or 0
            if p.get("destination"):
                portal[(y, p["destination"])] += st
            if p.get("origin"):
                portal[(y, p["origin"])] -= st
        for g in safe("/games", year=y, seasonType="regular"):
            h, a = g.get("homeTeam"), g.get("awayTeam")
            hf = g.get("homeClassification") == "fbs"
            af = g.get("awayClassification") == "fbs"
            if hf and a:
                sched[(y, h)].append(a)
            if af and h:
                sched[(y, a)].append(h)
    return dict(fbs=fbs, meta=meta, wins=wins, sp=sp, elo=elo, talent=talent,
                recruit=recruit, retprod=retprod, portal=portal, sched=sched)


def build_rows(years, D):
    """One row per (year, team) with the feature vector + target (wins)."""
    rows = []
    for y in years:
        for t in sorted(D["fbs"].get(y, ())):
            opp_elos = [D["elo"].get((y - 1, o)) for o in D["sched"].get((y, t), [])]
            opp_elos = [e for e in opp_elos if e is not None]
            feat = {
                "prev_wins": D["wins"].get((y - 1, t)),
                "prev_sp": D["sp"].get((y - 1, t)),
                "prev_elo": D["elo"].get((y - 1, t)),
                "talent": D["talent"].get((y, t)),
                "recruiting": D["recruit"].get((y, t)),
                "ret_prod": D["retprod"].get((y, t)),
                "transfer": D["portal"].get((y, t), 0.0),
                "sos": (sum(opp_elos) / len(opp_elos)) if opp_elos else None,
            }
            rows.append({"year": y, "team": t, "wins": D["wins"].get((y, t)), "feat": feat})
    return rows


# ── ridge regression (standardized, mean-imputed) ────────────────────────────
def _matrix(rows, means, stds):
    X = np.zeros((len(rows), len(FEATURES)))
    for i, r in enumerate(rows):
        for j, f in enumerate(FEATURES):
            v = r["feat"][f]
            X[i, j] = 0.0 if (v is None or (isinstance(v, float) and math.isnan(v))) else (v - means[f]) / stds[f]
    return X

def fit_stats(rows):
    means, stds = {}, {}
    for f in FEATURES:
        vals = [r["feat"][f] for r in rows if r["feat"][f] is not None]
        means[f] = float(np.mean(vals)); stds[f] = float(np.std(vals)) or 1.0
    return means, stds

def ridge_fit(rows):
    means, stds = fit_stats(rows)
    X = _matrix(rows, means, stds)
    y = np.array([r["wins"] for r in rows], dtype=float)
    yb = y.mean()
    A = X.T @ X + RIDGE_LAMBDA * np.eye(X.shape[1])
    w = np.linalg.solve(A, X.T @ (y - yb))
    return {"w": w, "b": yb, "means": means, "stds": stds}

def ridge_pred(model, rows):
    return _matrix(rows, model["means"], model["stds"]) @ model["w"] + model["b"]


def rmse(e): return float(np.sqrt(np.mean(np.square(e))))
def mae(e): return float(np.mean(np.abs(e)))


# ── main ─────────────────────────────────────────────────────────────────────
DISPLAY_YEARS = [2021, 2022, 2023, 2024, 2025, 2026]


def load_vegas():
    """Vegas win totals: outcomes.csv (2018-24) + live SBD scrape (2025-26)."""
    vegas = {}
    with open(OUTCOMES) as f:
        for r in csv.DictReader(f):
            try:
                vegas[(int(r["year"]), vnorm(r["team"]))] = (float(r["win_total"]), int(r["actual_wins"]))
            except Exception:
                pass
    try:
        import sys
        sys.path.insert(0, str(ROOT.parent / "sentiment_backtest"))
        from outcomes_fetcher import fetch_sbd_lines
        for y, lines in fetch_sbd_lines([2023, 2024, 2025]).items():   # completed seasons
            for team, wt, *_ in lines:
                vegas.setdefault((y, vnorm(team)), (wt, None))
    except Exception as e:
        print(f"  (past-season SBD lines unavailable: {e})")
    # the UPCOMING season's lines live on SBD's live page
    try:
        import time as _t, urllib.request
        from bs4 import BeautifulSoup
        up = _t.gmtime().tm_year
        req = urllib.request.Request(
            "https://www.sportsbettingdime.com/college-football/futures/win-totals-best-odds/",
            headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(urllib.request.urlopen(req, timeout=25).read().decode(), "html.parser")
        for tr in soup.find("table").find_all("tr")[1:]:
            c = [x.get_text(strip=True) for x in tr.find_all(["td", "th"])]
            if len(c) >= 2:
                try:
                    vegas[(up, vnorm(c[0]))] = (float(c[1]), None)
                except ValueError:
                    pass
    except Exception as e:
        print(f"  (upcoming-season Vegas lines unavailable: {e})")
    return vegas


def main():
    print("loading CFBD inputs (cached after first run)…")
    D = load_cfbd(TRAIN_YEARS + DISPLAY_YEARS)
    rows = [r for r in build_rows(TRAIN_YEARS, D) if r["wins"] is not None]
    print(f"  {len(rows)} team-seasons across {TRAIN_YEARS}")

    # leave-one-season-out CV -> genuinely out-of-sample predictions
    preds = {}
    for holdout in TRAIN_YEARS:
        tr = [r for r in rows if r["year"] != holdout]
        te = [r for r in rows if r["year"] == holdout]
        m = ridge_fit(tr)
        for r, p in zip(te, ridge_pred(m, te)):
            preds[(r["year"], r["team"])] = float(p)
    cv_err = [preds[(r["year"], r["team"])] - r["wins"] for r in rows]
    print(f"\nMODEL (leave-one-season-out):  RMSE={rmse(cv_err):.3f}  MAE={mae(cv_err):.3f}")

    # Vegas benchmark on the overlap
    vegas = load_vegas()
    m_err, v_err, hits, tot = [], [], 0, 0
    for r in rows:
        v = vegas.get((r["year"], vnorm(r["team"])))
        if not v:
            continue
        wt, actual = v
        pr = preds[(r["year"], r["team"])]
        m_err.append(pr - actual); v_err.append(wt - actual)
        if abs(pr - wt) >= 0.5 and actual != wt:
            tot += 1; hits += (pr > wt) == (actual > wt)
    print(f"\nOn {len(m_err)} team-seasons that also have a Vegas line:")
    print(f"  Model RMSE={rmse(m_err):.3f}   Vegas RMSE={rmse(v_err):.3f}")
    print(f"  Model beats Vegas O/U (|edge|>=0.5): {hits}/{tot} = {100*hits/max(tot,1):.1f}%")

    # feature importances (full-sample standardized coefficients)
    full = ridge_fit(rows)
    print("\nStandardized coefficients (wins per 1 SD):")
    for f, w in sorted(zip(FEATURES, full["w"]), key=lambda kv: -abs(kv[1])):
        print(f"  {f:11s} {w:+.3f}")

    # ── per-season projections for the site (out-of-sample) ─────────────────
    out_seasons = {}
    have = set()
    for y in DISPLAY_YEARS:
        pr_rows = [r for r in build_rows([y], D) if D["meta"].get((y, r["team"]))]
        if not pr_rows:
            continue
        full_pred = ridge_pred(full, pr_rows)   # fallback for non-training years
        teams = []
        for r, p in zip(pr_rows, full_pred):
            # use the genuinely out-of-sample CV prediction when we have one
            proj = preds.get((y, r["team"]), float(p))
            v = vegas.get((y, vnorm(r["team"])))
            m = D["meta"][(y, r["team"])]
            teams.append({
                "team": r["team"], "abbr": m["abbr"], "logo": m["logo"], "conf": m["conf"],
                "proj": round(proj, 2),
                "vegas": v[0] if v else None,
                "actual": r["wins"] if r["wins"] is not None else None,
            })
        teams.sort(key=lambda t: -t["proj"])
        out_seasons[str(y)] = teams
        have.add(y)
        nvegas = sum(1 for t in teams if t["vegas"] is not None)
        top = ", ".join("{} {:.1f}".format(t["abbr"], t["proj"]) for t in teams[:4])
        print(f"  {y}: {len(teams)} teams, {nvegas} w/ Vegas line, top: {top}")

    OUT.mkdir(exist_ok=True)
    payload = {"seasons": [str(y) for y in DISPLAY_YEARS if y in have],
               "latest": str(max(have)), "by_season": out_seasons}
    (OUT / "wins.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"\nwrote {OUT}/wins.json")


if __name__ == "__main__":
    main()

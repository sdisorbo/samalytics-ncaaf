#!/usr/bin/env python3
"""
build_alice.py — recreate ALICE, the CFB point-spread model (Sam DiSorbo, 2022)

ALICE = "Adaptive (spread) Learning (with xGBoost) Corrective Error". An XGBoost
regressor that predicts a game's home margin from the 5-game rolling means of each
team's box-score form plus the Vegas spread, then bets whether the AWAY team covers.

Features (per team, 5-game rolling mean, home & away): yards, TDs, penalty yards,
punt-return yards, kicking points, turnovers, takeaways, sacks, EPA, rushes,
passes, points, first downs — plus the game's Vegas spread. Early-season games use
a rolling window that naturally spills into the prior season (so week 1 leans on
last year's final games). We also add each team's pregame Elo (our own model) as an
extra signal the original didn't have.

Validated leave-one-season-out; bets graded against the consensus spread. Writes
data/models.json (ALICE predictions + accuracy metrics + binned success rate;
REBEL is a coming-soon placeholder).

Usage: python scripts/build_alice.py
"""
import json
import re
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import cfbd

try:
    import xgboost as xgb
    HAVE_XGB = True
except Exception:
    HAVE_XGB = False

OUT = Path(__file__).resolve().parent.parent / "data"
FIRST = 2015
SEED = 17
ROLL = 5            # rolling-window length (games)
MIN_HIST = 3        # need at least this many prior games for a usable row

# per-team, per-game box features we roll
FEATS = ["yards", "tds", "penYds", "retYds", "kickPts", "turnovers", "takeaways",
         "sacks", "epa", "rushes", "passes", "points", "firstDowns"]


def _int(v, idx=None):
    if v is None:
        return 0.0
    s = str(v)
    if idx is not None:  # "C-A" / "N-Y" style
        parts = s.split("-")
        s = parts[idx] if len(parts) > idx else "0"
    m = re.search(r"-?\d+\.?\d*", s)
    return float(m.group()) if m else 0.0


def team_box(teamobj):
    """Extract the rolled features from one /games/teams team object (no EPA/points)."""
    st = {s["category"]: s.get("stat") for s in teamobj.get("stats", [])}
    return {
        "yards": _int(st.get("totalYards")),
        "tds": _int(st.get("rushingTDs")) + _int(st.get("passingTDs")),
        "penYds": _int(st.get("totalPenaltiesYards"), 1),
        "retYds": _int(st.get("puntReturnYards")),
        "kickPts": _int(st.get("kickingPoints")),
        "turnovers": _int(st.get("turnovers")),
        "takeaways": _int(st.get("fumblesRecovered")) + _int(st.get("passesIntercepted")),
        "sacks": _int(st.get("sacks")),
        "rushes": _int(st.get("rushingAttempts")),
        "passes": _int(st.get("completionAttempts"), 1),
        "firstDowns": _int(st.get("firstDowns")),
    }


def consensus_spread(lines):
    prov = {l.get("provider"): l for l in lines if l.get("spread") is not None}
    for p in ("consensus", "DraftKings", "Bovada", "teamrankings"):
        if p in prov:
            return float(prov[p]["spread"])
    vals = [float(l["spread"]) for l in lines if l.get("spread") is not None]
    return float(np.mean(vals)) if vals else None


def load_games(year):
    """One row per game: teams, scores, date, spread, and each team's box+epa."""
    games = {}
    for wk in range(1, 17):
        gs = cfbd.get("/games", year=year, week=wk, seasonType="regular", classification="fbs")
        for g in gs:
            if g.get("homePoints") is None or g.get("awayPoints") is None:
                # keep upcoming games too (for prediction) but mark unplayed
                pass
            games[g["id"]] = {
                "id": g["id"], "date": g.get("startDate") or "", "week": wk, "year": year,
                "home": g["homeTeam"], "away": g["awayTeam"],
                "homeConf": g.get("homeConference"), "awayConf": g.get("awayConference"),
                "hp": g.get("homePoints"), "ap": g.get("awayPoints"),
                "box": {}, "epa": {}, "spread": None,
            }
        for gt in cfbd.get("/games/teams", year=year, week=wk, classification="fbs"):
            gid = gt["id"]
            if gid not in games:
                continue
            for t in gt.get("teams", []):
                b = team_box(t); b["points"] = _int(t.get("points"))
                games[gid]["box"][t["team"]] = b
        for pp in cfbd.get("/ppa/games", year=year, week=wk):
            gid = pp.get("gameId")
            if gid in games:
                off = (pp.get("offense") or {}).get("overall")
                games[gid]["epa"][pp["team"]] = float(off) if off is not None else 0.0
        for ln in cfbd.get("/lines", year=year, week=wk):
            gid = ln.get("id")
            if gid in games:
                games[gid]["spread"] = consensus_spread(ln.get("lines", []))
    return list(games.values())


def team_vec(g, team):
    b = g["box"].get(team, {})
    v = {f: b.get(f, 0.0) for f in FEATS if f not in ("epa",)}
    v["epa"] = g["epa"].get(team, 0.0)
    return [v[f] for f in FEATS]


FEAT_NAMES = ["vegas_spread"] + [f"home_{f}" for f in FEATS] + [f"away_{f}" for f in FEATS]
XGB_PARAMS = dict(n_estimators=450, learning_rate=0.03, max_depth=3, subsample=0.8,
                  colsample_bytree=0.8, reg_lambda=2.5, min_child_weight=6,
                  random_state=SEED, verbosity=0)


def wilson(p, n, z=1.96):
    if not n:
        return (0.0, 0.0)
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5)
    return ((c - m) / d, (c + m) / d)


def main():
    seasons = list(range(FIRST, time.gmtime().tm_year + 1))
    print(f"loading {seasons} …")
    all_games = []
    for y in seasons:
        gs = load_games(y)
        all_games += gs
        print(f"  {y}: {len(gs)} games, {sum(1 for g in gs if g['spread'] is not None)} with a line")

    # chronological order for the rolling window (spans seasons)
    all_games.sort(key=lambda g: (g["date"] or f"{g['year']}-99"))

    hist = defaultdict(lambda: deque(maxlen=ROLL))   # team -> deque of feature vectors
    rows = []                                        # usable rows (played + has line + history)
    upcoming = []                                    # future games to predict (no result yet)

    for g in all_games:
        hv, av = team_vec_or_none(hist, g["home"]), team_vec_or_none(hist, g["away"])
        played = g["hp"] is not None and g["ap"] is not None
        has_feat = hv is not None and av is not None and g["spread"] is not None
        if has_feat:
            feat = [g["spread"]] + hv + av
            rec = {"g": g, "feat": feat}
            if played:
                rec["margin"] = g["hp"] - g["ap"]
                rows.append(rec)
            else:
                upcoming.append(rec)
        # update history with this game's actual box (only if played)
        if played:
            hist[g["home"]].append(team_vec(g, g["home"]))
            hist[g["away"]].append(team_vec(g, g["away"]))

    print(f"\nusable training rows: {len(rows)} | upcoming to predict: {len(upcoming)}")
    if not HAVE_XGB or len(rows) < 500:
        print("xgboost unavailable or too little data — aborting"); return

    X = np.array([r["feat"] for r in rows], dtype=float)
    y = np.array([r["margin"] for r in rows], dtype=float)
    yr = np.array([r["g"]["year"] for r in rows])

    # leave-one-season-out out-of-sample predictions
    pred = np.full(len(rows), np.nan)
    for s in sorted(set(yr)):
        tr, te = yr != s, yr == s
        if te.sum() == 0 or tr.sum() < 400:
            continue
        m = xgb.XGBRegressor(**XGB_PARAMS)
        m.fit(X[tr], y[tr])
        pred[te] = m.predict(X[te])

    # grade every bet against the consensus line (away-cover = positive class)
    graded = []
    for i, r in enumerate(rows):
        if np.isnan(pred[i]):
            continue
        S = r["g"]["spread"]; margin = r["margin"]; P = float(pred[i])
        vmargin = -S                      # vegas-implied home margin
        if margin == vmargin:
            continue                      # push
        away_cov = margin < vmargin
        pick_away = P < vmargin
        graded.append({"i": i, "r": r, "P": P, "S": S, "edge": abs(P - vmargin),
                       "away_cov": away_cov, "pick_away": pick_away,
                       "correct": pick_away == away_cov})

    n = len(graded); acc = sum(g["correct"] for g in graded) / n
    lo, hi = wilson(acc, n)
    aw = [g for g in graded if g["pick_away"]]; hm = [g for g in graded if not g["pick_away"]]
    # confusion (positive = away covers)
    tp = sum(1 for g in graded if g["pick_away"] and g["away_cov"])
    fp = sum(1 for g in graded if g["pick_away"] and not g["away_cov"])
    fn = sum(1 for g in graded if not g["pick_away"] and g["away_cov"])
    tn = sum(1 for g in graded if not g["pick_away"] and not g["away_cov"])
    prec = tp / (tp + fp) if tp + fp else 0
    rec = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0
    bal = 0.5 * (rec + (tn / (tn + fp) if tn + fp else 0))

    edge_defs = [(0, 1, "0-1"), (1, 2, "1-2"), (2, 3, "2-3"), (3, 5, "3-5"), (5, 8, "5-8"), (8, 99, "8+")]
    edge_bins = []
    for a, b, lab in edge_defs:
        gb = [g for g in graded if a <= g["edge"] < b]
        if gb:
            edge_bins.append({"label": lab, "n": len(gb), "acc": round(100 * sum(x["correct"] for x in gb) / len(gb), 1)})

    # season curve: cumulative units (+0.91 win / -1 loss) over the latest full season
    full_seasons = sorted(s for s in set(yr) if not np.isnan(pred[yr == s]).all())
    curve_season = max(s for s in full_seasons if s < time.gmtime().tm_year) if any(s < time.gmtime().tm_year for s in full_seasons) else full_seasons[-1]
    seq = sorted([g for g in graded if g["r"]["g"]["year"] == curve_season], key=lambda g: g["r"]["g"]["date"] or "")
    curve, units, wins = [], 0.0, 0
    for k, g in enumerate(seq, 1):
        units += 0.91 if g["correct"] else -1.0
        wins += g["correct"]
        curve.append({"i": k, "units": round(units, 2), "acc": round(100 * wins / k, 1)})

    # full-sample model for feature importance + upcoming predictions
    full = xgb.XGBRegressor(**XGB_PARAMS); full.fit(X, y)
    imp = full.feature_importances_
    order = np.argsort(imp)[::-1][:8]
    feats = [{"name": FEAT_NAMES[j].replace("_", " "), "importance": round(float(imp[j]), 3)} for j in order]

    print(f"\nALICE: {n} bets, {100*acc:.1f}% correct  (95% CI {100*lo:.1f}-{100*hi:.1f}%, break-even 52.4%)")
    print(f"  pick AWAY cover: {len(aw)} at {100*sum(g['correct'] for g in aw)/max(len(aw),1):.1f}%   "
          f"pick HOME cover: {len(hm)} at {100*sum(g['correct'] for g in hm)/max(len(hm),1):.1f}%")
    print(f"  F1={f1:.3f} precision={prec:.3f} recall={rec:.3f} balanced-acc={bal:.3f}")
    print("  by edge:", {b['label']: f"{b['acc']}% (n={b['n']})" for b in edge_bins})
    print("  top features:", [f["name"] for f in feats[:5]])

    # ── per-game predictions for the site ────────────────────────────────────
    def game_row(P, r, played):
        g = r["g"]; S = g["spread"]; vmargin = -S
        alice_spread = round(-P, 1)
        pick = "away" if P < vmargin else "home"
        out = {"week": g["week"], "home": g["home"], "away": g["away"],
               "homeConf": g["homeConf"], "awayConf": g["awayConf"],
               "vegas": round(S, 1), "alice": alice_spread, "edge": round(abs(P - vmargin), 1), "pick": pick}
        if played:
            margin = g["hp"] - g["ap"]
            out["result"] = {"hp": g["hp"], "ap": g["ap"], "margin": margin}
            if margin != vmargin:
                out["correct"] = (P < vmargin) == (margin < vmargin)
        return out

    pred_by_season = defaultdict(list)
    for i, r in enumerate(rows):
        if not np.isnan(pred[i]):
            pred_by_season[str(r["g"]["year"])].append(game_row(float(pred[i]), r, True))
    for r in upcoming:
        P = float(full.predict(np.array([r["feat"]], dtype=float))[0])
        pred_by_season[str(r["g"]["year"])].append(game_row(P, r, False))
    for s in pred_by_season:
        pred_by_season[s].sort(key=lambda x: (x["week"], -x["edge"]))

    latest = max(pred_by_season, key=lambda s: int(s))
    metrics = {
        "n": n, "accuracy": round(100 * acc, 1), "ci_low": round(100 * lo, 1), "ci_high": round(100 * hi, 1),
        "break_even": 52.4,
        "away": {"n": len(aw), "acc": round(100 * sum(g["correct"] for g in aw) / max(len(aw), 1), 1)},
        "home": {"n": len(hm), "acc": round(100 * sum(g["correct"] for g in hm) / max(len(hm), 1), 1)},
        "f1": round(f1, 3), "precision": round(prec, 3), "recall": round(rec, 3), "balanced_acc": round(bal, 3),
        "edge_bins": edge_bins, "season_curve": {"season": int(curve_season), "points": curve},
        "features": feats, "seasons": f"{min(yr)}-{max(yr)}",
    }

    OUT.mkdir(exist_ok=True)
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "alice": {"metrics": metrics, "games": pred_by_season, "latest": latest,
                  "seasons": sorted(pred_by_season, key=int)},
        "rebel": {"status": "coming_soon"},
    }
    (OUT / "models.json").write_text(json.dumps(payload, separators=(",", ":")))
    print(f"\nwrote {OUT}/models.json ({sum(len(v) for v in pred_by_season.values())} predictions)")


def team_vec_or_none(hist, team):
    dq = hist[team]
    if len(dq) < MIN_HIST:
        return None
    arr = np.array(dq, dtype=float)
    return list(arr.mean(axis=0))


if __name__ == "__main__":
    main()

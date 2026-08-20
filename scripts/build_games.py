#!/usr/bin/env python3
"""
build_games.py  —  Samalytics NCAAF games / matchups dataset

Runs the SAME Elo engine as build_data.py chronologically across seasons
(2021 -> the upcoming one) and, for every regular-season game (played AND
still-upcoming), records each team's pre-game Elo, the Elo-based home win
probability, and how much Elo each side would gain on a win / lose on a loss.
Upcoming games therefore carry each team's preseason-projected (carried) Elo;
as games are played the in-season action re-runs this and later weeks reflect
the new ratings. Elo constants are imported from build_data so the two can
never drift apart.

Output: data/games.json
    { updated, seasons:[...], teams:{ id:{abbr,name,logo,color} }, data:{ "2026":[ {game} ] } }

Usage:  python scripts/build_games.py
"""
import json
import math
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:                       # pragma: no cover - fallback if tzdata missing
    ET = timezone.utc

import build_data as bd                 # reuse fetch, Elo constants + math

MARGIN = 14                             # representative margin for the projected Elo swing
FIRST = bd.FIRST_SEASON
OUT = Path(__file__).resolve().parent.parent / "data"
DEFAULT_LOGO = "https://a.espncdn.com/i/teamlogos/ncaa/500/{}.png"


def mov_mult(elo_w, elo_l, margin):
    return math.log(margin + 1.0) * (2.2 / ((elo_w - elo_l) * 0.001 + 2.2))


def team_disp(t):
    """Display info from a scoreboard competitor's team object."""
    tid = str(t.get("id"))
    logos = t.get("logos") or []
    logo = t.get("logo") or (logos[0].get("href") if logos else DEFAULT_LOGO.format(tid))
    color = t.get("color")
    color = ("#" + color) if color and not str(color).startswith("#") else (color or "#7A7A7A")
    return tid, {
        "abbr": t.get("abbreviation") or t.get("shortDisplayName") or tid,
        "name": t.get("location") or t.get("shortDisplayName") or t.get("displayName") or tid,
        "logo": logo, "color": color,
    }


def load_all_games(season, ttl):
    """Every regular-season game incl. unplayed, with week + kickoff + team info."""
    out = []
    for week in range(1, 17):
        url = (f"{bd.ESPN}/site/v2/sports/football/college-football/scoreboard"
               f"?groups=80&dates={season}&seasontype=2&week={week}&limit=300")
        try:
            d = bd.fetch(url, f"sb_{season}_reg_w{week}", ttl_days=ttl)
        except Exception:
            continue
        for ev in d.get("events", []):
            comp = ev["competitions"][0]
            cs = comp.get("competitors", [])
            if len(cs) != 2:
                continue
            home = next((c for c in cs if c.get("homeAway") == "home"), None)
            away = next((c for c in cs if c.get("homeAway") == "away"), None)
            if not home or not away:
                continue
            hid, hinfo = team_disp(home["team"])
            aid, ainfo = team_disp(away["team"])
            completed = bool(comp.get("status", {}).get("type", {}).get("completed"))
            try:
                hs, as_ = int(home["score"]), int(away["score"])
            except (TypeError, ValueError, KeyError):
                hs = as_ = None
            if not completed:
                hs = as_ = None
            out.append({
                "week": week, "iso": ev["date"], "neutral": bool(comp.get("neutralSite", False)),
                "hid": hid, "aid": aid, "hinfo": hinfo, "ainfo": ainfo,
                "hs": hs, "as": as_, "completed": completed,
            })
    return out


def when(iso):
    """(date, day, time24) in US Eastern from an ESPN ISO timestamp."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ET)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%a"), dt.strftime("%H:%M")
    except Exception:
        return iso[:10], "", ""


def main():
    this_year = time.gmtime().tm_year
    seasons = []
    for yr in range(FIRST, this_year + 2):
        if bd.load_season_teams(yr):
            seasons.append(yr)
    print(f"seasons: {seasons}")

    elo = defaultdict(lambda: bd.BASE)   # team_id -> running rating, carried across seasons
    teams_idx = {}                       # id -> {abbr,name,logo,color} (latest season wins)
    data = {}

    for si, season in enumerate(seasons):
        if si > 0:                       # offseason regression toward the mean
            for a in list(elo.keys()):
                elo[a] = bd.BASE + bd.CARRY * (elo[a] - bd.BASE)

        fbs = set(bd.load_season_teams(season).keys())
        ttl = 0.25 if season >= this_year else 30.0
        games = load_all_games(season, ttl)
        # chronological: played games (earlier) move Elo before we read it for later/upcoming ones
        games.sort(key=lambda g: g["iso"])

        rows = []
        for g in games:
            h, a = g["hid"], g["aid"]
            h_fbs, a_fbs = h in fbs, a in fbs
            if not h_fbs and not a_fbs:
                continue
            teams_idx[h] = g["hinfo"]; teams_idx[a] = g["ainfo"]
            he = elo[h] if h_fbs else bd.FCS_ELO
            ae = elo[a] if a_fbs else bd.FCS_ELO
            hfa = 0.0 if g["neutral"] else bd.HFA
            hwp = bd.win_prob(he, ae, hfa)

            # Elo at stake at a representative margin (zero-sum per game)
            d1 = bd.K * mov_mult(he + hfa, ae, MARGIN) * (1 - hwp)   # home wins
            d2 = bd.K * mov_mult(ae, he + hfa, MARGIN) * hwp         # away wins

            date, day, tm = when(g["iso"])
            rows.append({
                "wk": g["week"], "date": date, "day": day, "time": tm,
                "away": a, "home": h,
                "ae": round(ae), "he": round(he), "hwp": round(hwp, 3),
                "hWin": round(d1), "hLoss": -round(d2), "aWin": round(d2), "aLoss": -round(d1),
                "neutral": g["neutral"],
                "as": g["as"], "hs": g["hs"],
            })

            if g["completed"] and g["hs"] is not None:   # only played games move Elo
                nh, na = bd.update(he, ae, g["hs"], g["as"], g["neutral"])
                if h_fbs:
                    elo[h] = nh
                if a_fbs:
                    elo[a] = na

        data[str(season)] = rows
        played = sum(1 for r in rows if r["hs"] is not None)
        print(f"  {season}: {len(rows)} games ({played} played)")

    OUT.mkdir(exist_ok=True)
    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "seasons": list(data.keys()),
        "teams": teams_idx,
        "data": data,
    }
    path = OUT / "games.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {path}  ({path.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()

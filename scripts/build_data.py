#!/usr/bin/env python3
"""
build_data.py  —  Samalytics NCAAF Elo engine

Builds the dataset the site serves, straight from ESPN's public college-football
API (no key required). One combined elo.json across seasons + a meta manifest, so
adding a season needs no front-end code changes -- just re-run this script.

Model
-----
Elo, 538-style. Every FBS team opens 2021 at 1500. Each game moves the two teams
by a margin-of-victory-scaled K update with a home-field bump (neutral sites get
none). Between seasons a team keeps most of its rating but is pulled part-way back
to 1500 (CARRY), so a good program stays good but nobody is locked in -- "some
brevity between seasons". Ratings run through the END OF THE REGULAR SEASON
(including conference championship games); that is the rating a team carries INTO
the College Football Playoff, which is exactly what a selection model should use.
Games against non-FBS (FCS) opponents update only the FBS side, against a fixed
FCS baseline rating.

Committee / selection model
---------------------------
The CFP field is chosen by a committee, not by a bracket. We model that committee
score as:

    committee = elo
              + W_CONF * (avg_conf_elo - 1500)   # strong leagues get a bump
              + CONF_MANUAL[conf]                 # hand-tuned league prestige +/-
              + W_WINPCT * (win_pct - 0.5)        # committee rewards gaudy records
              - W_LOSS   * losses                 # ... and punishes extra losses

`avg_conf_elo` is the mean Elo of a conference's FBS members, so the model
automatically leans toward whichever leagues are strong that year; CONF_MANUAL is
the extra thumb-on-the-scale prestige adjustment (SEC/Big Ten up, Group of Five
down). Conference champions are the top team of each league by committee score.

Playoff format & rules
----------------------
    2021-2023: 4-team CFP. Top 4 committee scores. SF 1v4 / 2v3, then the final,
               all at neutral sites.
    2024+ :    12-team CFP. The 5 highest-ranked conference champions get
               automatic bids; the field is filled to 12 with the best at-large
               teams. Seeds 1-4 get first-round byes.
                 2024 seeding: byes reserved for the 4 top-ranked conf champions.
                 2025+ seeding: straight seeding -- byes to the 4 best teams
                                overall (5 champs still auto-qualify).
               First round (5-12, higher seed hosts) -> quarters -> semis ->
               final, everything after the first round at neutral sites.

Playoff odds are a Monte-Carlo. Each simulation perturbs the committee scores
(residual selection/results uncertainty), re-selects and re-seeds the field, then
plays the bracket forward from each team's Elo. So the odds fold in both bubble
uncertainty and bracket randomness -- a bubble team gets a real, partial playoff%.

Outputs (data/)
    elo.json    per-season teams, seeds, odds, and the Elo trend for the chart
    teams.json  abbr -> name / color / logo / conf
    meta.json   season manifest + latest + per-season playoff format

Usage
    python scripts/build_data.py
"""
import json
import math
import time
import urllib.request
import urllib.error
from collections import defaultdict
from pathlib import Path

import numpy as np

# ── model constants ─────────────────────────────────────────────────────────
FIRST_SEASON = 2021
BASE      = 1500.0     # league average
K         = 42.0       # update speed (CFB has few games + a wide talent spread)
HFA       = 65.0       # home-field advantage, in Elo points (~2.5 pts)
CARRY     = 0.70       # offseason: new = 1500 + CARRY*(old - 1500)  (regress 30%)
FCS_ELO   = 1290.0     # fixed rating used for non-FBS (FCS) opponents
N_SIMS    = 20000      # Monte-Carlo simulations per season
SEL_NOISE = 45.0       # committee-score noise per sim (bubble/results uncertainty)
SEED      = 17

# committee model weights
W_CONF    = 0.25       # weight on (conference average Elo - 1500)
W_WINPCT  = 45.0       # reward for win% above .500 (committee loves a gaudy record)
W_LOSS    = 14.0       # penalty per loss (committee hates a second/third loss)

# hand-tuned league prestige, in Elo points. Names are matched by substring so
# "American Conference" and "American Athletic Conference" both hit the AAC entry.
CONF_MANUAL_KEYS = [
    ("Southeastern", 12.0),
    ("Big Ten", 9.0),
    ("Big 12", 1.0),
    ("Atlantic Coast", 0.0),
    ("Pac-12", 4.0),
    ("American", -8.0),
    ("Mountain West", -11.0),
    ("Sun Belt", -11.0),
    ("Conference USA", -15.0),
    ("Mid-American", -15.0),
    ("Independent", -3.0),
]

def conf_manual(conf_name: str) -> float:
    for key, val in CONF_MANUAL_KEYS:
        if key.lower() in conf_name.lower():
            return val
    return 0.0

# per-season playoff format / seeding rule
def cfp_format(season: int) -> str:
    return "cfp12" if season >= 2024 else "cfp4"

def seed_mode(season: int) -> str:
    # 2024 reserved the top-4 seeds (byes) for the best conference champions;
    # 2025 moved to straight seeding.
    return "champ_byes" if season == 2024 else "straight"

OUT   = Path(__file__).resolve().parent.parent / "data"
CACHE = Path(__file__).resolve().parent / ".cache"

ESPN = "https://site.api.espn.com/apis"
CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"


# ── tiny cached fetcher ──────────────────────────────────────────────────────
def fetch(url: str, cache_key: str, ttl_days: float = 30.0):
    CACHE.mkdir(exist_ok=True)
    fp = CACHE / (cache_key + ".json")
    if fp.exists() and (time.time() - fp.stat().st_mtime) < ttl_days * 86400:
        try:
            return json.loads(fp.read_text())
        except Exception:
            pass
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "curl/8.1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
            fp.write_text(json.dumps(data))
            return data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == 3:
                raise
            time.sleep(1.5 * (attempt + 1))
    return None


# ── Elo math ─────────────────────────────────────────────────────────────────
def win_prob(elo_a: float, elo_b: float, hfa: float = 0.0) -> float:
    """P(team A beats team B), with hfa Elo added to A (0 = neutral site)."""
    return 1.0 / (1.0 + 10.0 ** (-((elo_a + hfa) - elo_b) / 400.0))


def update(elo_h, elo_a, score_h, score_a, neutral):
    """Return (new_home, new_away) after one game."""
    hfa = 0.0 if neutral else HFA
    exp_h = win_prob(elo_h, elo_a, hfa)
    if score_h > score_a:
        s_h, elo_w, elo_l = 1.0, elo_h + hfa, elo_a
    elif score_h < score_a:
        s_h, elo_w, elo_l = 0.0, elo_a, elo_h + hfa
    else:
        s_h, elo_w, elo_l = 0.5, elo_h + hfa, elo_a
    margin = max(abs(score_h - score_a), 1)
    mult = math.log(margin + 1.0) * (2.2 / ((elo_w - elo_l) * 0.001 + 2.2))
    delta = K * mult * (s_h - exp_h)
    return elo_h + delta, elo_a - delta


# ── FBS membership + team meta, per season ───────────────────────────────────
def team_detail(tid: str):
    """Cached (global, season-independent) team info: abbr/name/color/logo."""
    d = fetch(f"{CORE}/seasons/2024/teams/{tid}?lang=en&region=us", f"team_{tid}", ttl_days=120)
    logos = d.get("logos") or []
    color = d.get("color")
    return {
        "abbr": d.get("abbreviation") or d.get("shortDisplayName") or tid,
        "name": d.get("displayName") or d.get("name") or tid,
        "color": ("#" + color) if color and not color.startswith("#") else (color or "#0B691C"),
        "logo": (logos[0].get("href") if logos else
                 f"https://a.espncdn.com/i/teamlogos/ncaa/500/{tid}.png"),
    }


def _id_from_ref(ref: str) -> str:
    return ref.split("/teams/")[1].split("?")[0]


def load_season_teams(season: int):
    """Return {team_id: {abbr,name,conf,color,logo}} for every FBS team, that season,
    from ESPN's authoritative core groups→teams membership (handles realignment)."""
    ch = fetch(f"{CORE}/seasons/{season}/types/2/groups/80/children?limit=50",
               f"confs_{season}")
    out = {}
    for item in ch.get("items", []):
        g = fetch(item["$ref"], f"conf_{season}_{item['$ref'].split('/groups/')[1].split('?')[0]}")
        conf = g.get("name", "FBS Independents")
        tref = g.get("teams", {}).get("$ref")
        if not tref:
            continue
        sep = "&" if "?" in tref else "?"
        tl = fetch(tref + f"{sep}limit=50", f"confteams_{season}_{g.get('id')}")
        for t in tl.get("items", []):
            tid = _id_from_ref(t["$ref"])
            info = team_detail(tid)
            out[tid] = {**info, "conf": conf}
    return out


def load_games(season: int):
    """All regular-season games (seasontype=2), incl. conference title games."""
    games = []
    for week in range(1, 18):
        url = (f"{ESPN}/site/v2/sports/football/college-football/scoreboard"
               f"?groups=80&dates={season}&seasontype=2&week={week}&limit=200")
        d = fetch(url, f"sb_{season}_reg_w{week}")
        events = d.get("events", [])
        if not events:
            continue
        for ev in events:
            comp = ev["competitions"][0]
            if comp.get("status", {}).get("type", {}).get("completed") is False:
                continue
            cs = comp["competitors"]
            if len(cs) != 2:
                continue
            home = next((c for c in cs if c["homeAway"] == "home"), None)
            away = next((c for c in cs if c["homeAway"] == "away"), None)
            if not home or not away:
                continue
            try:
                hs, as_ = int(home["score"]), int(away["score"])
            except (TypeError, ValueError):
                continue
            games.append({
                "date": ev["date"][:10],
                "home": str(home["team"]["id"]),
                "away": str(away["team"]["id"]),
                "hs": hs, "as": as_,
                "neutral": bool(comp.get("neutralSite", False)),
            })
    return games


# ── committee model ──────────────────────────────────────────────────────────
def committee_scores(fbs, elo, rec, meta):
    """team_id -> committee score, folding in conf strength + prestige + resume."""
    # average Elo by conference
    by_conf = defaultdict(list)
    for a in fbs:
        by_conf[meta[a]["conf"]].append(elo[a])
    avg_conf = {c: sum(v) / len(v) for c, v in by_conf.items()}

    cs = {}
    for a in fbs:
        conf = meta[a]["conf"]
        r = rec[a]
        g = r["w"] + r["l"]
        wp = r["w"] / g if g else 0.0
        cs[a] = (elo[a]
                 + W_CONF * (avg_conf[conf] - BASE)
                 + conf_manual(conf)
                 + W_WINPCT * (wp - 0.5)
                 - W_LOSS * r["l"])
    return cs, avg_conf


def conf_champions(fbs, cs, meta):
    """conf -> team_id of its highest committee score (Independents excluded)."""
    best = {}
    for a in fbs:
        conf = meta[a]["conf"]
        if "independent" in conf.lower():
            continue
        if conf not in best or cs[a] > cs[best[conf]]:
            best[conf] = a
    return best  # conf -> team_id


def select_field(fbs, cs, champs, fmt, smode):
    """Return (ordered_field, {team_id: seed}, byes:set). Field ordered by seed."""
    order = sorted(fbs, key=lambda a: -cs[a])
    if fmt == "cfp4":
        field = order[:4]
        seeds = {a: i + 1 for i, a in enumerate(field)}
        return field, seeds, set()

    # cfp12: 5 best conference champions auto-qualify, fill to 12 with best at-large
    champ_teams = sorted(champs.values(), key=lambda a: -cs[a])
    auto = champ_teams[:5]
    field = list(auto)
    for a in order:
        if len(field) >= 12:
            break
        if a not in field:
            field.append(a)

    if smode == "champ_byes":
        # top-4 seeds (byes) reserved for the 4 best conference champions
        top4 = auto[:4]
        rest = sorted([a for a in field if a not in top4], key=lambda a: -cs[a])
        ordered = top4 + rest
    else:  # straight seeding
        ordered = sorted(field, key=lambda a: -cs[a])

    seeds = {a: i + 1 for i, a in enumerate(ordered)}
    byes = {a for a, s in seeds.items() if s <= 4}
    return ordered, seeds, byes


# ── bracket sims ─────────────────────────────────────────────────────────────
def play(a, b, elo, neutral):
    p = win_prob(elo[a], elo[b], 0.0 if neutral else HFA)
    return a if np.random.random() < p else b


def sim_cfp4(seeds, elo, reach):
    s = {v: k for k, v in seeds.items()}  # seed -> team
    sf1 = play(s[1], s[4], elo, True)
    sf2 = play(s[2], s[3], elo, True)
    for t in (sf1, sf2):
        reach[t]["final"] += 1
    champ = play(sf1, sf2, elo, True)
    reach[champ]["champ"] += 1


def sim_cfp12(seeds, elo, reach):
    s = {v: k for k, v in seeds.items()}  # seed -> team
    # seeds 1-4 bye straight into the quarterfinals
    for sd in (1, 2, 3, 4):
        reach[s[sd]]["quarter"] += 1
    # first round: higher seed hosts (HFA)
    w89 = play(s[8], s[9], elo, False)
    w512 = play(s[5], s[12], elo, False)
    w611 = play(s[6], s[11], elo, False)
    w710 = play(s[7], s[10], elo, False)
    for t in (w89, w512, w611, w710):
        reach[t]["quarter"] += 1
    # quarters (neutral): 1v W(8/9), 4v W(5/12), 3v W(6/11), 2v W(7/10)
    q1 = play(s[1], w89, elo, True)
    q2 = play(s[4], w512, elo, True)
    q3 = play(s[3], w611, elo, True)
    q4 = play(s[2], w710, elo, True)
    for t in (q1, q2, q3, q4):
        reach[t]["semi"] += 1
    # semis (neutral)
    sf1 = play(q1, q2, elo, True)
    sf2 = play(q3, q4, elo, True)
    for t in (sf1, sf2):
        reach[t]["final"] += 1
    champ = play(sf1, sf2, elo, True)
    reach[champ]["champ"] += 1


def simulate(fbs, cs, meta, elo, fmt, smode, rng):
    """Monte-Carlo: perturb committee scores, re-select field, play the bracket."""
    keys = ("make", "quarter", "semi", "final", "champ")
    reach = {a: {k: 0 for k in keys} for a in fbs}
    ids = list(fbs)
    base_cs = np.array([cs[a] for a in ids])

    for _ in range(N_SIMS):
        noisy = base_cs + rng.normal(0.0, SEL_NOISE, size=len(ids))
        cmap = {a: float(noisy[i]) for i, a in enumerate(ids)}
        champs = conf_champions(fbs, cmap, meta)
        field, seeds, _ = select_field(fbs, cmap, champs, fmt, smode)
        for a in field:
            reach[a]["make"] += 1
        if fmt == "cfp4":
            sim_cfp4(seeds, elo, reach)
        else:
            sim_cfp12(seeds, elo, reach)

    odds = {}
    for a in fbs:
        r = reach[a]
        odds[a] = {k: round(r[k] / N_SIMS, 4) for k in keys}
    return odds


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    rng = np.random.default_rng(SEED)
    np.random.seed(SEED)

    # discover which seasons actually have data
    seasons = []
    for yr in range(FIRST_SEASON, 2027):
        tm = load_season_teams(yr)
        if not tm:
            continue
        g = load_games(yr)
        if not g:
            continue
        seasons.append(yr)
    print(f"seasons with data: {seasons}")

    elo = defaultdict(lambda: BASE)     # team_id -> running rating, carried across seasons
    meta_all = {}                       # abbr -> {name,color,logo,conf} (latest season wins)
    id_to_abbr = {}
    elo_json = {}

    for si, season in enumerate(seasons):
        if si > 0:
            for a in list(elo.keys()):  # offseason regression toward the mean
                elo[a] = BASE + CARRY * (elo[a] - BASE)

        season_meta = load_season_teams(season)
        fbs = set(season_meta.keys())
        games = load_games(season)

        rec = {a: {"w": 0, "l": 0, "pf": 0, "pa": 0} for a in fbs}
        conf_rec = {a: {"w": 0, "l": 0} for a in fbs}
        trend = defaultdict(list)
        band_dates, seen = [], set()

        for g in sorted(games, key=lambda x: x["date"]):
            h, a = g["home"], g["away"]
            h_fbs, a_fbs = h in fbs, a in fbs
            if not h_fbs and not a_fbs:
                continue
            hs, as_ = g["hs"], g["as"]
            neutral = g["neutral"]

            eh = elo[h] if h_fbs else FCS_ELO
            ea = elo[a] if a_fbs else FCS_ELO
            nh, na = update(eh, ea, hs, as_, neutral)
            if h_fbs:
                elo[h] = nh
            if a_fbs:
                elo[a] = na

            # records + conference records (FBS teams only)
            same_conf = h_fbs and a_fbs and season_meta[h]["conf"] == season_meta[a]["conf"]
            for tm, mine, theirs, is_fbs in ((h, hs, as_, h_fbs), (a, as_, hs, a_fbs)):
                if not is_fbs:
                    continue
                rec[tm]["pf"] += mine; rec[tm]["pa"] += theirs
                won = mine > theirs
                rec[tm]["w" if won else "l"] += 1
                if same_conf:
                    conf_rec[tm]["w" if won else "l"] += 1

            d = g["date"]
            if h_fbs:
                trend[h].append({"date": d, "rating": round(elo[h], 1)})
            if a_fbs:
                trend[a].append({"date": d, "rating": round(elo[a], 1)})
            if d not in seen:
                seen.add(d); band_dates.append(d)

        # committee model, field, seeds, odds
        cs, avg_conf = committee_scores(fbs, elo, rec, season_meta)
        champs = conf_champions(fbs, cs, season_meta)
        fmt, smode = cfp_format(season), seed_mode(season)
        field, seeds, byes = select_field(fbs, cs, champs, fmt, smode)
        odds = simulate(fbs, cs, season_meta, elo, fmt, smode, rng)

        # conference rank (by committee score within league)
        by_conf = defaultdict(list)
        for a in fbs:
            by_conf[season_meta[a]["conf"]].append(a)
        conf_rank = {}
        for conf, teams in by_conf.items():
            for i, a in enumerate(sorted(teams, key=lambda x: -cs[x])):
                conf_rank[a] = i + 1

        # resolve unique abbr keys (disambiguate rare collisions with team id)
        used = {}
        key_of = {}
        for a in sorted(fbs, key=lambda x: -elo[x]):
            ab = season_meta[a]["abbr"]
            if ab in used and used[ab] != a:
                ab = f"{ab}{a[-2:]}"
            used[ab] = a
            key_of[a] = ab
            id_to_abbr[a] = ab
            m = season_meta[a]
            meta_all[ab] = {"name": m["name"], "color": m["color"], "logo": m["logo"], "conf": m["conf"]}

        teams_out = []
        for a in fbs:
            r = rec[a]
            g = r["w"] + r["l"]
            teams_out.append({
                "abbr": key_of[a],
                "name": season_meta[a]["name"],
                "logo": season_meta[a]["logo"],
                "conf": season_meta[a]["conf"],
                "seed": seeds.get(a),
                "bye": a in byes,
                "conf_rank": conf_rank[a],
                "elo": round(elo[a], 1),
                "cmt": round(cs[a], 1),
                "record": {"w": r["w"], "l": r["l"]},
                "conf_record": {"w": conf_rec[a]["w"], "l": conf_rec[a]["l"]},
                "win_pct": round(r["w"] / g, 4) if g else 0.0,
                "pf": r["pf"], "pa": r["pa"],
                "made": a in seeds,
                "odds": odds[a],
            })
        teams_out.sort(key=lambda t: -t["elo"])

        # band: min/max/avg of carried-forward ratings over the date scaffold
        carry = {key_of[a]: BASE for a in fbs}
        trend_by_key = {key_of[a]: trend[a] for a in fbs}
        idx = {k: 0 for k in carry}
        band = []
        for d in band_dates:
            for k in carry:
                pts = trend_by_key[k]
                while idx[k] < len(pts) and pts[idx[k]]["date"] <= d:
                    carry[k] = pts[idx[k]]["rating"]; idx[k] += 1
            vals = list(carry.values())
            band.append({"date": d, "min": round(min(vals), 1),
                         "max": round(max(vals), 1), "avg": round(sum(vals) / len(vals), 1)})

        # conference summary (avg elo + prestige adj) for the "why these odds" panel
        conf_summary = []
        for conf in sorted(by_conf, key=lambda c: -avg_conf[c]):
            conf_summary.append({
                "conf": conf,
                "n": len(by_conf[conf]),
                "avg_elo": round(avg_conf[conf], 1),
                "adj": round(W_CONF * (avg_conf[conf] - BASE) + conf_manual(conf), 1),
            })

        steps = ([{"key": "make", "label": "Playoff"},
                  {"key": "final", "label": "Final"},
                  {"key": "champ", "label": "Champion"}] if fmt == "cfp4" else
                 [{"key": "make", "label": "Playoff"},
                  {"key": "quarter", "label": "Quarterfinal"},
                  {"key": "semi", "label": "Semifinal"},
                  {"key": "final", "label": "Final"},
                  {"key": "champ", "label": "Champion"}])

        elo_json[str(season)] = {
            "season": str(season),
            "format": fmt,
            "field_size": 4 if fmt == "cfp4" else 12,
            "steps": steps,
            "teams": teams_out,
            "conf_summary": conf_summary,
            "trend": trend_by_key,
            "band": band,
        }
        champ = max(teams_out, key=lambda t: t["odds"]["champ"])
        top = teams_out[0]
        print(f"  {season} [{fmt}]: {len(teams_out)} FBS, "
              f"top Elo {top['abbr']} {top['elo']:.0f}, "
              f"title fav {champ['abbr']} {champ['odds']['champ']*100:.0f}%")

    OUT.mkdir(exist_ok=True)
    (OUT / "elo.json").write_text(json.dumps(elo_json, separators=(",", ":")))
    (OUT / "teams.json").write_text(json.dumps(meta_all, separators=(",", ":")))
    manifest = {
        "seasons": [{"code": str(s), "label": str(s), "format": cfp_format(s)} for s in seasons],
        "latest": str(seasons[-1]),
    }
    (OUT / "meta.json").write_text(json.dumps(manifest))
    print(f"wrote {OUT}/elo.json, teams.json, meta.json  ({len(meta_all)} teams)")


if __name__ == "__main__":
    main()

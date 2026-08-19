#!/usr/bin/env python3
"""
build_playoffs.py — actual College Football Playoff brackets (CFBD)

Once a season's playoff has been played, the Bracket page should show what
ACTUALLY happened — the real field, seeds, matchups, and scores — instead of the
preseason projection. This pulls CFP postseason games from CollegeFootballData,
reconstructs the bracket by round, derives each team's seed from the bracket
structure + the final committee ranking, and writes data/playoffs.json.

Seasons with no CFP games yet are simply omitted (the site keeps projecting).

Usage:
    python scripts/build_playoffs.py
"""
import json
import re
from pathlib import Path

import cfbd

OUT = Path(__file__).resolve().parent.parent / "data"
FIRST = 2021


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", "", (s or "").lower())).strip()


def is_cfp(notes):
    n = (notes or "").lower()
    return "college football playoff" in n or "cfp" in n

def round_of(notes):
    n = (notes or "").lower()
    if not is_cfp(notes):   # exclude FCS/DII/DIII playoff games
        return None
    if "first round" in n:
        return "R1"
    if "quarterfinal" in n:
        return "QF"
    if "semifinal" in n:
        return "SF"
    if "national championship" in n:
        return "F"
    return None


def committee_ranks(year):
    """{normalized school: final committee rank} for the season."""
    try:
        data = cfbd.get("/rankings", year=year)
    except Exception:
        return {}
    best = None
    for wk in data:
        for poll in wk.get("polls", []):
            if "playoff committee" in poll.get("poll", "").lower():
                if best is None or wk.get("week", 0) >= best[0]:
                    best = (wk.get("week", 0), poll)
    if not best:
        return {}
    return {norm(r["school"]): r["rank"] for r in best[1]["ranks"]}


def team_meta(year):
    out = {}
    for t in cfbd.get("/teams/fbs", year=year):
        logos = t.get("logos") or []
        out[norm(t["school"])] = {"team": t["school"], "abbr": t.get("abbreviation") or t["school"],
                                  "conf": t.get("conference"), "logo": logos[0] if logos else None}
    return out


def _game_slot(g):
    return {"top": {"name": g["homeTeam"], "score": g["homePoints"]},
            "bottom": {"name": g["awayTeam"], "score": g["awayPoints"]},
            "winner": "top" if g["homePoints"] > g["awayPoints"] else "bottom"}


def _finalize(fmt, field_size, rounds_raw, meta, seed):
    def slot(s):
        name = s["name"]
        m = meta.get(norm(name), {"team": name, "abbr": name, "logo": None})
        return {"abbr": m["abbr"], "team": m["team"], "logo": m["logo"],
                "seed": seed.get(norm(name)), "score": s["score"]}
    rounds = {}
    for rd, gms in rounds_raw.items():
        if not gms:
            continue
        out = [{"top": slot(g["top"]), "bottom": slot(g["bottom"]), "winner": g["winner"]} for g in gms]
        out.sort(key=lambda gm: min(gm["top"]["seed"] or 99, gm["bottom"]["seed"] or 99))
        rounds[rd] = out
    champ = None
    if rounds.get("F"):
        f = rounds["F"][0]
        champ = f[f["winner"]]
    return {"format": fmt, "field_size": field_size, "rounds": rounds, "champion": champ}


def build_season(year):
    try:
        games = cfbd.get("/games", year=year, seasonType="postseason")
    except Exception:
        return None
    fbs_games = [g for g in games
                 if g.get("homeClassification") == "fbs" and g.get("awayClassification") == "fbs"
                 and g.get("homePoints") is not None and g.get("awayPoints") is not None]
    cfp = [(round_of(g.get("notes")), g) for g in fbs_games if round_of(g.get("notes"))]
    champ_game = next((g for rd, g in cfp if rd == "F"), None)
    if not champ_game:
        return None
    meta = team_meta(year)
    ranks = committee_ranks(year)

    # ── 4-team era: only the title game is CFP-tagged. Rebuild the semifinals
    #    from the committee top 4 (seeds 1-4) and the actual games between them.
    if not any(rd in ("R1", "QF") for rd, _ in cfp):
        top4 = sorted([n for n in ranks if ranks[n] <= 4], key=lambda n: ranks[n])[:4]
        if len(top4) < 4:
            return None
        seed = {n: i + 1 for i, n in enumerate(top4)}
        sf = []
        for a, b in ((top4[0], top4[3]), (top4[1], top4[2])):   # 1v4, 2v3
            gm = next((g for g in fbs_games if {norm(g["homeTeam"]), norm(g["awayTeam"])} == {a, b}), None)
            if gm:
                sf.append(_game_slot(gm))
        return _finalize("cfp4", 4, {"SF": sf, "F": [_game_slot(champ_game)]}, meta, seed)

    # ── 12-team era: rounds come straight from the game notes ────────────────
    hosts = {norm(g["homeTeam"]) for rd, g in cfp if rd == "R1"}
    visitors = {norm(g["awayTeam"]) for rd, g in cfp if rd == "R1"}
    played = hosts | visitors
    byes = {norm(g[s + "Team"]) for rd, g in cfp if rd == "QF"
            for s in ("home", "away") if norm(g[s + "Team"]) not in played}
    seed = {}
    for tier, base in ((sorted(byes, key=lambda n: ranks.get(n, 999)), 1),
                       (sorted(hosts, key=lambda n: ranks.get(n, 999)), 5),
                       (sorted(visitors, key=lambda n: ranks.get(n, 999)), 9)):
        for i, n in enumerate(tier):
            seed[n] = base + i
    rounds_raw = {"R1": [], "QF": [], "SF": [], "F": []}
    for rd, g in cfp:
        rounds_raw[rd].append(_game_slot(g))
    return _finalize("cfp12", 12, rounds_raw, meta, seed)


def main():
    import time
    out = {}
    for y in range(FIRST, time.gmtime().tm_year + 1):
        s = build_season(y)
        if s:
            out[str(y)] = s
            n = sum(len(v) for v in s["rounds"].values())
            print(f"  {y} [{s['format']}]: {n} games, champion {s['champion']['abbr'] if s['champion'] else '—'}")
    OUT.mkdir(exist_ok=True)
    (OUT / "playoffs.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT}/playoffs.json ({len(out)} seasons)")


if __name__ == "__main__":
    main()

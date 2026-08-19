"""Confirm CFBD endpoint shapes for the win-total model. Run once the key is set:
    python scripts/probe_cfbd.py
Prints one sample row from each feature source so we can lock the field names.
"""
import json
import cfbd

YEAR = 2024


def show(label, path, **params):
    try:
        data = cfbd.get(path, **params)
        n = len(data) if isinstance(data, list) else "?"
        sample = data[0] if isinstance(data, list) and data else data
        print(f"\n=== {label}  ({path})  n={n} ===")
        print(json.dumps(sample, indent=1)[:900])
    except Exception as e:
        print(f"\n=== {label}  ({path}) === ERROR: {e}")


if __name__ == "__main__":
    show("recruiting (team class rank/points)", "/recruiting/teams", year=YEAR)
    show("talent (roster 247 composite)", "/talent", year=YEAR)
    show("returning production", "/player/returning", year=YEAR)
    show("transfer portal", "/player/portal", year=YEAR)
    show("SP+ ratings", "/ratings/sp", year=YEAR)
    show("games (for SoS)", "/games", year=YEAR, seasonType="regular")

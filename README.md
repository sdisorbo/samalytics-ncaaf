# Samalytics NCAAF Engine

Team Elo ratings, standings, and Monte-Carlo playoff odds for the NCAAF — a sister
site to the Samalytics NHL & MLB engines. Next.js 14 (App Router) + Tailwind, deployed on Vercel.

## Model

- **Elo** — every team opens the **2021** season at **1500**. Games move the two teams by a
  margin-of-victory-adjusted update (538-style) with a home-field bump (~48 Elo). Between
  seasons a team keeps 70% of its distance from 1500 (**regress 30% toward the mean**), so
  strength carries over without fully resetting.
- **Playoffs** — seeds and the bracket are read from the **actual** postseason games in the
  schedule (who hosted the Wild Card round, who had the bye), so historical brackets are exact.
  From each team's end-of-season Elo we Monte-Carlo the bracket (30k sims) for the chance of
  reaching each round and winning the Super Bowl.

## Pages

- **Standings** (`/`) — League / Division / Wild Card views, with record, games back, Elo
  (conditionally formatted), and playoff odds through every round.
- **Elo Ratings** (`/elo`) — end-of-season Elo leaderboard plus each team's path across the season.

## Data

All data comes from live [nflverse](https://github.com/nflverse) data via `nflreadpy`.
Rebuild the committed JSON with:

```bash
npm run data      # -> python scripts/build_data.py
```

Seasons: 2021–2025. `data/*.json` is committed on purpose — it's the published dataset the site serves.

## Develop

```bash
npm install
npm run dev       # http://localhost:3000
npm run build
```

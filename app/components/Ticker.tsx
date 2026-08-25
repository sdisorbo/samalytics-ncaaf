import { GAMES, team, defaultSeason, defaultWeek, fmtTime, type Game } from "../lib/games";

function Item({ g }: { g: Game }) {
  const a = team(g.away), h = team(g.home);
  const played = g.hs != null && g.as != null;
  const awayWin = played && (g.as as number) > (g.hs as number);
  return (
    <span className="ticker-item">
      {a.logo ? <img src={a.logo} alt="" loading="lazy" /> : null}
      <span style={awayWin ? { fontWeight: 800 } : undefined}>{a.abbr}</span>
      {played ? <span className="tabular-nums" style={awayWin ? { fontWeight: 800 } : undefined}>{g.as}</span> : <span className="tk-sep">@</span>}
      {h.logo ? <img src={h.logo} alt="" loading="lazy" /> : null}
      <span style={played && !awayWin ? { fontWeight: 800 } : undefined}>{h.abbr}</span>
      {played ? <span className="tabular-nums" style={played && !awayWin ? { fontWeight: 800 } : undefined}>{g.hs}</span> : null}
      <span className="tk-when">{played ? "Final" : `${g.day} ${fmtTime(g.time).replace(" ET", "")}`}</span>
    </span>
  );
}

export default function Ticker() {
  const season = defaultSeason();
  const week = defaultWeek(season);
  const games = (GAMES[season] ?? [])
    .filter((g) => g.wk === week)
    .sort((a, b) => (b.ae + b.he) - (a.ae + a.he)); // best matchups lead
  if (!games.length) return null;

  const dur = Math.max(45, Math.round(games.length * 3.2)); // constant speed regardless of count
  const list = (key: string) => games.map((g, i) => <Item key={`${key}-${g.away}-${g.home}-${i}`} g={g} />);

  return (
    <div className="ticker-wrap" aria-label={`Week ${week} scoreboard`}>
      <div className="ticker-track" style={{ animationDuration: `${dur}s` }}>
        {list("a")}
        {list("b")}
      </div>
    </div>
  );
}

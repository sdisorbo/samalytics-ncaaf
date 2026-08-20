"use client";
import { useMemo, useState } from "react";
import {
  GAMES, GAMES_SEASONS, GAMES_UPDATED, TEAMS, team, weeksFor, defaultWeek, defaultSeason, fmtTime, fmtDay, type Game,
} from "../lib/games";

function swing(win: number, loss: number) {
  return (
    <span className="tabular-nums">
      <span style={{ color: "var(--heat-green)" }}>W {win >= 0 ? "+" : ""}{win}</span>
      <span className="text-s-muted"> / L {loss}</span>
    </span>
  );
}

function TeamRow({ id, elo, pct, win, loss, score, isHome, played, isTop }:
  { id: string; elo: number; pct: number; win: number; loss: number; score: number | null; isHome: boolean; played: boolean; isTop: boolean }) {
  const t = team(id);
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {t.logo
        ? <img src={t.logo} alt={t.abbr} width={34} height={34} className="object-contain shrink-0" style={{ width: 34, height: 34 }} loading="lazy" />
        : <span className="shrink-0 inline-block" style={{ width: 34, height: 34 }} />}
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm truncate">
          <span className="hidden sm:inline">{t.name}</span>
          <span className="sm:hidden">{t.abbr}</span>
          {isHome && <span className="ml-1.5 text-2xs text-s-muted font-normal">(home)</span>}
        </div>
        <div className="text-2xs text-s-muted">Elo {elo.toFixed(0)} · {swing(win, loss)}</div>
      </div>
      <div className="text-right shrink-0 w-16">
        {played ? (
          <span className="text-xl font-black tabular-nums" style={{ color: isTop ? "var(--heat-green)" : "var(--color-muted)" }}>{score}</span>
        ) : (
          <span className="text-lg font-black tabular-nums" style={{ color: isTop ? "var(--heat-green)" : "var(--color-text)" }}>{pct}%</span>
        )}
      </div>
    </div>
  );
}

function GameCard({ g }: { g: Game }) {
  const played = g.hs != null && g.as != null;
  const homeTop = played ? (g.hs as number) >= (g.as as number) : g.hwp >= 0.5;
  const homePct = Math.round(g.hwp * 100);
  const awayPct = 100 - homePct;
  return (
    <div className="stat-card !p-3">
      <div className="flex items-center justify-between text-2xs text-s-muted mb-1">
        <span>{fmtTime(g.time)}{g.neutral ? " · neutral site" : ""}</span>
        <span>{played ? "Final" : "Win probability"}</span>
      </div>
      <TeamRow id={g.away} elo={g.ae} pct={awayPct} win={g.aWin} loss={g.aLoss} score={g.as} isHome={false} played={played} isTop={!homeTop} />
      {!played && (() => {
        const favColor = team(homeTop ? g.home : g.away).color;
        return (
          <div className="h-1 rounded-full overflow-hidden my-0.5 flex" style={{ background: "var(--color-border)" }}>
            <div style={{ width: `${awayPct}%`, background: homeTop ? "var(--color-border)" : favColor }} />
            <div style={{ width: `${homePct}%`, background: homeTop ? favColor : "var(--color-border)" }} />
          </div>
        );
      })()}
      <TeamRow id={g.home} elo={g.he} pct={homePct} win={g.hWin} loss={g.hLoss} score={g.hs} isHome={true} played={played} isTop={homeTop} />
    </div>
  );
}

export default function GamesView() {
  const [season, setSeason] = useState<string>(defaultSeason);
  const [week, setWeek] = useState<number>(() => defaultWeek(defaultSeason()));

  const weeks = useMemo(() => weeksFor(season), [season]);
  const idx = weeks.indexOf(week);

  function changeSeason(s: string) { setSeason(s); setWeek(defaultWeek(s)); }
  function step(d: number) { const ni = idx + d; if (ni >= 0 && ni < weeks.length) setWeek(weeks[ni]); }

  const byDay = useMemo(() => {
    const games = (GAMES[season] ?? []).filter((g) => g.wk === week);
    const map = new Map<string, Game[]>();
    for (const g of games.sort((a, b) =>
      a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || (b.hwp - 0.5) ** 2 - (a.hwp - 0.5) ** 2)) {
      if (!map.has(g.date)) map.set(g.date, []);
      map.get(g.date)!.push(g);
    }
    return Array.from(map.entries());
  }, [season, week]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className="ctl" value={season} onChange={(e) => changeSeason(e.target.value)}>
          {GAMES_SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="segment items-center">
          <button onClick={() => step(-1)} disabled={idx <= 0} style={{ opacity: idx <= 0 ? 0.35 : 1 }}>‹ Prev</button>
          <span className="px-3 font-bold text-sm tabular-nums">Week {week}</span>
          <button onClick={() => step(1)} disabled={idx >= weeks.length - 1} style={{ opacity: idx >= weeks.length - 1 ? 0.35 : 1 }}>Next ›</button>
        </div>
        <span className="text-2xs text-s-muted ml-auto hidden sm:block">Win % &amp; Elo swings from each team&apos;s pre-game Elo.</span>
      </div>

      {byDay.map(([date, games]) => (
        <div key={date} className="mb-5">
          <div className="section-heading">{fmtDay(date, games[0].day)} · {games.length} game{games.length === 1 ? "" : "s"}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => <GameCard key={`${g.away}-${g.home}-${g.date}`} g={g} />)}
          </div>
        </div>
      ))}
      {byDay.length === 0 && <p className="text-s-muted text-sm">No games for this week.</p>}

      <p className="text-2xs text-s-muted mt-2">
        Data through {GAMES_UPDATED}. Win probability from both teams&apos; Elo (home field +65 Elo unless a
        neutral site). Elo swings show what each team gains on a win / loses on a loss at a representative
        margin. Upcoming games use each team&apos;s preseason-projected Elo and update as the season plays out.
      </p>
    </>
  );
}

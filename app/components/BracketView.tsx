"use client";
import { useEffect, useMemo, useState } from "react";
import { SEASONS, SEASON_LABEL, DEFAULT_SEASON, type Season } from "../lib/data";
import { getField, buildGames, simulate, applyPick, clearPick, type SlotView, type GameView } from "../lib/bracket";

const ROUND_TITLE: Record<string, string> = { R1: "First Round", QF: "Quarterfinals", SF: "Semifinals", F: "National Championship" };
const ROUND_ORDER = ["R1", "QF", "SF", "F"];

function fmtPct(p: number): string {
  if (p >= 0.9995) return "100%";
  if (p <= 0) return "—";
  if (p < 0.01) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export default function BracketView() {
  const [season, setSeason] = useState<Season>(DEFAULT_SEASON);
  const [forced, setForced] = useState<Record<string, string>>({});
  useEffect(() => { setForced({}); }, [season]);

  const { field, format } = useMemo(() => getField(season), [season]);
  const games = useMemo(() => buildGames(field, format), [field, format]);
  const teamMap = useMemo(() => new Map(field.map((t) => [t.abbr, t])), [field]);
  const sim = useMemo(() => simulate(field, games, forced), [field, games, forced]);

  function pick(gid: string, abbr: string) {
    setForced((f) => (f[gid] === abbr ? clearPick(gid, abbr, f, games) : applyPick(gid, abbr, f, games)));
  }

  // group games into round columns
  const columns = useMemo(() => {
    const byRound = new Map<string, GameView[]>();
    for (const g of games) {
      const gv = sim.games[g.id];
      (byRound.get(g.round) ?? byRound.set(g.round, []).get(g.round)!).push(gv);
    }
    return ROUND_ORDER.filter((r) => byRound.has(r)).map((r) => ({ round: r, title: ROUND_TITLE[r], games: byRound.get(r)! }));
  }, [games, sim]);

  const Slot = ({ gid, sv, winner }: { gid: string; sv: SlotView; winner: boolean }) => {
    const t = teamMap.get(sv.abbr);
    if (!t) return null;
    const op = sv.forced ? 1 : 0.3 + 0.7 * sv.winP;
    const gray = sv.forced ? 0 : Math.round((1 - sv.winP) * 55);
    return (
      <button className="brk-slot" data-forced={sv.forced} data-win={winner && !sv.forced}
        onClick={() => pick(gid, sv.abbr)} title={`Click to advance ${t.name}`}>
        <span className="brk-seed">{t.seed}</span>
        {t.logo ? <img src={t.logo} alt={sv.abbr} className="brk-logo" loading="lazy"
          style={{ opacity: op, filter: `grayscale(${gray}%)` }} /> : null}
        <span className="brk-abbr" style={{ opacity: sv.forced ? 1 : 0.55 + 0.45 * sv.winP }}>{sv.abbr}</span>
        <span className="brk-pct">{fmtPct(sv.winP)}</span>
      </button>
    );
  };

  const champTeam = teamMap.get(sim.champ.abbr);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
          {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABEL[s]}</option>)}
        </select>
        {Object.keys(forced).length > 0 && (
          <button className="pill on" onClick={() => setForced({})}>Reset picks</button>
        )}
        <span className="text-2xs text-s-muted ml-auto hidden md:block">
          Faded = less likely to advance. Click any team to send it through — the rest update.
        </span>
      </div>

      <div className="stat-card">
        <div className="brk-scroll">
          <div className="brk-row">
            {columns.map((col) => (
              <div key={col.round} className="brk-col">
                <div className="brk-col-title">{col.title}</div>
                {col.games.map((g) => (
                  <div key={g.id} className="brk-game">
                    <Slot gid={g.id} sv={g.a} winner={g.a.winP >= g.b.winP} />
                    <Slot gid={g.id} sv={g.b} winner={g.b.winP > g.a.winP} />
                  </div>
                ))}
              </div>
            ))}

            {/* champion column */}
            <div className="brk-col" style={{ justifyContent: "center", minWidth: 150 }}>
              <div className="brk-col-title">Champion</div>
              <div className="brk-champ">
                <div className="text-2xl mb-1">🏆</div>
                {champTeam?.logo ? (
                  <img src={champTeam.logo} alt={sim.champ.abbr} width={44} height={44}
                    className="object-contain mx-auto mb-1" />
                ) : null}
                <div className="font-black text-sm leading-tight">{champTeam?.name ?? "—"}</div>
                <div className="text-2xs text-s-muted mt-1">{fmtPct(sim.champ.p)} to win it all</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-2xs text-s-muted mt-3 leading-relaxed max-w-3xl">
        The bracket assumes the projected {format === "cfp12" ? "12" : "4"}-team field (see the Standings
        page). Each percentage is a team&apos;s chance to win that game and advance, from a Monte-Carlo of the
        bracket played off end-of-season Elo (first-round higher seeds host; later rounds are neutral). Pin a
        team and its whole path locks in, so you can play out any what-if and watch the odds shift.
      </p>
    </>
  );
}

"use client";
import { PLAYOFFS, type PlayoffSlot } from "../lib/playoffs";

const ROUND_TITLE: Record<string, string> = { R1: "First Round", QF: "Quarterfinals", SF: "Semifinals", F: "National Championship" };
const ROUND_ORDER = ["R1", "QF", "SF", "F"];

function Slot({ s, won }: { s: PlayoffSlot; won: boolean }) {
  return (
    <div className="brk-slot" data-win={won} style={won ? undefined : { opacity: 0.5 }}>
      <span className="brk-seed">{s.seed ?? ""}</span>
      {s.logo ? <img src={s.logo} alt={s.abbr} className="brk-logo"
        style={won ? undefined : { filter: "grayscale(55%)" }} loading="lazy" /> : null}
      <span className="brk-abbr">{s.abbr}</span>
      <span className="brk-pct" style={won ? { color: "var(--color-accent)" } : undefined}>{s.score}</span>
    </div>
  );
}

export default function ActualBracket({ season }: { season: string }) {
  const data = PLAYOFFS[season];
  if (!data) return null;
  const columns = ROUND_ORDER.filter((r) => data.rounds[r]?.length);

  return (
    <div className="brk-scroll">
      <div className="brk-row">
        {columns.map((r) => (
          <div key={r} className="brk-col">
            <div className="brk-col-title">{ROUND_TITLE[r]}</div>
            {data.rounds[r].map((g, i) => (
              <div key={i} className="brk-game">
                <Slot s={g.top} won={g.winner === "top"} />
                <Slot s={g.bottom} won={g.winner === "bottom"} />
              </div>
            ))}
          </div>
        ))}
        <div className="brk-col" style={{ justifyContent: "center", minWidth: 150 }}>
          <div className="brk-col-title">Champion</div>
          <div className="brk-champ">
            <img src="/cfp_logo.png" alt="College Football Playoff" width={40} height={40} className="object-contain mx-auto mb-1.5" />
            {data.champion?.logo ? (
              <img src={data.champion.logo} alt={data.champion.abbr} width={44} height={44} className="object-contain mx-auto mb-1" />
            ) : null}
            <div className="font-black text-sm leading-tight">{data.champion?.team ?? "—"}</div>
            <div className="text-2xs text-s-muted mt-1">National Champion</div>
          </div>
        </div>
      </div>
    </div>
  );
}

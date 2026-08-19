"use client";
import { Fragment, useMemo, useState } from "react";
import { WINS, WIN_SEASONS, WIN_LATEST, type WinTeam } from "../lib/wins";

const SCALE = 13; // wins axis 0..13
const pos = (w: number) => `${Math.max(0, Math.min(1, w / SCALE)) * 100}%`;

type Mode = "edge" | "proj";

function Row({ t, rank }: { t: WinTeam; rank: number }) {
  const v = t.vegas;
  const over = v != null && t.proj >= v;
  const lo = v != null ? Math.min(v, t.proj) : t.proj;
  const hi = v != null ? Math.max(v, t.proj) : t.proj;
  const edge = v != null ? t.proj - v : null;
  return (
    <div className="win-row">
      <div className="win-label"><span className="r">{rank}</span>{t.abbr}</div>
      <div className="win-track">
        {[2, 4, 6, 8, 10, 12].map((g) => <span key={g} className="win-grid" style={{ left: pos(g) }} />)}
        {v != null && (
          <div className={`win-bar ${over ? "over" : "under"}`}
            style={{ left: pos(lo), width: `${((hi - lo) / SCALE) * 100}%` }} />
        )}
        {v != null && <div className="win-vegas" style={{ left: pos(v) }} data-v={v} />}
        {t.actual != null && <div className="win-actual" style={{ left: pos(t.actual) }} title={`${t.actual} actual wins`} />}
        {t.logo && <img className="win-logo" src={t.logo} alt={t.abbr} style={{ left: pos(t.proj) }} loading="lazy" />}
      </div>
      <div className={`win-edge ${edge == null ? "" : edge >= 0 ? "over" : "under"}`}>
        {edge == null ? t.proj.toFixed(1) : `${edge >= 0 ? "+" : ""}${edge.toFixed(1)}`}
      </div>
    </div>
  );
}

export default function WinsView() {
  const [season, setSeason] = useState<string>(WIN_LATEST);
  const [mode, setMode] = useState<Mode>("edge");
  const teams = WINS[season] ?? [];
  const started = teams.some((t) => t.actual != null);

  const groups = useMemo(() => {
    const withV = teams.filter((t) => t.vegas != null);
    if (mode === "proj") {
      const rows = teams.slice().sort((a, b) => b.proj - a.proj);
      return [{ title: null as string | null, rows }];
    }
    const over = withV.filter((t) => t.proj >= (t.vegas as number)).sort((a, b) => (b.proj - (b.vegas as number)) - (a.proj - (a.vegas as number)));
    const under = withV.filter((t) => t.proj < (t.vegas as number)).sort((a, b) => (b.proj - (b.vegas as number)) - (a.proj - (a.vegas as number)));
    return [
      { title: "Model over Vegas", rows: over },
      { title: "Model under Vegas", rows: under },
    ];
  }, [teams, mode]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value)}>
          {WIN_SEASONS.map((s) => <option key={s} value={s}>{s}{s === WIN_LATEST && !started ? " (preseason)" : ""}</option>)}
        </select>
        <div className="segment">
          <button className={mode === "edge" ? "on" : ""} onClick={() => setMode("edge")}>vs Vegas</button>
          <button className={mode === "proj" ? "on" : ""} onClick={() => setMode("proj")}>By projection</button>
        </div>
        <span className="text-2xs text-s-muted ml-auto hidden md:flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span style={{ width: 2, height: 12, background: "var(--color-muted)", display: "inline-block" }} />Vegas</span>
          <span className="inline-flex items-center gap-1"><span style={{ width: 14, height: 6, borderRadius: 3, background: "var(--heat-green)", display: "inline-block" }} />projection</span>
          {started && <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-text)", display: "inline-block" }} />actual</span>}
        </span>
      </div>

      <div className="stat-card">
        <div className="win-axis">
          {[0, 2, 4, 6, 8, 10, 12].map((g) => <span key={g} style={{ left: pos(g) }}>{g}</span>)}
        </div>
        {groups.map((g, gi) => (
          <Fragment key={g.title ?? "all"}>
            {g.title && <div className="win-split">{g.title}</div>}
            {g.rows.map((t, i) => <Row key={t.abbr + gi} t={t} rank={i + 1} />)}
          </Fragment>
        ))}
      </div>

      <p className="text-2xs text-s-muted mt-3 leading-relaxed max-w-3xl">
        Each bar runs from the Vegas win total to our model&apos;s projection; the logo sits at the projection.
        Green = we&apos;re over the number, copper = under. The dot is the team&apos;s actual win count once the
        season is underway. The model (ridge regression on prior Elo, SP+, returning production, recruiting,
        transfer-portal haul, and strength of schedule) matches Vegas&apos;s accuracy out-of-sample (RMSE ≈ 2.4
        wins) and beats the over/under ~53% of the time when it shows an edge.
      </p>
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { ELO, SEASONS, SEASON_LABEL, DEFAULT_SEASON, type Season } from "../lib/data";
import { teamColor } from "../lib/teams";

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${m}/${day}`;
}
function smooth(a: number[], w = 5) {
  const n = a.length;
  return a.map((_, i) => {
    const lo = Math.max(0, i - (w >> 1)), hi = Math.min(n, i + (w >> 1) + 1);
    let s = 0; for (let j = lo; j < hi; j++) s += a[j];
    return s / (hi - lo);
  });
}

export default function EloChart({ season: ctrlSeason }: { season?: Season } = {}) {
  const [ownSeason, setSeason] = useState<Season>(DEFAULT_SEASON);
  const season = ctrlSeason ?? ownSeason;
  const controlled = ctrlSeason != null;
  const data = ELO[season];
  // order the toggle chips by end-of-season Elo (teams array is already sorted)
  const ordered = useMemo(() => data.teams.map((t) => t.abbr), [data]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(data.teams.slice(0, 1).map((t) => t.abbr)));

  const { chartData, lastIdx } = useMemo(() => {
    const dates = data.band.map((b) => b.date);
    const sm: Record<string, number[]> = {};
    for (const abbr of ordered) {
      const byDate = new Map((data.trend[abbr] ?? []).map((p) => [p.date, p.rating]));
      let last = data.open?.[abbr] ?? 1500; const arr: number[] = [];
      for (const d of dates) { if (byDate.has(d)) last = byDate.get(d)!; arr.push(last); }
      sm[abbr] = smooth(arr);
    }
    const rows = dates.map((d, i) => {
      const vals = ordered.map((a) => sm[a][i]);
      const row: Record<string, number | string | number[]> = { date: d, band: [Math.min(...vals), Math.max(...vals)] };
      for (const a of sel) row[a] = sm[a][i];
      return row;
    });
    return { chartData: rows, lastIdx: rows.length - 1 };
  }, [data, ordered, sel]);

  function toggle(abbr: string) {
    setSel((s) => { const n = new Set(s); n.has(abbr) ? n.delete(abbr) : n.add(abbr); return n; });
  }
  const endDot = (abbr: string) => (props: { cx?: number; cy?: number; index?: number }) =>
    props.index === lastIdx && props.cx != null
      ? <circle key={abbr} cx={props.cx} cy={props.cy} r={4.5} fill="#fff" stroke={teamColor(abbr)} strokeWidth={2} />
      : <g key={`${abbr}-${props.index}`} />;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {!controlled && (
          <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
            {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABEL[s]}</option>)}
          </select>
        )}
        <button className="pill" onClick={() => setSel(new Set(ordered.slice(0, 10)))}>Top 10</button>
        <button className="pill" onClick={() => setSel(new Set(ordered.slice(0, 25)))}>Top 25</button>
        <button className="pill" onClick={() => setSel(new Set())}>Clear</button>
        <span className="text-2xs text-s-muted">{sel.size} team{sel.size === 1 ? "" : "s"} shown</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-4">
        {ordered.slice(0, 48).map((abbr) => (
          <button key={abbr} onClick={() => toggle(abbr)}
            className="text-2xs font-semibold px-2 py-1 rounded border transition-colors"
            style={sel.has(abbr)
              ? { background: teamColor(abbr), color: "#fff", borderColor: teamColor(abbr) }
              : { borderColor: "var(--color-border)", color: "var(--color-muted)" }}>
            {abbr}
          </button>
        ))}
      </div>

      <div className="stat-card">
        <ResponsiveContainer width="100%" height={440}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDate} minTickGap={48}
              tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={{ stroke: "var(--color-border)" }} />
            <YAxis domain={["dataMin - 20", "dataMax + 20"]} tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickLine={false} axisLine={false} width={44} />
            <ReferenceLine y={1500} stroke="var(--color-muted)" strokeDasharray="5 5"
              label={{ value: "1500 avg", position: "insideBottomLeft", fontSize: 10, fill: "var(--color-muted)" }} />
            <Area type="monotone" dataKey="band" stroke="var(--color-muted)" strokeOpacity={0.55} strokeDasharray="4 4"
              strokeWidth={1.25} fill="var(--color-muted)" fillOpacity={0.14} isAnimationActive={false} activeDot={false} />
            {[...sel].map((abbr) => (
              <Line key={abbr} type="monotone" dataKey={abbr} stroke={teamColor(abbr)} strokeWidth={2.5}
                dot={endDot(abbr)} isAnimationActive animationDuration={1800} animationEasing="ease-in-out" />
            ))}
            <Tooltip labelFormatter={(d) => String(d)}
              formatter={(v: number, n: string) => (n === "band" ? [null, null] : [Math.round(v), n])} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

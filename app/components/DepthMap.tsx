"use client";
import { useEffect, useMemo, useState } from "react";

type Play = { type: "rec" | "rush"; yards: number; ppa: number; down: number; td: boolean };
type Metric = "volume" | "epa" | "yards";
type TypeSel = "rec" | "rush" | "both";

const Y_MIN = -10, Y_MAX = 60, STEP = 5;          // depth domain (yards past LOS)
const W = 300, H = 500, TOP = 16, BOT = 16;
const PLOT = H - TOP - BOT;
const yPix = (v: number) => TOP + ((Y_MAX - Math.max(Y_MIN, Math.min(Y_MAX, v))) / (Y_MAX - Y_MIN)) * PLOT;
const bands = Array.from({ length: (Y_MAX - Y_MIN) / STEP }, (_, i) => Y_MIN + i * STEP); // lower edge
const hash = (i: number) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); }; // 0..1

const RB = new Set(["RB", "FB"]);

export default function DepthMap({ id, name, position, seasons }:
  { id: string; name: string; position: string; seasons: { year: number; team: string }[] }) {
  const isRB = RB.has(position);
  const [year, setYear] = useState(seasons[0]?.year);
  const [metric, setMetric] = useState<Metric>("volume");
  const [typeSel, setTypeSel] = useState<TypeSel>(isRB ? "both" : "rec");
  const [stuff, setStuff] = useState(false);
  const [plays, setPlays] = useState<Play[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const teamOf = (y: number) => seasons.find((s) => s.year === y)?.team || "";

  useEffect(() => {
    if (!year) return;
    setPlays(null);
    fetch(`/api/player/plays?n=${encodeURIComponent(name)}&year=${year}&team=${encodeURIComponent(teamOf(year))}`)
      .then((r) => r.json()).then((d) => setPlays(d.plays || [])).catch(() => setPlays([]));
  }, [year, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const all = plays || [];
    if (!isRB || typeSel === "both") return all;
    return all.filter((p) => p.type === typeSel);
  }, [plays, isRB, typeSel]);

  // per-band aggregates
  const stats = useMemo(() => {
    const b = bands.map(() => ({ n: 0, epa: 0, yds: 0 }));
    for (const p of shown) {
      let i = Math.floor((Math.max(Y_MIN, Math.min(Y_MAX - 0.001, p.yards)) - Y_MIN) / STEP);
      if (i < 0) i = 0; if (i >= b.length) i = b.length - 1;
      b[i].n++; b[i].epa += p.ppa; b[i].yds += p.yards;
    }
    const maxN = Math.max(1, ...b.map((x) => x.n));
    const avgEpa = b.map((x) => (x.n ? x.epa / x.n : 0));
    const maxAbsEpa = Math.max(0.001, ...avgEpa.map(Math.abs));
    const avgYds = b.map((x) => (x.n ? x.yds / x.n : 0));
    const maxYds = Math.max(0.001, ...avgYds.map((v) => Math.abs(v)));
    return { b, maxN, avgEpa, maxAbsEpa, avgYds, maxYds, total: shown.length };
  }, [shown]);

  const stuffed = useMemo(() => {
    const runs = (plays || []).filter((p) => p.type === "rush");
    const s = runs.filter((p) => p.yards <= 0).length;
    return { pct: runs.length ? Math.round((100 * s) / runs.length) : 0, s, n: runs.length };
  }, [plays]);

  const heat = (i: number): string => {
    const s = stats.b[i]; if (!s.n) return "transparent";
    let t = 0;
    if (metric === "volume") t = s.n / stats.maxN;
    else if (metric === "epa") { const a = stats.avgEpa[i]; return a >= 0 ? `rgba(214,73,91,${(0.12 + 0.68 * a / stats.maxAbsEpa).toFixed(3)})` : `rgba(80,110,190,${(0.12 + 0.55 * -a / stats.maxAbsEpa).toFixed(3)})`; }
    else t = Math.abs(stats.avgYds[i]) / stats.maxYds;
    return `rgba(214,73,91,${(0.1 + 0.7 * t).toFixed(3)})`;
  };

  const hv = hover != null ? stats.b[hover] : null;

  return (
    <div className="mt-7">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <h2 className="text-lg font-black tracking-tight">Field map <span className="text-s-muted font-normal text-sm">· depth past the LOS</span></h2>
        <select className="ctl" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {seasons.map((s) => <option key={s.year} value={s.year}>{s.year} · {s.team}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="segment">
          {(["volume", "epa", "yards"] as Metric[]).map((m) => (
            <button key={m} className={metric === m ? "on" : ""} onClick={() => setMetric(m)}>
              {m === "volume" ? "% of plays" : m === "epa" ? "EPA" : "Avg yards"}
            </button>
          ))}
        </div>
        {isRB && (
          <div className="segment">
            {(["rush", "rec", "both"] as TypeSel[]).map((t) => (
              <button key={t} className={typeSel === t ? "on" : ""} onClick={() => setTypeSel(t)}>
                {t === "rush" ? "Rushing" : t === "rec" ? "Receiving" : "Both"}
              </button>
            ))}
          </div>
        )}
        {isRB && <button className={`pill ${stuff ? "on" : ""}`} onClick={() => setStuff((v) => !v)}>Stuffed ≤ LOS</button>}
      </div>

      <div className="grid md:grid-cols-[300px_1fr] gap-5 items-start">
        <div className="relative mx-auto" style={{ width: W }}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="rounded-lg block" style={{ background: "#2f7a43" }}>
            {/* 10-yard stripes */}
            {Array.from({ length: 8 }, (_, k) => Y_MIN + k * 10).map((v, k) => (
              <rect key={v} x={0} y={yPix(v + 10)} width={W} height={yPix(v) - yPix(v + 10)} fill={k % 2 ? "#2f7a43" : "#35854a"} />
            ))}
            {/* heat bands */}
            {bands.map((v, i) => (
              <rect key={i} x={0} y={yPix(v + STEP)} width={W} height={yPix(v) - yPix(v + STEP)} fill={heat(i)}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "crosshair" }} />
            ))}
            {/* yard lines + labels */}
            {Array.from({ length: 7 }, (_, k) => k * 10).map((v) => (
              <g key={v}>
                <line x1={0} x2={W} y1={yPix(v)} y2={yPix(v)} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
                <text x={5} y={yPix(v) - 3} fontSize={9} fill="rgba(255,255,255,0.7)">{v === 0 ? "" : `+${v}`}</text>
              </g>
            ))}
            {/* stuffed zone */}
            {stuff && <rect x={0} y={yPix(0)} width={W} height={yPix(Y_MIN) - yPix(0)} fill="rgba(209,73,91,0.35)" />}
            {/* LOS + first down */}
            <line x1={0} x2={W} y1={yPix(0)} y2={yPix(0)} stroke="#2b6cff" strokeWidth={3} />
            <text x={W - 5} y={yPix(0) - 4} fontSize={10} fill="#bcd2ff" textAnchor="end" fontWeight="bold">LOS</text>
            <line x1={0} x2={W} y1={yPix(10)} y2={yPix(10)} stroke="#ffd21e" strokeWidth={2.5} />
            <text x={W - 5} y={yPix(10) - 4} fontSize={10} fill="#ffe98a" textAnchor="end" fontWeight="bold">1st down</text>
            {/* dots — real plays, jittered horizontally (width is not tracked) */}
            {shown.map((p, i) => (
              <circle key={i} cx={W / 2 + (hash(i) - 0.5) * W * 0.62} cy={yPix(p.yards)} r={p.td ? 4.5 : 3.4}
                fill={p.type === "rush" ? "#111827" : "#ffffff"} fillOpacity={0.85}
                stroke={p.td ? "#ffd21e" : "rgba(0,0,0,0.35)"} strokeWidth={p.td ? 1.5 : 0.6} />
            ))}
            {plays == null && <text x={W / 2} y={H / 2} fontSize={12} fill="#fff" textAnchor="middle">loading plays…</text>}
          </svg>
          <div className="flex justify-center gap-3 mt-1.5 text-2xs text-s-muted">
            {isRB
              ? <><Dot c="#ffffff" /> catch <Dot c="#111827" /> carry <span>· ring = TD</span></>
              : <><Dot c="#ffffff" /> catch <span>· gold ring = TD</span></>}
          </div>
        </div>

        <div className="text-sm">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat label="Plays" value={String(stats.total)} />
            <Stat label="Avg depth" value={stats.total ? `${(shown.reduce((a, p) => a + p.yards, 0) / stats.total).toFixed(1)} yd` : "-"} />
            <Stat label="EPA/play" value={stats.total ? (shown.reduce((a, p) => a + p.ppa, 0) / stats.total).toFixed(2) : "-"} />
          </div>
          {isRB && (
            <div className="stat-card !p-3 mb-4">
              <div className="text-2xs uppercase tracking-wide text-s-muted font-bold mb-0.5">Stuffed at / before LOS</div>
              <div className="text-2xl font-black" style={{ color: "var(--heat-purple)" }}>{stuffed.pct}%</div>
              <div className="text-2xs text-s-muted">{stuffed.s} of {stuffed.n} carries for ≤ 0 yards</div>
            </div>
          )}
          <div className="stat-card !p-3" style={{ minHeight: 96 }}>
            {hv && hv.n ? (
              <>
                <div className="font-bold mb-1">{bands[hover as number]} to {bands[hover as number] + STEP} yds past LOS</div>
                <div className="grid grid-cols-2 gap-y-1 text-2xs">
                  <span className="text-s-muted">Plays here</span><span className="text-right font-semibold">{hv.n} ({Math.round(100 * hv.n / (stats.total || 1))}%)</span>
                  <span className="text-s-muted">Avg gain</span><span className="text-right font-semibold">{(hv.yds / hv.n).toFixed(1)} yd</span>
                  <span className="text-s-muted">Avg EPA</span><span className="text-right font-semibold" style={{ color: hv.epa >= 0 ? "var(--heat-green)" : "var(--heat-purple)" }}>{(hv.epa / hv.n).toFixed(2)}</span>
                </div>
              </>
            ) : <div className="text-2xs text-s-muted">Hover a band on the field for its average stats.</div>}
          </div>
          <p className="text-2xs text-s-muted mt-3 leading-relaxed">
            Each dot is a real {isRB ? "carry or catch" : "catch"} placed by its actual yards gained past the line of
            scrimmage (throw + YAC). Left-right position is not tracked in college data, so dots are spread only for
            legibility. Catch rate isn&apos;t available (no target data in CFB). Live from the CollegeFootballData API.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat-card !p-2.5"><div className="text-2xs uppercase tracking-wide text-s-muted font-bold">{label}</div><div className="text-lg font-black tabular-nums">{value}</div></div>;
}
function Dot({ c }: { c: string }) {
  return <span className="inline-block rounded-full align-middle" style={{ width: 9, height: 9, background: c, border: "1px solid rgba(0,0,0,0.3)" }} />;
}

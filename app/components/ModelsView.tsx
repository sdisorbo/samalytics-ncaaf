"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { ALICE, ALICE_SEASONS, aliceWeeks, MODELS_UPDATED, type AliceGame } from "../lib/models";

const m = ALICE.metrics;

// ── minimalist cumulative-units line for one season ──────────────────────────
function SeasonCurve() {
  const pts = m.season_curve.points;
  const W = 520, H = 120, PADX = 6, PADY = 10;
  const us = pts.map((p) => p.units);
  const lo = Math.min(0, ...us), hi = Math.max(0, ...us);
  const x = (i: number) => PADX + (i / (pts.length - 1)) * (W - 2 * PADX);
  const y = (u: number) => PADY + (1 - (u - lo) / (hi - lo || 1)) * (H - 2 * PADY);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.units).toFixed(1)}`).join(" ");
  const end = pts[pts.length - 1];
  const up = end.units >= 0;
  return (
    <div>
      <div className="section-heading">Cumulative units · {m.season_curve.season} season</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ height: 120 }}>
        <line x1={PADX} x2={W - PADX} y1={y(0)} y2={y(0)} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        <path d={d} fill="none" stroke={up ? "var(--heat-green)" : "var(--heat-purple)"} strokeWidth={2} />
      </svg>
      <div className="text-2xs text-s-muted mt-1">
        Flat $100 bets at -110. {m.season_curve.season} finished {up ? "+" : ""}{end.units} units ({end.acc}% of {pts.length} bets).
        One season swings a lot; the honest read is the multi-year rate below.
      </div>
    </div>
  );
}

function BinnedSuccess() {
  const bins = m.edge_bins;
  const Y0 = 45, Y1 = 56;
  const h = (v: number) => `${((Math.max(Y0, Math.min(Y1, v)) - Y0) / (Y1 - Y0)) * 100}%`;
  return (
    <div>
      <div className="section-heading">Hit rate by ALICE-vs-Vegas gap</div>
      <div className="edge-chart">
        <div className="edge-base" style={{ bottom: h(50) }} />
        <div className="edge-base" style={{ bottom: h(m.break_even), borderTopColor: "var(--heat-green)", opacity: 0.7 }} />
        {bins.map((b) => (
          <div key={b.label} className="col">
            <span className="bl">{b.acc}%</span>
            <div className="bar" style={{ height: h(b.acc), background: b.acc >= m.break_even ? "var(--heat-green)" : "var(--color-muted)" }} />
            <span className="cap">{b.label}<br />n={b.n}</span>
          </div>
        ))}
      </div>
      <div className="text-2xs text-s-muted mt-1">Green line = 52.4% break-even. The bars stay flat near 50% even when ALICE disagrees hard with the line, which means no edge to exploit.</div>
    </div>
  );
}

function HowItWorks() {
  const maxImp = Math.max(...m.features.map((f) => f.importance)) || 1;
  const beats = m.accuracy >= m.break_even;
  return (
    <details className="model-panel" open>
      <summary>How ALICE works &amp; how it holds up</summary>
      <div className="body">
        <p className="text-2xs text-s-muted leading-relaxed max-w-3xl">
          ALICE (Adaptive spread Learning with xGBoost Corrective Error) is a gradient-boosted regressor that
          predicts a game&apos;s home margin from the Vegas spread plus each team&apos;s 5-game rolling form:
          yards, TDs, penalty and return yards, kicking, turnovers, takeaways, sacks, EPA, rushes, passes,
          points and first downs, for home and away. Early-season games roll into the prior year, so week 1
          leans on last season. It bets whichever side the model thinks covers. Trained {m.seasons}, graded
          out-of-sample leave-one-season-out against the consensus line. What moves it most:
        </p>

        <div className="feat-bars">
          {m.features.map((f) => (
            <Fragment key={f.name}>
              <span className="fn">{f.name}</span>
              <span className="ft" style={{ width: `${(f.importance / maxImp) * 100}%`, background: "var(--heat-green)" }} />
              <span className="fv">{Math.round(f.importance * 100)}%</span>
            </Fragment>
          ))}
        </div>

        <div className={`rounded-lg p-3 my-4 text-2xs leading-relaxed`} style={{ background: "color-mix(in srgb, var(--heat-purple) 12%, var(--color-surface))", border: "1px solid var(--color-border)" }}>
          <b>The honest result.</b> Over {m.n.toLocaleString()} bets across {m.seasons}, ALICE hits{" "}
          <b style={{ color: beats ? "var(--heat-green)" : "var(--heat-purple)" }}>{m.accuracy}%</b>{" "}
          (95% CI {m.ci_low}-{m.ci_high}%) against a <b>{m.break_even}%</b> break-even. That is a coin flip: the
          single-season 56% from the 2022 write-up was variance and does not replicate out-of-sample (2021 is
          actually {"<"}50% here). The college spread market is efficient, and rolling box-score form does not
          beat it. This page reports that straight rather than curve-fitting a winner.
        </div>

        <table className="metric-table mb-4">
          <thead><tr><th></th><th>Bets</th><th>Hit rate</th></tr></thead>
          <tbody>
            <tr><td>All picks</td><td>{m.n.toLocaleString()}</td><td>{m.accuracy}%</td></tr>
            <tr><td>Picked away to cover</td><td>{m.away.n.toLocaleString()}</td><td>{m.away.acc}%</td></tr>
            <tr><td>Picked home to cover</td><td>{m.home.n.toLocaleString()}</td><td>{m.home.acc}%</td></tr>
          </tbody>
        </table>

        <div className="grid md:grid-cols-2 gap-6">
          <SeasonCurve />
          <BinnedSuccess />
        </div>
        <p className="text-2xs text-s-muted mt-3">F1 {m.f1} · precision {m.precision} · recall {m.recall} · balanced accuracy {m.balanced_acc}. Data live-refreshed from CollegeFootballData; updated {MODELS_UPDATED}.</p>
      </div>
    </details>
  );
}

function fmtSpread(s: number) { return s > 0 ? `+${s}` : `${s}`; }

function GamesTable({ games }: { games: AliceGame[] }) {
  if (!games.length) return <p className="text-s-muted text-sm">No lines posted for this week yet.</p>;
  return (
    <div className="stat-card overflow-x-auto">
      <table className="w-full text-sm tabular-nums" style={{ minWidth: 620 }}>
        <thead>
          <tr className="text-2xs uppercase tracking-wide text-s-muted">
            <th className="text-left font-semibold py-1.5 pr-2">Matchup</th>
            <th className="text-right font-semibold px-2" title="Consensus home spread">Vegas</th>
            <th className="text-right font-semibold px-2" title="ALICE home spread">ALICE</th>
            <th className="text-right font-semibold px-2">Edge</th>
            <th className="text-left font-semibold px-2">Pick</th>
            <th className="text-right font-semibold pl-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => {
            const pickTeam = g.pick === "away" ? g.away : g.home;
            return (
              <tr key={i} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2 pr-2"><span className="text-s-muted">{g.away}</span> @ <span className="font-semibold">{g.home}</span></td>
                <td className="px-2 text-right">{fmtSpread(g.vegas)}</td>
                <td className="px-2 text-right font-semibold">{fmtSpread(g.alice)}</td>
                <td className="px-2 text-right" style={{ color: g.edge >= 3 ? "var(--heat-green)" : "var(--color-muted)" }}>{g.edge}</td>
                <td className="px-2"><span className="text-2xs font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--color-accent)", color: "#fff" }}>{pickTeam} cover</span></td>
                <td className="pl-2 text-right">
                  {g.result
                    ? <span>{g.result.ap}-{g.result.hp}{g.correct != null && <b style={{ color: g.correct ? "var(--heat-green)" : "var(--heat-purple)", marginLeft: 6 }}>{g.correct ? "✓" : "✗"}</b>}</span>
                    : <span className="text-s-muted text-2xs">upcoming</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MODELS = [
  { key: "alice", name: "ALICE", tag: "Point spread", live: true },
  { key: "rebel", name: "REBEL", tag: "Coming soon", live: false },
];

export default function ModelsView() {
  const [model, setModel] = useState("alice");
  const [season, setSeason] = useState(ALICE.latest);
  const weeks = useMemo(() => aliceWeeks(season), [season]);
  const [week, setWeek] = useState<number>(weeks[0]);
  useEffect(() => { setWeek(aliceWeeks(season)[0]); }, [season]);
  const idx = weeks.indexOf(week);

  const games = useMemo(() => (ALICE.games[season] ?? []).filter((g) => g.week === week), [season, week]);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-5">
        {MODELS.map((mo) => (
          <button key={mo.key} onClick={() => mo.live && setModel(mo.key)} disabled={!mo.live}
            className="stat-card !py-2 !px-4 text-left transition-colors"
            style={{ opacity: mo.live ? 1 : 0.55, borderColor: model === mo.key ? "var(--color-accent)" : "var(--color-border)", background: model === mo.key ? "color-mix(in srgb, var(--color-accent) 8%, var(--color-surface))" : undefined }}>
            <div className="font-black">{mo.name}</div>
            <div className="text-2xs text-s-muted">{mo.tag}</div>
          </button>
        ))}
      </div>

      {model === "rebel" ? (
        <div className="stat-card text-center py-12">
          <div className="text-xl font-black mb-1">REBEL</div>
          <p className="text-sm text-s-muted">The original boosted betting model. Coming soon.</p>
        </div>
      ) : (
        <>
          <HowItWorks />

          <div className="flex flex-wrap items-center gap-2 my-4">
            <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value)}>
              {ALICE_SEASONS.slice().reverse().map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="segment items-center">
              <button onClick={() => idx > 0 && setWeek(weeks[idx - 1])} disabled={idx <= 0} style={{ opacity: idx <= 0 ? 0.35 : 1 }}>‹ Prev</button>
              <span className="px-3 font-bold text-sm tabular-nums">Week {week}</span>
              <button onClick={() => idx < weeks.length - 1 && setWeek(weeks[idx + 1])} disabled={idx >= weeks.length - 1} style={{ opacity: idx >= weeks.length - 1 ? 0.35 : 1 }}>Next ›</button>
            </div>
            <span className="text-2xs text-s-muted ml-auto hidden sm:block">Spreads are the home line. Biggest disagreements first.</span>
          </div>

          <GamesTable games={games} />
          <p className="text-2xs text-s-muted mt-3">A spread of -7 means that side is favored by 7. ALICE bets the side it projects to cover; presented for research, not betting advice.</p>
        </>
      )}
    </>
  );
}

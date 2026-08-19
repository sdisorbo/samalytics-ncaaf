"use client";
import { Fragment, useMemo, useState } from "react";
import { WINS, WIN_SEASONS, WIN_LATEST, WIN_METRICS, winConfShort, WIN_CONF_ORDER, type WinTeam } from "../lib/wins";

const SCALE = 13; // wins axis 0..13
const pos = (w: number) => `${Math.max(0, Math.min(1, w / SCALE)) * 100}%`;

type Mode = "edge" | "proj";

function ModelPanel() {
  const m = WIN_METRICS;
  const maxW = Math.max(...m.features.map((f) => f.w)) || 1;
  const EY0 = 45, EY1 = 60; // edge-chart y-range (%)
  const h = (v: number) => `${((Math.max(EY0, Math.min(EY1, v)) - EY0) / (EY1 - EY0)) * 100}%`;
  return (
    <details className="model-panel">
      <summary>How the model works &amp; how accurate it is</summary>
      <div className="body">
        <p className="text-2xs text-s-muted leading-relaxed max-w-3xl">
          Our model is {m.model_label}, trained on {m.n_train} team-seasons ({m.seasons}), predicting a
          team&apos;s regular-season wins from eight inputs knowable before kickoff. It&apos;s scored
          leave-one-season-out, so the numbers below are genuinely out-of-sample: the model never saw the
          season it&apos;s graded on. Bars are each input&apos;s share of the model&apos;s predictive power
          (green points toward more wins, copper toward fewer):
        </p>

        <div className="feat-bars">
          {m.features.map((f) => (
            <Fragment key={f.name}>
              <span className="fn">{f.name}</span>
              <span className="ft" style={{
                width: `${(f.w / maxW) * 100}%`,
                background: f.dir >= 0 ? "var(--heat-green)" : "var(--heat-purple)",
              }} />
              <span className="fv">{f.val}</span>
            </Fragment>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mt-3">
          <div>
            <div className="section-heading">Accuracy vs. Vegas ({m.overlap_n} team-seasons with a posted total)</div>
            <table className="metric-table">
              <thead><tr><th></th><th>RMSE</th><th>MAE</th><th>±1 win</th><th>±2 wins</th></tr></thead>
              <tbody>
                <tr><td>Our model</td><td>{m.model.rmse}</td><td>{m.model.mae}</td><td>{m.model.w1}%</td><td>{m.model.w2}%</td></tr>
                <tr><td>Vegas line</td><td>{m.vegas.rmse}</td><td>{m.vegas.mae}</td><td>{m.vegas.w1}%</td><td>{m.vegas.w2}%</td></tr>
              </tbody>
            </table>
            <p className="text-2xs text-s-muted mt-2 leading-relaxed">
              Essentially even with the market on raw error, and when the model does lean off the number, it
              hits the over/under <span className="font-bold" style={{ color: "var(--heat-green)" }}>{m.ou.pct}%</span> of
              the time ({m.ou.hits}/{m.ou.total}), past the ~52.4% break-even.
            </p>
          </div>

          <div>
            <div className="section-heading">Over/under hit rate by size of disagreement</div>
            <div className="edge-chart">
              <div className="edge-base" style={{ bottom: h(50) }} />
              {m.edge_bins.map((b) => (
                <div key={b.label} className="col">
                  <span className="bl">{b.hit_pct}%</span>
                  <div className="bar" style={{ height: h(b.hit_pct) }} />
                  <span className="cap">{b.label}<br />n={b.n}</span>
                </div>
              ))}
            </div>
            <p className="text-2xs text-s-muted mt-1 leading-relaxed">Bars above the dashed 50% line beat a coin flip; x-axis is the model&apos;s gap from the Vegas line, in wins.</p>
          </div>
        </div>
      </div>
    </details>
  );
}

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

// two worked examples above the table so the chart reads at a glance
function ExampleRow({ kind }: { kind: "over" | "under" }) {
  const over = kind === "over";
  const vegas = over ? 6.5 : 7.5;
  const proj = over ? 8.5 : 5.5;
  const lo = Math.min(vegas, proj), hi = Math.max(vegas, proj);
  const color = over ? "var(--wl-green)" : "var(--wl-red)";
  return (
    <>
      <div className="wl-row">
        <div className={`wl-pill ${kind}`}>{over ? "Over" : "Under"}</div>
        <div className="wl-track">
          {[2, 4, 6, 8, 10, 12].map((g) => <span key={g} className="win-grid" style={{ left: pos(g) }} />)}
          <div className="win-vegas" style={{ left: pos(vegas) }} />
          <span className="wl-tag bot" style={{ left: pos(vegas) }}>Vegas line ({vegas})</span>
          <div className={`wl-arrow ${over ? "right" : "left"}`}
            style={{ color, left: pos(lo), width: `${((hi - lo) / SCALE) * 100}%` }} />
          <div className="wl-dot" style={{ left: pos(proj), background: color }} />
          <span className="wl-tag top" style={{ left: pos(proj) }}>Our projection ({proj})</span>
        </div>
        <div className={`wl-edge ${kind}`}>{over ? "+" : ""}{(proj - vegas).toFixed(1)}</div>
      </div>
      <div className="wl-desc">
        {over ? (
          <>The projection sits to the <b className="over">right</b> of the Vegas line, so the model projects
            more wins than the market: a <b className="over">green Over</b> lean.</>
        ) : (
          <>The projection sits to the <b className="under">left</b> of the Vegas line, so the model projects
            fewer wins than the market: a <b className="under">red Under</b> lean.</>
        )}
      </div>
    </>
  );
}

function WinLegend() {
  return (
    <div className="win-legend">
      <div className="wl-head">How to read it</div>
      <ExampleRow kind="over" />
      <ExampleRow kind="under" />
    </div>
  );
}

export default function WinsView() {
  const [season, setSeason] = useState<string>(WIN_LATEST);
  const [mode, setMode] = useState<Mode>("edge");
  const [conf, setConf] = useState("all");
  const [q, setQ] = useState("");
  const teams = WINS[season] ?? [];
  const started = teams.some((t) => t.actual != null);

  const confs = useMemo(() => {
    const set = new Set(teams.map((t) => winConfShort(t.conf)));
    return [...set].sort((a, b) => {
      const ia = WIN_CONF_ORDER.indexOf(a), ib = WIN_CONF_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [teams]);

  const groups = useMemo(() => {
    let ts = teams.slice();
    if (conf !== "all") ts = ts.filter((t) => winConfShort(t.conf) === conf);
    const query = q.trim().toLowerCase();
    if (query) ts = ts.filter((t) => t.team.toLowerCase().includes(query) || t.abbr.toLowerCase().includes(query));
    const withV = ts.filter((t) => t.vegas != null);
    // no lines posted (or filtered away)? just show projections so it's never blank
    if (mode === "proj" || withV.length === 0) {
      return [{ title: null as string | null, rows: ts.sort((a, b) => b.proj - a.proj) }];
    }
    const edge = (t: WinTeam) => t.proj - (t.vegas as number);
    const over = withV.filter((t) => t.proj >= (t.vegas as number)).sort((a, b) => edge(b) - edge(a));
    const under = withV.filter((t) => t.proj < (t.vegas as number)).sort((a, b) => edge(b) - edge(a));
    return [
      { title: "Model over Vegas", rows: over },
      { title: "Model under Vegas", rows: under },
    ];
  }, [teams, mode, conf, q]);

  return (
    <>
      <ModelPanel />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value)}>
          {WIN_SEASONS.map((s) => <option key={s} value={s}>{s}{s === WIN_LATEST && !started ? " (preseason)" : ""}</option>)}
        </select>
        <div className="segment">
          <button className={mode === "edge" ? "on" : ""} onClick={() => setMode("edge")}>vs Vegas</button>
          <button className={mode === "proj" ? "on" : ""} onClick={() => setMode("proj")}>By win total</button>
        </div>
        <select className="ctl" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Filter by conference">
          <option value="all">All conferences</option>
          {confs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="ctl w-36" placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-2xs text-s-muted ml-auto hidden lg:flex items-center gap-3">
          <span className="inline-flex items-center gap-1"><span style={{ width: 2, height: 12, background: "var(--color-muted)", display: "inline-block" }} />Vegas</span>
          <span className="inline-flex items-center gap-1"><span style={{ width: 14, height: 6, borderRadius: 3, background: "var(--heat-green)", display: "inline-block" }} />projection</span>
          {started && <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-text)", display: "inline-block" }} />actual</span>}
        </span>
      </div>

      <WinLegend />

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
        season is underway.
      </p>
    </>
  );
}

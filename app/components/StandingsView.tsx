"use client";
import { Fragment, useMemo, useState } from "react";
import { ELO, SEASONS, SEASON_LABEL, DEFAULT_SEASON, type Season, type EloTeam, type OddsKey } from "../lib/data";
import { logoUrl, eloTextColor, oddsHeat, confShort, CONF_ORDER } from "../lib/teams";

type Mode = "all" | "conf" | "playoff";
type SortKey = "win_pct" | "elo" | "cmt" | OddsKey;

type Row = { t: EloTeam; rank: string };
type Section = { title: string | null; rows: Row[]; cutAfter?: number; cutLabel?: string };

function oddsCell(x: number | undefined, made: boolean) {
  if (!made || x == null || x <= 0) return <span className="text-s-muted">—</span>;
  const p = x * 100;
  const label = x >= 0.9995 ? "100%" : p < 1 ? "<1%" : `${p.toFixed(0)}%`;
  const { bg, fg } = oddsHeat(x);
  return <span className="inline-block rounded px-1.5 py-0.5 font-semibold" style={{ background: bg, color: fg }}>{label}</span>;
}

export default function StandingsView() {
  const [season, setSeason] = useState<Season>(DEFAULT_SEASON);
  const [mode, setMode] = useState<Mode>("all");
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [q, setQ] = useState("");
  const [conf, setConf] = useState("all");
  const data = ELO[season];
  const steps = data.steps;

  // conferences present this season, in canonical order (for the filter dropdown)
  const confs = useMemo(() => {
    const set = new Set(data.teams.map((t) => confShort(t.conf)));
    return [...set].sort((a, b) => {
      const ia = CONF_ORDER.indexOf(a), ib = CONF_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [data]);

  const sections = useMemo<Section[]>(() => {
    let teams = data.teams.slice();
    const query = q.trim().toLowerCase();
    if (query) teams = teams.filter((t) => t.name.toLowerCase().includes(query) || t.abbr.toLowerCase().includes(query));
    if (conf !== "all") teams = teams.filter((t) => confShort(t.conf) === conf);
    const byElo = (a: EloTeam, b: EloTeam) => b.elo - a.elo;

    if (mode === "conf") {
      const groups = new Map<string, EloTeam[]>();
      for (const t of teams) {
        const c = confShort(t.conf);
        (groups.get(c) ?? groups.set(c, []).get(c)!).push(t);
      }
      const order = [...groups.keys()].sort((a, b) => {
        const ia = CONF_ORDER.indexOf(a), ib = CONF_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      const confPct = (t: EloTeam) => {
        const g = t.conf_record.w + t.conf_record.l;
        return g ? t.conf_record.w / g : -1;
      };
      return order.map((c) => {
        const rows = groups.get(c)!.sort((a, b) => confPct(b) - confPct(a) || byElo(a, b));
        return { title: c, rows: rows.map((t, i) => ({ t, rank: String(i + 1) })) };
      });
    }

    if (mode === "playoff") {
      const field = teams.filter((t) => t.made).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
      if (data.format === "cfp12") {
        return [{
          title: `${data.field_size}-Team College Football Playoff`,
          rows: field.map((t) => ({ t, rank: `${t.seed}${t.bye ? " •" : ""}` })),
          cutAfter: 4, cutLabel: "First Round",
        }];
      }
      return [{ title: `${data.field_size}-Team Playoff — Semifinals`, rows: field.map((t) => ({ t, rank: String(t.seed) })) }];
    }

    // all / league
    const get = (t: EloTeam): number =>
      sortKey === "win_pct" || sortKey === "elo" || sortKey === "cmt"
        ? (t[sortKey] as number)
        : (t.odds[sortKey] ?? -1);
    const rows = teams.sort((a, b) => get(b) - get(a) || byElo(a, b));
    return [{ title: null, rows: rows.map((t, i) => ({ t, rank: String(i + 1) })) }];
  }, [data, mode, sortKey, q, conf]);

  const sortable = mode === "all";
  const th = (k: SortKey, label: string, extra = "") => (
    <th className={extra} onClick={sortable ? () => setSortKey(k) : undefined}
      style={{ cursor: sortable ? "pointer" : "default" }}>
      {label}{sortable && sortKey === k ? " ↓" : ""}
    </th>
  );
  const colSpan = 6 + steps.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select className="ctl" value={season} onChange={(e) => setSeason(e.target.value as Season)}>
          {SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABEL[s]}</option>)}
        </select>
        <div className="segment">
          {(["all", "conf", "playoff"] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "all" ? "All" : m === "conf" ? "Conference" : "Playoff"}
            </button>
          ))}
        </div>
        <select className="ctl" value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Filter by conference">
          <option value="all">All conferences</option>
          {confs.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="ctl w-36" placeholder="Search team…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-2xs text-s-muted ml-auto hidden md:block">
          {data.field_size}-team CFP · odds are a Monte-Carlo of committee selection + the bracket.
        </span>
      </div>

      <div className="stat-card !p-0">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="lft stk stk0">{mode === "playoff" ? "SD" : "#"}</th>
                <th className="lft stk stk1">Team</th>
                <th className="lft">Conf</th>
                <th>Record</th>
                {th("win_pct", "PCT")}
                {th("elo", "Elo")}
                {steps.map((s) => (
                  <th key={s.key} onClick={sortable ? () => setSortKey(s.key) : undefined}
                    style={{ cursor: sortable ? "pointer" : "default" }}>
                    {s.label}{sortable && sortKey === s.key ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, si) => (
                <Fragment key={sec.title ?? `s${si}`}>
                  {sec.title && (
                    <tr className="grp-row"><td className="lft" colSpan={colSpan}>{sec.title}</td></tr>
                  )}
                  {sec.rows.map((r, ri) => {
                    const t = r.t;
                    const cut = sec.cutAfter != null && ri === sec.cutAfter;
                    return (
                      <Fragment key={t.abbr}>
                        {cut && (
                          <tr className="cut-row"><td className="lft" colSpan={colSpan}>{sec.cutLabel}</td></tr>
                        )}
                        <tr>
                          <td className="lft text-s-muted stk stk0 font-semibold">{r.rank}</td>
                          <td className="lft stk stk1">
                            <span className="inline-flex items-center gap-2.5 font-semibold">
                              {logoUrl(t.abbr)
                                ? <img src={logoUrl(t.abbr)} alt={t.abbr} width={22} height={22} className="object-contain" loading="lazy" />
                                : null}
                              <span className="hidden sm:inline">{t.name}</span>
                              <span className="sm:hidden">{t.abbr}</span>
                            </span>
                          </td>
                          <td className="lft text-s-muted text-2xs tabular">
                            {mode === "conf" ? `${t.conf_record.w}-${t.conf_record.l}` : confShort(t.conf)}
                          </td>
                          <td className="tabular">{t.record.w}-{t.record.l}</td>
                          <td>{t.win_pct.toFixed(3).replace(/^0/, "")}</td>
                          <td className="font-bold" style={{ color: eloTextColor(t.elo) }}>{t.elo.toFixed(0)}</td>
                          {steps.map((s) => <td key={s.key}>{oddsCell(t.odds[s.key], t.made)}</td>)}
                        </tr>
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mode === "playoff" && (
        <p className="text-2xs text-s-muted mt-3 leading-relaxed max-w-3xl">
          {data.format === "cfp12"
            ? "Field of 12: the five highest-ranked conference champions earn automatic bids; the rest are the best at-large teams. Seeds 1–4 (•) get first-round byes."
            : "Field of 4: the committee's top four by the selection model (Elo + conference strength + résumé)."}
        </p>
      )}
    </>
  );
}

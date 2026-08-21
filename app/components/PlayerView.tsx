"use client";
import { useEffect, useState } from "react";
import DepthMap from "./DepthMap";

type Epa = { total: number; perPlay: number; pass: number; rush: number };
type Rec = { rec: number; yds: number; td: number; ypr: number; long: number };
type Rush = { car: number; yds: number; td: number; ypc: number; long: number };
type Pass = { att: number; cmp: number; yds: number; td: number; int: number; pct: number };
type Season = { year: number; team: string; conference?: string; position?: string; epa: Epa; rec: Rec | null; rush: Rush | null; pass: Pass | null };
type PlayerData = { id: string; name: string; position: string; teams: string[]; seasons: Season[]; note?: string };

const SKILL = new Set(["WR", "TE", "RB", "FB"]);
const n0 = (v: number) => Math.round(v).toLocaleString();
const n1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

export default function PlayerView({ id, name, team, pos }: { id: string; name: string; team: string; pos: string }) {
  const [data, setData] = useState<PlayerData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setData(null); setErr(false);
    fetch(`/api/player?id=${id}&n=${encodeURIComponent(name)}&p=${encodeURIComponent(pos)}`)
      .then((r) => r.json()).then(setData).catch(() => setErr(true));
  }, [id, name, pos]);

  if (err) return <p className="text-s-muted">Could not load this player.</p>;
  if (!data) return <Loading name={name} team={team} pos={pos} />;

  const s = data.seasons;
  const hasRec = s.some((x) => x.rec), hasRush = s.some((x) => x.rush), hasPass = s.some((x) => x.pass);
  const position = data.position || pos;
  const showMap = SKILL.has(position) && s.length > 0;

  const sum = (f: (x: Season) => number) => s.reduce((a, x) => a + f(x), 0);
  const tot = {
    rec: sum((x) => x.rec?.rec || 0), recYds: sum((x) => x.rec?.yds || 0), recTd: sum((x) => x.rec?.td || 0),
    car: sum((x) => x.rush?.car || 0), rushYds: sum((x) => x.rush?.yds || 0), rushTd: sum((x) => x.rush?.td || 0),
    att: sum((x) => x.pass?.att || 0), cmp: sum((x) => x.pass?.cmp || 0), passYds: sum((x) => x.pass?.yds || 0), passTd: sum((x) => x.pass?.td || 0), intc: sum((x) => x.pass?.int || 0),
    epa: sum((x) => x.epa.total),
  };

  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black tracking-tight">{data.name}</h1>
          {position && <span className="text-2xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--color-accent)", color: "#fff" }}>{position}</span>}
        </div>
        <p className="text-sm text-s-muted mt-1">{data.teams.join(" · ") || team} · {s.length} season{s.length === 1 ? "" : "s"} of EPA-era data</p>
      </div>

      <div className="stat-card overflow-x-auto">
        <table className="w-full text-sm tabular-nums" style={{ minWidth: 520 }}>
          <thead>
            <tr className="text-2xs uppercase tracking-wide text-s-muted">
              <th className="text-left font-semibold py-1.5 pr-2">Season</th>
              <th className="text-left font-semibold px-2">Team</th>
              {hasPass && <Group cols={["Cmp", "Att", "Yds", "TD", "Int"]} />}
              {hasRush && <Group cols={["Car", "Ru Yds", "YPC", "Ru TD"]} />}
              {hasRec && <Group cols={["Rec", "Re Yds", "YPR", "Re TD", "Lng"]} />}
              <th className="text-right font-semibold px-2" title="Total EPA (predicted points added)">EPA</th>
              <th className="text-right font-semibold pl-2" title="EPA per play">EPA/play</th>
            </tr>
          </thead>
          <tbody>
            {s.map((x) => (
              <tr key={x.year} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2 pr-2 font-bold">{x.year}</td>
                <td className="px-2 text-s-muted">{x.team}</td>
                {hasPass && <Cells v={x.pass ? [x.pass.cmp, x.pass.att, x.pass.yds, x.pass.td, x.pass.int] : null} />}
                {hasRush && <Cells v={x.rush ? [x.rush.car, x.rush.yds, x.rush.ypc, x.rush.td] : null} fmt={[n0, n0, n1, n0]} />}
                {hasRec && <Cells v={x.rec ? [x.rec.rec, x.rec.yds, x.rec.ypr, x.rec.td, x.rec.long] : null} fmt={[n0, n0, n1, n0, n0]} />}
                <td className="px-2 text-right font-bold" style={{ color: "var(--heat-green)" }}>{n1(x.epa.total)}</td>
                <td className="pl-2 text-right">{x.epa.perPlay.toFixed(2)}</td>
              </tr>
            ))}
            <tr className="border-t-2 font-bold" style={{ borderColor: "var(--color-border)" }}>
              <td className="py-2 pr-2">Career</td>
              <td className="px-2" />
              {hasPass && <Cells v={[tot.cmp, tot.att, tot.passYds, tot.passTd, tot.intc]} />}
              {hasRush && <Cells v={[tot.car, tot.rushYds, tot.car ? tot.rushYds / tot.car : 0, tot.rushTd]} fmt={[n0, n0, n1, n0]} />}
              {hasRec && <Cells v={[tot.rec, tot.recYds, tot.rec ? tot.recYds / tot.rec : 0, tot.recTd, 0]} fmt={[n0, n0, n1, n0, () => ""]} />}
              <td className="px-2 text-right" style={{ color: "var(--heat-green)" }}>{n1(tot.epa)}</td>
              <td className="pl-2 text-right text-s-muted" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-2xs text-s-muted mt-2">EPA = predicted points added (CFBD PPA). Loaded live from the CollegeFootballData API; EPA-era coverage begins 2013.</p>

      {showMap && <DepthMap id={id} name={data.name} position={position} seasons={s.map((x) => ({ year: x.year, team: x.team }))} />}
    </>
  );
}

function Group({ cols }: { cols: string[] }) {
  return <>{cols.map((c, i) => <th key={c} className={`text-right font-semibold px-2 ${i === 0 ? "border-l" : ""}`} style={i === 0 ? { borderColor: "var(--color-border)" } : undefined}>{c}</th>)}</>;
}
function Cells({ v, fmt }: { v: (number)[] | null; fmt?: ((n: number) => string)[] }) {
  const f = (i: number, x: number) => (fmt && fmt[i] ? fmt[i](x) : n0(x));
  return <>{(v ?? [null, null, null, null, null]).map((x, i) => (
    <td key={i} className={`px-2 text-right ${i === 0 ? "border-l" : ""}`} style={i === 0 ? { borderColor: "var(--color-border)" } : undefined}>
      {x == null ? <span className="text-s-muted">-</span> : f(i, x as number)}
    </td>
  ))}</>;
}

function Loading({ name, team, pos }: { name: string; team: string; pos: string }) {
  return (
    <>
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight">{name || "Loading…"}</h1>
          {pos && <span className="text-2xs font-bold px-2 py-0.5 rounded" style={{ background: "var(--color-accent)", color: "#fff" }}>{pos}</span>}
        </div>
        <p className="text-sm text-s-muted mt-1">{team} · loading career stats…</p>
      </div>
      <div className="stat-card animate-pulse" style={{ height: 180 }} />
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Season = { year: number; conference?: string; wins: number; losses: number; confW: number | null; confL: number | null; sp: number | null; spRank: number | null; offRank: number | null; defRank: number | null };
type Player = { id: string; name: string; position: string; jersey: number | null };
type TeamData = { team: { school: string; mascot?: string; conference?: string; logo: string | null; color: string }; seasons: Season[]; roster: Player[] };

const POS_ORDER = ["QB", "RB", "FB", "WR", "TE"];

export default function TeamView({ team }: { team: string }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setData(null); setErr(false);
    fetch(`/api/team?team=${encodeURIComponent(team)}`).then((r) => r.json()).then(setData).catch(() => setErr(true));
  }, [team]);

  if (err) return <p className="text-s-muted">Could not load this team.</p>;
  if (!data) return (
    <>
      <div className="flex items-center gap-3 mb-5"><div className="w-12 h-12 rounded-full animate-pulse" style={{ background: "var(--color-border)" }} /><h1 className="text-2xl font-black">{team}</h1></div>
      <div className="stat-card animate-pulse" style={{ height: 200 }} />
    </>
  );

  const t = data.team;
  const latest = data.seasons[0];
  const byPos = POS_ORDER.map((p) => ({ pos: p, players: data.roster.filter((r) => r.position === p) })).filter((g) => g.players.length);

  return (
    <>
      <div className="flex items-center gap-4 mb-5">
        {t.logo && <img src={t.logo} alt="" width={52} height={52} className="object-contain" />}
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{ borderLeft: `4px solid ${t.color}`, paddingLeft: 10 }}>{t.school} {t.mascot}</h1>
          <p className="text-sm text-s-muted mt-0.5">
            {t.conference}
            {latest && <> · {latest.year}: {latest.wins}-{latest.losses}{latest.spRank ? ` · SP+ #${latest.spRank}` : ""}</>}
          </p>
        </div>
      </div>

      <div className="section-heading">Season by season</div>
      <div className="stat-card overflow-x-auto mb-6">
        <table className="w-full text-sm tabular-nums" style={{ minWidth: 480 }}>
          <thead>
            <tr className="text-2xs uppercase tracking-wide text-s-muted">
              <th className="text-left font-semibold py-1.5 pr-2">Year</th>
              <th className="text-left font-semibold px-2">Record</th>
              <th className="text-left font-semibold px-2">Conf</th>
              <th className="text-right font-semibold px-2" title="SP+ rating">SP+</th>
              <th className="text-right font-semibold px-2">Rk</th>
              <th className="text-right font-semibold px-2" title="Offense SP+ rank">Off</th>
              <th className="text-right font-semibold pl-2" title="Defense SP+ rank">Def</th>
            </tr>
          </thead>
          <tbody>
            {data.seasons.map((s) => (
              <tr key={s.year} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-2 pr-2 font-bold">{s.year}</td>
                <td className="px-2">{s.wins}-{s.losses}</td>
                <td className="px-2 text-s-muted">{s.confW != null ? `${s.confW}-${s.confL}` : "-"}</td>
                <td className="px-2 text-right">{s.sp != null ? s.sp.toFixed(1) : "-"}</td>
                <td className="px-2 text-right font-semibold" style={{ color: "var(--heat-green)" }}>{s.spRank ? `#${s.spRank}` : "-"}</td>
                <td className="px-2 text-right text-s-muted">{s.offRank ? `#${s.offRank}` : "-"}</td>
                <td className="pl-2 text-right text-s-muted">{s.defRank ? `#${s.defRank}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-heading">Roster · skill players</div>
      {byPos.length === 0 ? <p className="text-s-muted text-sm">No roster available.</p> : (
        <div className="space-y-4">
          {byPos.map((g) => (
            <div key={g.pos}>
              <div className="text-2xs uppercase tracking-wide text-s-muted font-bold mb-1.5">{g.pos}</div>
              <div className="flex flex-wrap gap-2">
                {g.players.map((p) => (
                  <Link key={p.id} href={`/player/${p.id}?n=${encodeURIComponent(p.name)}&t=${encodeURIComponent(t.school)}&p=${p.position}`}
                    className="stat-card !py-1.5 !px-3 text-sm font-semibold hover:bg-s-hover transition-colors flex items-center gap-1.5">
                    {p.jersey != null && <span className="text-2xs text-s-muted tabular-nums">#{p.jersey}</span>}
                    {p.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-2xs text-s-muted mt-5">Records, SP+ ratings, and roster loaded live from the CollegeFootballData API. Click any player for their career stats + field map.</p>
    </>
  );
}

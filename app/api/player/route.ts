import { NextResponse } from "next/server";
import { cfbd, CURRENT_YEAR, FIRST_EPA_YEAR } from "../../lib/cfbdServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PpaRow = { id: string | number; name: string; position?: string; team?: string; conference?: string;
  averagePPA?: Record<string, number>; totalPPA?: Record<string, number> };
type StatRow = { playerId: string | number; player: string; category: string; statType: string; stat: string | number };

const num = (v: string | number | undefined) => (v == null ? 0 : typeof v === "number" ? v : parseFloat(v) || 0);

function pick(rows: StatRow[], id: string, category: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (String(r.playerId) === id && r.category === category) out[r.statType] = num(r.stat);
  return out;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") || "";
  const name = sp.get("n") || "";
  const posHint = sp.get("p") || "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const years: number[] = [];
  for (let y = CURRENT_YEAR; y >= FIRST_EPA_YEAR; y--) years.push(y);

  // per-year PPA (unfiltered, cached) — includes team, so transfers are covered
  const ppaByYear = await Promise.all(years.map((y) => cfbd<PpaRow[]>("/ppa/players/season", { year: y }).catch(() => [])));

  const found: { year: number; ppa: PpaRow }[] = [];
  years.forEach((y, i) => {
    const row = ppaByYear[i].find((r) => String(r.id) === id);
    if (row) found.push({ year: y, ppa: row });
  });

  if (!found.length) {
    return NextResponse.json({ id, name, position: posHint, teams: [], seasons: [], note: "No EPA-era seasons found for this player (CFBD player PPA starts 2013)." });
  }

  // box stats per (year, team) — small team-filtered calls
  const statCalls = await Promise.all(found.map((f) =>
    cfbd<StatRow[]>("/stats/player/season", { year: f.year, team: f.ppa.team }).catch(() => [] as StatRow[])));

  const seasons = found.map((f, i) => {
    const rows = statCalls[i];
    const rec = pick(rows, id, "receiving");
    const rush = pick(rows, id, "rushing");
    const pass = pick(rows, id, "passing");
    const ap = f.ppa.averagePPA || {}, tp = f.ppa.totalPPA || {};
    return {
      year: f.year, team: f.ppa.team, conference: f.ppa.conference, position: f.ppa.position,
      epa: { total: round(tp.all), perPlay: round(ap.all, 3), pass: round(tp.pass), rush: round(tp.rush) },
      rec: rec.REC ? { rec: rec.REC, yds: rec.YDS || 0, td: rec.TD || 0, ypr: rec.YPR || 0, long: rec.LONG || 0 } : null,
      rush: rush.CAR ? { car: rush.CAR, yds: rush.YDS || 0, td: rush.TD || 0, ypc: rush.YPC || 0, long: rush.LONG || 0 } : null,
      pass: pass.ATT || pass.YDS ? { att: pass.ATT || 0, cmp: pass.COMPLETIONS || pass.COMP || 0, yds: pass.YDS || 0, td: pass.TD || 0, int: pass.INT || 0, pct: pass.PCT || 0 } : null,
    };
  });

  const teams = Array.from(new Set(found.map((f) => f.ppa.team).filter(Boolean)));
  const position = found[0].ppa.position || posHint;

  // team logo/color for the player's teams (for the field-map export)
  let teamMeta: Record<string, { logo: string | null; color: string }> = {};
  try {
    const fbs = await cfbd<{ school: string; color?: string; logos?: string[] }[]>("/teams/fbs");
    const want = new Set(teams);
    for (const t of fbs) {
      if (want.has(t.school)) {
        teamMeta[t.school] = {
          logo: (t.logos && t.logos[0]) || null,
          color: t.color ? (t.color.startsWith("#") ? t.color : `#${t.color}`) : "#7A7A7A",
        };
      }
    }
  } catch { /* logos optional */ }

  const headshot = `https://a.espncdn.com/i/headshots/college-football/players/full/${id}.png`;
  return NextResponse.json({ id, name: name || found[0].ppa.name, position, teams, seasons, teamMeta, headshot });
}

function round(v: number | undefined, d = 1) { if (v == null) return 0; const m = 10 ** d; return Math.round(v * m) / m; }

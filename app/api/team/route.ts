import { NextResponse } from "next/server";
import { cfbd, CURRENT_YEAR } from "../../lib/cfbdServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rec = { year: number; team: string; conference?: string; total?: { wins: number; losses: number }; conferenceGames?: { wins: number; losses: number } };
type Sp = { year: number; team: string; rating?: number; ranking?: number; offense?: { ranking?: number }; defense?: { ranking?: number } };
type FbsTeam = { school: string; mascot?: string; conference?: string; color?: string; logos?: string[] };
type RosterP = { id: string; firstName?: string; lastName?: string; position?: string; jersey?: number };

export async function GET(req: Request) {
  const team = (new URL(req.url).searchParams.get("team") || "").trim();
  if (!team) return NextResponse.json({ error: "missing team" }, { status: 400 });

  const [teams, records, sp] = await Promise.all([
    cfbd<FbsTeam[]>("/teams/fbs").catch(() => []),
    cfbd<Rec[]>("/records", { team }).catch(() => []),
    cfbd<Sp[]>("/ratings/sp", { team }).catch(() => []),
  ]);

  const meta = teams.find((t) => t.school?.toLowerCase() === team.toLowerCase());
  const spByYear = new Map(sp.filter((s) => s.team === team).map((s) => [s.year, s]));

  const seasons = records
    .filter((r) => r.total)
    .map((r) => {
      const s = spByYear.get(r.year);
      return {
        year: r.year, conference: r.conference,
        wins: r.total!.wins, losses: r.total!.losses,
        confW: r.conferenceGames?.wins ?? null, confL: r.conferenceGames?.losses ?? null,
        sp: s?.rating != null ? Math.round(s.rating * 10) / 10 : null,
        spRank: s?.ranking ?? null, offRank: s?.offense?.ranking ?? null, defRank: s?.defense?.ranking ?? null,
      };
    })
    .sort((a, b) => b.year - a.year)
    .slice(0, 12);

  // roster: latest populated season
  let roster: RosterP[] = [];
  for (const y of [CURRENT_YEAR, CURRENT_YEAR - 1]) {
    roster = await cfbd<RosterP[]>("/roster", { team, year: y }).catch(() => []);
    if (roster.length) break;
  }
  const skill = roster
    .filter((r) => ["QB", "RB", "FB", "WR", "TE"].includes(r.position || ""))
    .map((r) => ({ id: r.id, name: `${r.firstName || ""} ${r.lastName || ""}`.trim(), position: r.position || "", jersey: r.jersey ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    team: {
      school: meta?.school || team, mascot: meta?.mascot, conference: meta?.conference || seasons[0]?.conference,
      logo: (meta?.logos && meta.logos[0]) || null,
      color: meta?.color ? (meta.color.startsWith("#") ? meta.color : `#${meta.color}`) : "#7A7A7A",
    },
    seasons, roster: skill,
  });
}

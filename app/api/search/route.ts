import { NextResponse } from "next/server";
import { cfbd } from "../../lib/cfbdServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CfbdTeam = { id: number; school: string; mascot?: string; abbreviation?: string; conference?: string; color?: string; logos?: string[] };
type CfbdPlayer = { id: string; team: string; name: string; firstName?: string; lastName?: string; position?: string };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ players: [], teams: [] });

  try {
    const [players, teams] = await Promise.all([
      cfbd<CfbdPlayer[]>("/player/search", { searchTerm: q }).catch(() => []),
      cfbd<CfbdTeam[]>("/teams/fbs").catch(() => []),
    ]);

    const ql = q.toLowerCase();
    const logoOf = new Map(teams.map((t) => [t.school?.toLowerCase(), (t.logos && t.logos[0]) || null]));

    const teamHits = teams
      .filter((t) => t.school?.toLowerCase().includes(ql) || t.abbreviation?.toLowerCase() === ql || t.mascot?.toLowerCase().includes(ql))
      .slice(0, 6)
      .map((t) => ({
        school: t.school, conference: t.conference,
        logo: (t.logos && t.logos[0]) || null,
        color: t.color ? (t.color.startsWith("#") ? t.color : `#${t.color}`) : "#7A7A7A",
      }));

    const seen = new Set<string>();
    const playerHits = [];
    for (const p of players) {
      const key = `${p.name}|${p.team}|${p.position}`;
      if (seen.has(key)) continue;
      seen.add(key);
      playerHits.push({ id: p.id, name: p.name, team: p.team, position: p.position || "", logo: logoOf.get(p.team?.toLowerCase()) || null });
      if (playerHits.length >= 20) break;
    }

    return NextResponse.json({ players: playerHits, teams: teamHits });
  } catch (e) {
    return NextResponse.json({ players: [], teams: [], error: String(e) }, { status: 200 });
  }
}

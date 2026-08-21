import { NextResponse } from "next/server";
import { cfbd } from "../../../lib/cfbdServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Play = { playText?: string; ppa?: number | null; down?: number };

const norm = (s: string) =>
  s.toLowerCase().replace(/[.'’]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/\s+/g, " ").trim();

// a gain phrase is "no gain", "a loss of N yards", or "N yds/yards"
const GAIN = String.raw`(no gain|a loss of \d+ (?:yards?|yds?)|-?\d+ (?:yards?|yds?))`;
function parseGain(tok: string): number | null {
  if (/no gain/i.test(tok)) return 0;
  const loss = tok.match(/loss of (\d+)/i);
  if (loss) return -parseInt(loss[1], 10);
  const m = tok.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

// /plays requires a week, so fetch the regular-season weeks for one team-year.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const name = sp.get("n") || "";
  const year = sp.get("year") || "";
  const team = sp.get("team") || "";
  const pos = sp.get("pos") || "";
  const isQB = pos === "QB";
  if (!name || !year || !team) return NextResponse.json({ error: "missing n/year/team" }, { status: 400 });
  const target = norm(name);

  const weeks = Array.from({ length: 15 }, (_, i) => i + 1);
  const byWeek = await Promise.all(weeks.map((w) =>
    cfbd<Play[]>("/plays", { year, week: w, team, seasonType: "regular", classification: "fbs" }).catch(() => [] as Play[])));

  const matches = (captured: string) => {
    const c = norm(captured);
    return c === target || c.startsWith(target) || (target.length > 6 && c.includes(target));
  };

  const out: { type: "rec" | "rush" | "pass"; yards: number; ppa: number; down: number; td: boolean }[] = [];
  for (const plays of byWeek) {
    for (const p of plays) {
      const t = p.playText || "";
      const td = /touchdown|\btd\b/i.test(t);
      const ppa = typeof p.ppa === "number" ? p.ppa : 0;
      const down = p.down || 0;
      // completions: "<passer> pass complete to <receiver> for <gain>"
      const cmp = t.match(new RegExp(`^(.+?) pass complete to (.+?) for ${GAIN}`, "i"));
      if (cmp) {
        const y = parseGain(cmp[3]);
        if (y != null) {
          if (isQB && matches(cmp[1])) { out.push({ type: "pass", yards: y, ppa, down, td }); continue; }
          if (!isQB && matches(cmp[2])) { out.push({ type: "rec", yards: y, ppa, down, td }); continue; }
        }
      }
      const run = t.match(new RegExp(`^(.+?) (?:run|rush) for ${GAIN}`, "i"));
      if (run && matches(run[1])) {
        const y = parseGain(run[2]); if (y != null) out.push({ type: "rush", yards: y, ppa, down, td });
      }
    }
  }
  return NextResponse.json({ plays: out });
}

// Client-side CFP bracket simulator. Given the projected field (each team's
// end-of-season Elo + seed), it Monte-Carlos the bracket forward to get, for
// every slot, the projected occupant and its chance to advance. The user can
// pin outcomes ("this team wins this game"); pins lock that team's whole path,
// and every other number recomputes conditional on them.
import { ELO } from "./data";

const HFA = 65; // matches scripts/build_data.py (higher seed hosts the first round)

export function winProb(a: number, b: number, hfa = 0): number {
  return 1 / (1 + Math.pow(10, -((a + hfa) - b) / 400));
}

export type Round = "R1" | "QF" | "SF" | "F";
export type Slot = { fixed?: string; from?: string }; // a team abbr, or the feeder game id
export type Game = { id: string; round: Round; a: Slot; b: Slot; home?: "a" | "b" };
export type FieldTeam = { abbr: string; name: string; logo: string | null; seed: number; bye: boolean; elo: number; conf: string };

export function getField(season: string): { field: FieldTeam[]; format: string } {
  const d = ELO[season];
  const field = d.teams
    .filter((t) => t.made && t.seed != null)
    .map((t) => ({ abbr: t.abbr, name: t.name, logo: t.logo, seed: t.seed as number, bye: t.bye, elo: t.elo, conf: t.conf }));
  return { field, format: d.format };
}

export function buildGames(field: FieldTeam[], format: string): Game[] {
  const seed = (n: number) => field.find((t) => t.seed === n)?.abbr ?? "";
  if (format === "cfp4") {
    return [
      { id: "sf1", round: "SF", a: { fixed: seed(1) }, b: { fixed: seed(4) } },
      { id: "sf2", round: "SF", a: { fixed: seed(2) }, b: { fixed: seed(3) } },
      { id: "final", round: "F", a: { from: "sf1" }, b: { from: "sf2" } },
    ];
  }
  // 12-team: seeds 1–4 bye into the quarterfinals; higher seed hosts the first round
  return [
    { id: "r1a", round: "R1", a: { fixed: seed(8) }, b: { fixed: seed(9) }, home: "a" },
    { id: "r1b", round: "R1", a: { fixed: seed(5) }, b: { fixed: seed(12) }, home: "a" },
    { id: "r1c", round: "R1", a: { fixed: seed(6) }, b: { fixed: seed(11) }, home: "a" },
    { id: "r1d", round: "R1", a: { fixed: seed(7) }, b: { fixed: seed(10) }, home: "a" },
    { id: "qf1", round: "QF", a: { fixed: seed(1) }, b: { from: "r1a" } },
    { id: "qf2", round: "QF", a: { fixed: seed(4) }, b: { from: "r1b" } },
    { id: "qf3", round: "QF", a: { fixed: seed(3) }, b: { from: "r1c" } },
    { id: "qf4", round: "QF", a: { fixed: seed(2) }, b: { from: "r1d" } },
    { id: "sf1", round: "SF", a: { from: "qf1" }, b: { from: "qf2" } },
    { id: "sf2", round: "SF", a: { from: "qf3" }, b: { from: "qf4" } },
    { id: "final", round: "F", a: { from: "sf1" }, b: { from: "sf2" } },
  ];
}

// The set of teams that can possibly reach a slot (used to lock a pick's path).
function slotTeams(slot: Slot, gmap: Map<string, Game>): Set<string> {
  if (slot.fixed !== undefined) return new Set([slot.fixed]);
  const g = gmap.get(slot.from!)!;
  return new Set([...slotTeams(g.a, gmap), ...slotTeams(g.b, gmap)]);
}

// Pin `team` to win game `gid`: also forces it to win every feeder game on its
// path, so it is guaranteed to be in game `gid` every simulation.
export function applyPick(gid: string, team: string, forced: Record<string, string>, games: Game[]): Record<string, string> {
  const gmap = new Map(games.map((g) => [g.id, g]));
  const next = { ...forced };
  function lock(id: string) {
    const g = gmap.get(id)!;
    next[id] = team;
    if (slotTeams(g.a, gmap).has(team)) { if (g.a.from) lock(g.a.from); }
    else if (g.b.from) lock(g.b.from);
  }
  lock(gid);
  return next;
}

// Undo a pin: drop it and any downstream pins that only held because `team`
// was advancing through `gid`.
export function clearPick(gid: string, team: string, forced: Record<string, string>, games: Game[]): Record<string, string> {
  const next = { ...forced };
  delete next[gid];
  let cur = gid;
  for (;;) {
    const parent = games.find((g) => g.a.from === cur || g.b.from === cur);
    if (!parent || next[parent.id] !== team) break;
    delete next[parent.id];
    cur = parent.id;
  }
  return next;
}

export type SlotView = { abbr: string; reachP: number; winP: number; forced: boolean };
export type GameView = { id: string; round: Round; home?: "a" | "b"; a: SlotView; b: SlotView };
export type Sim = { games: Record<string, GameView>; order: Game[]; champ: { abbr: string; p: number } };

export function simulate(field: FieldTeam[], games: Game[], forced: Record<string, string>, N = 20000): Sim {
  const elo = new Map(field.map((t) => [t.abbr, t.elo]));
  const resolve = (slot: Slot, res: Record<string, string>) => (slot.fixed !== undefined ? slot.fixed : res[slot.from!]);

  // small seeded PRNG (mulberry32) so the numbers are stable between renders
  let s = 0x9e3779b9 >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const occA: Record<string, Record<string, number>> = {};
  const occB: Record<string, Record<string, number>> = {};
  const win: Record<string, Record<string, number>> = {};
  for (const g of games) { occA[g.id] = {}; occB[g.id] = {}; win[g.id] = {}; }
  const champ: Record<string, number> = {};

  for (let i = 0; i < N; i++) {
    const res: Record<string, string> = {};
    for (const g of games) {
      const A = resolve(g.a, res), B = resolve(g.b, res);
      occA[g.id][A] = (occA[g.id][A] || 0) + 1;
      occB[g.id][B] = (occB[g.id][B] || 0) + 1;
      const f = forced[g.id];
      let w: string;
      if (f === A) w = A;
      else if (f === B) w = B;
      else {
        const hfa = g.round === "R1" ? (g.home === "a" ? HFA : -HFA) : 0;
        w = rnd() < winProb(elo.get(A)!, elo.get(B)!, hfa) ? A : B;
      }
      win[g.id][w] = (win[g.id][w] || 0) + 1;
      res[g.id] = w;
    }
    const c = res["final"];
    champ[c] = (champ[c] || 0) + 1;
  }

  const argmax = (o: Record<string, number>) => {
    let k = "", v = -1;
    for (const [a, n] of Object.entries(o)) if (n > v) { v = n; k = a; }
    return { k, v };
  };
  const gv: Record<string, GameView> = {};
  for (const g of games) {
    const a = argmax(occA[g.id]), b = argmax(occB[g.id]);
    gv[g.id] = {
      id: g.id, round: g.round, home: g.home,
      a: { abbr: a.k, reachP: a.v / N, winP: (win[g.id][a.k] || 0) / N, forced: forced[g.id] === a.k },
      b: { abbr: b.k, reachP: b.v / N, winP: (win[g.id][b.k] || 0) / N, forced: forced[g.id] === b.k },
    };
  }
  const cc = argmax(champ);
  return { games: gv, order: games, champ: { abbr: cc.k, p: cc.v / N } };
}

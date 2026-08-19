// Actual CFP brackets (results) once a season's playoff has been played,
// from scripts/build_playoffs.py. Seasons still to come are simply absent.
import playoffsJson from "../../data/playoffs.json";

export type PlayoffSlot = { abbr: string; team: string; logo: string | null; seed: number | null; score: number };
export type PlayoffGame = { top: PlayoffSlot; bottom: PlayoffSlot; winner: "top" | "bottom" };
export type PlayoffSeason = {
  format: string; field_size: number;
  rounds: Record<string, PlayoffGame[]>; champion: PlayoffSlot | null;
};

export const PLAYOFFS = playoffsJson as unknown as Record<string, PlayoffSeason>;
export const hasActual = (season: string) => season in PLAYOFFS;

// Win-total projections vs the Vegas line, from scripts/build_wins.py.
import winsJson from "../../data/wins.json";

export type WinTeam = {
  team: string; abbr: string; logo: string | null; conf: string;
  proj: number; vegas: number | null; actual: number | null;
};
type WinsFile = { seasons: string[]; latest: string; by_season: Record<string, WinTeam[]> };

const W = winsJson as unknown as WinsFile;
export const WIN_SEASONS: string[] = W.seasons;
export const WIN_LATEST: string = W.latest;
export const WINS: Record<string, WinTeam[]> = W.by_season;

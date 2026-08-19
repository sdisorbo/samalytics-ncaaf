// Win-total projections vs the Vegas line, from scripts/build_wins.py.
import winsJson from "../../data/wins.json";

export type WinTeam = {
  team: string; abbr: string; logo: string | null; conf: string;
  proj: number; vegas: number | null; actual: number | null;
};
export type WinMetrics = {
  n_train: number; overlap_n: number; seasons: string;
  model: { rmse: number; mae: number; w1: number; w2: number };
  vegas: { rmse: number; mae: number; w1: number; w2: number };
  ou: { hits: number; total: number; pct: number };
  edge_bins: { label: string; n: number; hit_pct: number }[];
  features: { name: string; coef: number }[];
};
type WinsFile = { seasons: string[]; latest: string; metrics: WinMetrics; by_season: Record<string, WinTeam[]> };

const W = winsJson as unknown as WinsFile;
export const WIN_SEASONS: string[] = W.seasons;
export const WIN_LATEST: string = W.latest;
export const WIN_METRICS: WinMetrics = W.metrics;
export const WINS: Record<string, WinTeam[]> = W.by_season;

// CFBD conference name -> short label for the filter
const CONF_SHORT: Record<string, string> = {
  "American Athletic": "American", "Conference USA": "C-USA", "Mid-American": "MAC",
  "Mountain West": "Mtn West", "FBS Independents": "Independents",
};
export function winConfShort(conf: string | null): string {
  return conf ? (CONF_SHORT[conf] ?? conf) : "—";
}
export const WIN_CONF_ORDER = ["SEC", "Big Ten", "Big 12", "ACC", "Pac-12", "American", "Mtn West", "Sun Belt", "C-USA", "MAC", "Independents"];

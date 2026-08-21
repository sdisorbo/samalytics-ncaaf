import modelsJson from "../../data/models.json";

export type EdgeBin = { label: string; n: number; acc: number };
export type CurvePoint = { i: number; units: number; acc: number };
export type Feature = { name: string; importance: number };
export type AliceMetrics = {
  n: number; accuracy: number; ci_low: number; ci_high: number; break_even: number;
  away: { n: number; acc: number }; home: { n: number; acc: number };
  f1: number; precision: number; recall: number; balanced_acc: number;
  edge_bins: EdgeBin[]; season_curve: { season: number; points: CurvePoint[] };
  features: Feature[]; seasons: string;
  bucket_cov: { label: string; n: number; home_cover: number }[];
};
export type AliceGame = {
  week: number; home: string; away: string; homeConf?: string; awayConf?: string;
  vegas: number; alice: number; edge: number; pick: "away" | "home";
  result?: { hp: number; ap: number; margin: number }; correct?: boolean;
};
export type TeamMeta = { abbr: string; logo: string | null; color: string };
type ModelsFile = {
  updated: string;
  teams: Record<string, TeamMeta>;
  alice: { metrics: AliceMetrics; games: Record<string, AliceGame[]>; latest: string; seasons: string[] };
  rebel: { status: string };
};

const F = modelsJson as unknown as ModelsFile;
export const MODELS_UPDATED = F.updated;
export const ALICE = F.alice;
export const ALICE_SEASONS = F.alice.seasons;

const TEAMS = F.teams || {};
export const teamMeta = (school: string): TeamMeta => TEAMS[school] ?? { abbr: school, logo: null, color: "#7A7A7A" };

export function aliceWeeks(season: string): number[] {
  return Array.from(new Set((ALICE.games[season] ?? []).map((g) => g.week))).sort((a, b) => a - b);
}

// All seasons load from combined files + a meta manifest, so adding a season
// needs no code changes -- just re-run scripts/build_data.py.
import eloAll from "../../data/elo.json";
import meta from "../../data/meta.json";

export type Season = string;

type MetaSeason = { code: string; label: string; format: string };
const META = meta as unknown as { seasons: MetaSeason[]; latest: string };

export const SEASONS: string[] = META.seasons.map((s) => s.code);
export const SEASON_LABEL: Record<string, string> = Object.fromEntries(META.seasons.map((s) => [s.code, s.label]));
export const SEASON_FORMAT: Record<string, string> = Object.fromEntries(META.seasons.map((s) => [s.code, s.format]));
export const DEFAULT_SEASON: string = META.latest ?? SEASONS[SEASONS.length - 1];

// Odds keys vary by playoff format (4-team vs 12-team); every key is optional.
export type OddsKey = "make" | "quarter" | "semi" | "final" | "champ";
export type Odds = Partial<Record<OddsKey, number>>;
export type Step = { key: OddsKey; label: string };

export type Rec = { w: number; l: number };
export type EloTeam = {
  abbr: string; name: string; logo: string | null; conf: string;
  seed: number | null; bye: boolean; conf_rank: number;
  elo: number; cmt: number;
  record: Rec; conf_record: Rec; win_pct: number; pf: number; pa: number;
  made: boolean; odds: Odds;
};
export type ConfSummary = { conf: string; n: number; avg_elo: number; adj: number };
export type TrendPoint = { date: string; rating: number };
export type BandPoint = { date: string; min: number; max: number; avg: number };
export type EloData = {
  season: string; format: string; field_size: number; steps: Step[];
  teams: EloTeam[]; conf_summary: ConfSummary[];
  trend: Record<string, TrendPoint[]>; band: BandPoint[];
};

export const ELO = eloAll as unknown as Record<string, EloData>;

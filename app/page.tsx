import StandingsView from "./components/StandingsView";

export const metadata = { title: "Standings | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Standings</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          Records and Elo ratings for every FBS team. Toggle between all teams, by conference, and the
          projected Playoff field. Elo carries across seasons (regressed 30% toward 1500 each offseason).
          Playoff odds are a Monte-Carlo of a committee-style selection model (Elo, conference strength,
          and résumé, with automatic bids for conference champions) plus the bracket. The playoff grew from
          4 to 12 teams in 2024, so the odds columns change with the season.
        </p>
      </div>
      <StandingsView />
    </>
  );
}

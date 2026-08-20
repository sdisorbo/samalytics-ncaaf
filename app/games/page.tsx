import GamesView from "../components/GamesView";

export const metadata = { title: "Games | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Games</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          Every matchup by week. Step forward or back through the schedule. Each game shows both
          teams&apos; Elo-based win probability and how much Elo they&apos;d gain on a win or lose on a loss.
          Upcoming games use each team&apos;s preseason-projected Elo and update as the season plays out.
        </p>
      </div>
      <GamesView />
    </>
  );
}

import EloChart from "../components/EloChart";

export const metadata = { title: "Elo Ratings | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Elo Ratings</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          Every FBS team&apos;s Elo across the season. All teams open 2021 at 1500; ratings move on
          margin-of-victory-adjusted results with a home-field bump, and regress 30% toward the mean each
          offseason. The shaded band is the league&apos;s min-max range; pick teams below to trace their
          path against it.
        </p>
      </div>
      <EloChart />
    </>
  );
}

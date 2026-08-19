import WinsView from "../components/WinsView";

export const metadata = { title: "Win Totals | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Win Totals</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          Our projected regular-season win total for every FBS team, lined up against the Vegas number. The
          bar shows the gap: green where the model leans over, copper where it leans under, and the dot is
          the real win count as the season plays out. Sorted by the size of the disagreement.
        </p>
      </div>
      <WinsView />
    </>
  );
}

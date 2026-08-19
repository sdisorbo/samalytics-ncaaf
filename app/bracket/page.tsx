import BracketView from "../components/BracketView";

export const metadata = { title: "Projected Bracket | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Projected Bracket</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          The College Football Playoff as a live bracket. Every slot shows the projected team and its chance
          to advance — the fainter the logo, the less certain the pick. Click any team to force it through and
          the rest of the bracket&apos;s odds recompute around your call.
        </p>
      </div>
      <BracketView />
    </>
  );
}

import ModelsView from "../components/ModelsView";

export const metadata = { title: "Models | Samalytics NCAAF Engine" };

export default function Page() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">Models</h1>
        <p className="text-sm text-s-muted mt-1 max-w-2xl leading-relaxed">
          Betting models and their weekly spread predictions, graded honestly out-of-sample. ALICE is a
          gradient-boosted point-spread model; REBEL is on the way.
        </p>
      </div>
      <ModelsView />
    </>
  );
}

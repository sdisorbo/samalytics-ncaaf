import PlayerView from "../../components/PlayerView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Player | Samalytics NCAAF Engine" };

export default function Page({ params, searchParams }: {
  params: { id: string };
  searchParams: { n?: string; t?: string; p?: string };
}) {
  return (
    <PlayerView id={params.id} name={searchParams.n || ""} team={searchParams.t || ""} pos={searchParams.p || ""} />
  );
}

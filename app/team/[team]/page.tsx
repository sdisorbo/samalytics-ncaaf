import TeamView from "../../components/TeamView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team | Samalytics NCAAF Engine" };

export default function Page({ params }: { params: { team: string } }) {
  return <TeamView team={decodeURIComponent(params.team)} />;
}

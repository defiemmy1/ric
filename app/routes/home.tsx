import Desk from "@/components/ric/ChatDesk";

export function meta() {
  return [{ title: "Ric — AI agents propose, you decide" }, { name: "description", content: "Paper-trading desk run by AI agents with app-enforced budget caps." }];
}

export default function HomeRoute() {
  return <Desk />;
}

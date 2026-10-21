import GameShell from "@/components/rmc/GameShell";
import ComputerTable from "@/components/rmc/ComputerTable";

export default function Spades() {
  return <GameShell title="Spades" subtitle="Two teams. Thirteen tricks. First to 500." color="#00F0FF">
    <ComputerTable game="spades" />
  </GameShell>;
}

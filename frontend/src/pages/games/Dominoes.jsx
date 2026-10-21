import GameShell from "@/components/rmc/GameShell";
import ComputerTable from "@/components/rmc/ComputerTable";

export default function Dominoes() {
  return <GameShell title="Dominoes" subtitle="Match the ends. Challenge the computer or players worldwide." color="#FFD100">
    <ComputerTable game="dominoes" />
  </GameShell>;
}

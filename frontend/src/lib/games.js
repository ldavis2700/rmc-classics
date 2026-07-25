export const GAMES = [
  {
    id: "memory",
    name: "Memory Match",
    tagline: "Flip. Remember. Match.",
    color: "#FF479A",
    accent: "#FFD100",
    path: "/play/memory",
    description:
      "The classic card flipping game. Race against yourself to pair every card in the fewest moves.",
    era: "1960s",
  },
  {
    id: "snakes",
    name: "Snakes & Ladders",
    tagline: "Roll big or slide down.",
    color: "#39FF14",
    accent: "#00F0FF",
    path: "/play/snakes",
    description:
      "Roll the dice, climb the ladders, dodge the snakes. First to square 100 wins.",
    era: "Ancient India",
  },
  {
    id: "connect4",
    name: "Connect Four",
    tagline: "Four in a row, that's all.",
    color: "#00F0FF",
    accent: "#FFD100",
    path: "/play/connect4",
    description:
      "Drop tokens into the grid. Line up four in a row - horizontally, vertically or diagonally.",
    era: "1974",
  },
  {
    id: "checkers",
    name: "Checkers",
    tagline: "Jump. Capture. Crown.",
    color: "#FFD100",
    accent: "#FF479A",
    path: "/play/checkers",
    description:
      "The strategy classic. Jump over your opponent's pieces to capture them all.",
    era: "Ancient Egypt",
  },
  {
    id: "rps",
    name: "Rock Paper Scissors",
    tagline: "Three throws. One winner.",
    color: "#FF479A",
    accent: "#39FF14",
    path: "/play/rps",
    description:
      "Best-of-five showdown vs the arcade AI. Fastest hands win. May the odds be with you.",
    era: "200 BC",
  },
  {
    id: "crazy8",
    name: "Crazy Eights",
    tagline: "Play smart. Play wild.",
    color: "#39FF14",
    accent: "#00F0FF",
    path: "/play/crazy8",
    description:
      "The card game that started sleepovers. Match suit or rank - 8s are wild.",
    era: "1930s",
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g]));

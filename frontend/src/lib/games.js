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
  {
    id: "chess",
    name: "Chess",
    tagline: "The eternal duel.",
    color: "#FFFFFF",
    accent: "#FFD100",
    path: "/play/chess",
    description:
      "The 1500-year-old strategy classic. Take on the arcade CPU one piece at a time.",
    era: "6th Century",
  },
  {
    id: "uno",
    name: "Wild Cards",
    tagline: "Skip. Reverse. Wild!",
    color: "#FF479A",
    accent: "#FFD100",
    path: "/play/uno",
    description:
      "The chaotic card party. Match colours or numbers, throw wilds, empty your hand first.",
    era: "1970s",
  },
  {
    id: "ludo",
    name: "Ludo",
    tagline: "Roll six or go home.",
    color: "#00F0FF",
    accent: "#FF479A",
    path: "/play/ludo",
    description:
      "Get all your tokens home before the CPU does. Land on the CPU to send them back.",
    era: "6th Century India",
  },
  {
    id: "scrabble",
    name: "Word Tiles",
    tagline: "Seven letters. One word.",
    color: "#39FF14",
    accent: "#FFD100",
    path: "/play/scrabble",
    description:
      "Five rounds. Seven random tiles each round. Build the highest scoring word you can.",
    era: "1930s",
  },
  {
    id: "dominoes",
    name: "Dominoes",
    tagline: "Match the ends. Empty first.",
    color: "#FFD100",
    accent: "#00F0FF",
    path: "/play/dominoes",
    description:
      "Classic block dominoes. Chain your tiles, block the CPU, empty your hand to win.",
    era: "12th Century China",
  },
  {
    id: "gofish",
    name: "Go Fish",
    tagline: "Got any threes?",
    color: "#00F0FF",
    accent: "#39FF14",
    path: "/play/gofish",
    description:
      "Ask for a rank, collect the whole set. Land four of a kind and bank the book. Most books wins.",
    era: "1800s",
  },
  {
    id: "oldmaid",
    name: "Old Maid",
    tagline: "Don't get stuck with her.",
    color: "#FF479A",
    accent: "#FFD100",
    path: "/play/oldmaid",
    description:
      "Draw cards from the CPU's hand and match pairs. Whoever's left with the odd Queen loses.",
    era: "1700s",
  },
];

export const GAME_MAP = Object.fromEntries(GAMES.map((g) => [g.id, g]));

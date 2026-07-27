import { useEffect, useMemo, useState, useCallback } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";
import { WORDS } from "@/lib/words";

const TILE_VALUES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,
};
const TILE_DIST = { A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1 };
const PAR_SCORE = 60;
const TOTAL_ROUNDS = 5;

function drawBag() {
  const bag = [];
  Object.entries(TILE_DIST).forEach(([l, c]) => {
    for (let i = 0; i < c; i++) bag.push(l);
  });
  return bag.sort(() => Math.random() - 0.5);
}

function drawTiles(bag, n) {
  const drawn = bag.slice(0, n);
  const rest = bag.slice(n);
  return { drawn, rest };
}

function scoreWord(letters) {
  let s = letters.reduce((sum, l) => sum + (TILE_VALUES[l] || 0), 0);
  if (letters.length >= 7) s += 50; // bingo
  return s;
}

function canBuildFromRack(word, rack) {
  const counts = {};
  rack.forEach((l) => { counts[l] = (counts[l] || 0) + 1; });
  for (const ch of word) {
    if (!counts[ch]) return false;
    counts[ch]--;
  }
  return true;
}

export default function Scrabble() {
  const { user, submitScore } = useAuth();
  const [bag, setBag] = useState(() => drawBag());
  const [rack, setRack] = useState([]);
  const [placed, setPlaced] = useState([]); // ordered chosen tile positions (indices into rack)
  const [round, setRound] = useState(1);
  const [totalScore, setTotalScore] = useState(0);
  const [lastRoundScore, setLastRoundScore] = useState(null);
  const [finished, setFinished] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });
  const [note, setNote] = useState("Form the highest scoring word from your 7 tiles.");

  const dealRack = useCallback((b) => {
    const { drawn, rest } = drawTiles(b, 7);
    setRack(drawn);
    setBag(rest);
    setPlaced([]);
  }, []);

  useEffect(() => {
    dealRack(bag);
  }, []);

  const finalize = useCallback(
    async (finalScore) => {
      const won = finalScore >= PAR_SCORE;
      won ? sfx.win() : sfx.lose();
      toast[won ? "success" : "error"](
        won ? `Beat par! ${finalScore} points.` : `Below par (${finalScore}/${PAR_SCORE}).`
      );
      if (user && !submitted) {
        const res = await submitScore({ game_id: "scrabble", won, score: finalScore });
        if (res.ok) setXpInfo({ xp: res.xp_gained, done: res.challenge_completed, badges: res.newly_unlocked_badges });
        setSubmitted(true);
      }
      setShareOpen(true);
    },
    [user, submitted, submitScore]
  );

  useEffect(() => {
    if (finished != null) finalize(finished);
  }, [finished, finalize]);

  const currentWord = useMemo(() => placed.map((i) => rack[i]).join(""), [placed, rack]);
  const currentLetters = useMemo(() => placed.map((i) => rack[i]), [placed, rack]);
  const currentScore = useMemo(() => scoreWord(currentLetters), [currentLetters]);
  const isValid = currentWord.length >= 3 && WORDS.has(currentWord.toLowerCase());

  const pickTile = (idx) => {
    if (placed.includes(idx)) {
      setPlaced(placed.filter((i) => i !== idx));
    } else {
      setPlaced([...placed, idx]);
    }
    sfx.click();
  };

  const submitWord = () => {
    if (!isValid) {
      setNote("Not a valid word. Try another combination.");
      sfx.lose();
      return;
    }
    const gained = currentScore;
    const nextTotal = totalScore + gained;
    setLastRoundScore(gained);
    setTotalScore(nextTotal);
    setNote(`+${gained} points for ${currentWord.toUpperCase()}!`);
    sfx.win();
    if (round >= TOTAL_ROUNDS) {
      setFinished(nextTotal);
      return;
    }
    setRound(round + 1);
    dealRack(bag);
  };

  const skipRound = () => {
    setLastRoundScore(0);
    setNote("Skipped this round.");
    if (round >= TOTAL_ROUNDS) {
      setFinished(totalScore);
      return;
    }
    setRound(round + 1);
    dealRack(bag);
  };

  const shuffleRack = () => {
    setRack([...rack].sort(() => Math.random() - 0.5));
    setPlaced([]);
    sfx.flip();
  };

  const reset = () => {
    const nb = drawBag();
    setBag(nb);
    setRound(1);
    setTotalScore(0);
    setLastRoundScore(null);
    setFinished(null);
    setSubmitted(false);
    setShareOpen(false);
    setNote("Form the highest scoring word from your 7 tiles.");
    dealRack(nb);
  };

  return (
    <GameShell
      title="Word Tiles"
      subtitle={`Beat par of ${PAR_SCORE} in ${TOTAL_ROUNDS} rounds.`}
      color="#39FF14"
      onReset={reset}
      extraActions={
        <span className="chip !border-neon-green/50 !text-neon-green" data-testid="scrabble-score">
          Round {round}/{TOTAL_ROUNDS} · {totalScore} pts
        </span>
      }
    >
      {/* Current word display */}
      <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 p-4">
        <p className="mb-2 text-center font-pixel text-[10px] uppercase tracking-widest text-[#a3a1c6]">
          Your word
        </p>
        <div className="flex min-h-[80px] flex-wrap items-center justify-center gap-2" data-testid="scrabble-word">
          {placed.length === 0 && (
            <span className="font-pixel text-sm text-[#6a6890]">Tap tiles below</span>
          )}
          {placed.map((idx, i) => (
            <ScrabbleTile
              key={i}
              letter={rack[idx]}
              onClick={() => pickTile(idx)}
              active
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="font-pixel text-[#a3a1c6]">
            Score: <span className="text-neon-yellow">{currentScore}</span>
          </span>
          {currentWord.length >= 3 && (
            <span
              className="rounded-full border px-2 py-0.5 font-pixel text-[10px]"
              style={{
                borderColor: isValid ? "rgba(57,255,20,0.5)" : "rgba(255,71,154,0.5)",
                color: isValid ? "#39FF14" : "#FF479A",
              }}
              data-testid="scrabble-validity"
            >
              {isValid ? "VALID" : "NOT IN DICT"}
            </span>
          )}
        </div>
      </div>

      {/* Rack */}
      <div className="mb-6">
        <p className="mb-2 font-pixel text-[10px] uppercase tracking-widest text-neon-yellow">// RACK</p>
        <div className="flex flex-wrap items-center justify-center gap-2" data-testid="scrabble-rack">
          {rack.map((l, i) => (
            <ScrabbleTile
              key={i}
              letter={l}
              onClick={() => pickTile(i)}
              active={placed.includes(i)}
              disabled={placed.includes(i)}
              testId={`scrabble-tile-${i}`}
            />
          ))}
        </div>
      </div>

      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="scrabble-note">{note}</p>

      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={submitWord}
          disabled={!isValid}
          data-testid="scrabble-submit"
          className="btn-arcade rounded-full px-6 py-2 text-xs font-black disabled:opacity-40"
        >
          Play word
        </button>
        <button
          type="button"
          onClick={shuffleRack}
          data-testid="scrabble-shuffle"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white hover:border-white/20"
        >
          Shuffle
        </button>
        <button
          type="button"
          onClick={skipRound}
          data-testid="scrabble-skip"
          className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#a3a1c6] hover:text-white"
        >
          Skip round
        </button>
      </div>

      {lastRoundScore != null && (
        <p className="mt-4 text-center font-pixel text-xs text-neon-yellow">
          Last round: +{lastRoundScore}
        </p>
      )}

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.scrabble}
        won={totalScore >= PAR_SCORE}
        statLabel="Total pts"
        statValue={totalScore}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
      />
    </GameShell>
  );
}

function ScrabbleTile({ letter, onClick, active, disabled, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="relative grid h-16 w-14 place-items-center rounded-lg border-2 shadow-lg transition-transform duration-150 hover:-translate-y-1 disabled:opacity-40"
      style={{
        backgroundColor: active ? "#FFD100" : "#F1E9C8",
        borderColor: active ? "#FF479A" : "#8B7A3A",
        color: "#1a1300",
        boxShadow: active ? "0 0 14px rgba(255,209,0,0.6)" : "inset 0 -4px 0 rgba(0,0,0,0.15)",
      }}
    >
      <span className="font-display text-2xl font-black">{letter}</span>
      <span className="absolute bottom-1 right-1 font-pixel text-[9px] font-bold">
        {TILE_VALUES[letter]}
      </span>
    </button>
  );
}

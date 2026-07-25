import { useEffect, useState, useCallback } from "react";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";

const COLORS = ["red", "yellow", "green", "blue"];
const COLOR_HEX = { red: "#FF3B3B", yellow: "#FFD100", green: "#39C842", blue: "#3B9BFF", wild: "#111111" };
const VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "+2"];

function buildDeck() {
  const deck = [];
  COLORS.forEach((c) => {
    deck.push({ color: c, value: "0" });
    for (let i = 1; i <= 9; i++) {
      deck.push({ color: c, value: `${i}` });
      deck.push({ color: c, value: `${i}` });
    }
    ["skip", "reverse", "+2"].forEach((v) => {
      deck.push({ color: c, value: v });
      deck.push({ color: c, value: v });
    });
  });
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", value: "wild" });
    deck.push({ color: "wild", value: "+4" });
  }
  return deck.sort(() => Math.random() - 0.5).map((c, i) => ({ ...c, id: i }));
}

function canPlay(card, top, wildColor) {
  if (card.color === "wild") return true;
  const activeColor = top.color === "wild" ? wildColor : top.color;
  if (card.color === activeColor) return true;
  if (card.value === top.value) return true;
  return false;
}

export default function Uno() {
  const { user, submitScore } = useAuth();
  const [deck, setDeck] = useState([]);
  const [discard, setDiscard] = useState([]);
  const [you, setYou] = useState([]);
  const [cpu, setCpu] = useState([]);
  const [turn, setTurn] = useState("you");
  const [wildColor, setWildColor] = useState(null);
  const [pickColor, setPickColor] = useState(false);
  const [pendingDraw, setPendingDraw] = useState(0);
  const [message, setMessage] = useState("Play a card that matches colour or number. Wilds always play.");
  const [finished, setFinished] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });
  const [ready, setReady] = useState(false);

  const init = () => {
    let d = buildDeck();
    const y = d.slice(0, 7);
    const c = d.slice(7, 14);
    d = d.slice(14);
    let idx = d.findIndex((card) => /^\d$/.test(card.value));
    if (idx === -1) idx = 0;
    const start = d[idx];
    const rest = [...d.slice(0, idx), ...d.slice(idx + 1)];
    setDeck(rest);
    setDiscard([start]);
    setYou(y);
    setCpu(c);
    setTurn("you");
    setWildColor(null);
    setPickColor(false);
    setPendingDraw(0);
    setFinished(null);
    setSubmitted(false);
    setShareOpen(false);
    setMessage("Play a card that matches colour or value.");
    setReady(true);
  };

  useEffect(() => { init(); }, []);

  const finalize = useCallback(async (won) => {
    won ? sfx.win() : sfx.lose();
    toast[won ? "success" : "error"](won ? "UNO! You won!" : "CPU emptied first.");
    if (user && !submitted) {
      const res = await submitScore({ game_id: "uno", won, score: won ? 1 : 0 });
      if (res.ok) {
        setXpInfo({ xp: res.xp_gained, done: res.challenge_completed });
      }
      setSubmitted(true);
    }
    setShareOpen(true);
  }, [user, submitted, submitScore]);

  useEffect(() => {
    if (finished === "you" || finished === "cpu") {
      finalize(finished === "you");
    }
  }, [finished, finalize]);

  const top = discard[discard.length - 1];

  // CPU turn
  useEffect(() => {
    if (turn !== "cpu" || finished || pickColor || !top) return;
    const t = setTimeout(() => {
      let hand = cpu.slice();
      let d = deck.slice();
      let dc = discard.slice();
      let pending = pendingDraw;
      let currentWild = wildColor;

      // If pending draw exists, cpu must play matching +2/+4 or draw
      if (pending > 0) {
        const stackable = hand.findIndex((c) => (pending === 2 ? c.value === "+2" || c.value === "+4" : c.value === "+4"));
        if (stackable !== -1) {
          const card = hand.splice(stackable, 1)[0];
          dc.push(card);
          if (card.value === "+2") pending += 2;
          if (card.value === "+4") { pending += 4; currentWild = COLORS[Math.floor(Math.random() * 4)]; }
          setMessage(`CPU played ${card.value}, stacking to +${pending}.`);
          sfx.card();
          setDeck(d); setDiscard(dc); setCpu(hand); setPendingDraw(pending); setWildColor(currentWild);
          setTurn("you");
          return;
        }
        // draw pending
        for (let i = 0; i < pending && d.length; i++) hand.push(d.shift());
        setMessage(`CPU drew ${pending} cards.`);
        setDeck(d); setDiscard(dc); setCpu(hand); setPendingDraw(0);
        setTurn("you");
        return;
      }

      let idx = hand.findIndex((c) => canPlay(c, top, currentWild));
      let safety = 30;
      while (idx === -1 && d.length && safety-- > 0) {
        const drawn = d.shift();
        hand.push(drawn);
        idx = hand.findIndex((c) => canPlay(c, top, currentWild));
      }
      if (idx !== -1) {
        const card = hand.splice(idx, 1)[0];
        dc.push(card);
        sfx.card();
        if (card.color === "wild") {
          const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
          hand.forEach((c) => { if (counts[c.color] !== undefined) counts[c.color]++; });
          currentWild = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          setMessage(`CPU played ${card.value.toUpperCase()} → ${currentWild.toUpperCase()}.`);
        } else {
          currentWild = null;
          setMessage(`CPU played ${card.value.toUpperCase()} ${card.color}.`);
        }
        if (card.value === "+2") pending += 2;
        if (card.value === "+4") pending += 4;
        setDeck(d); setDiscard(dc); setCpu(hand); setPendingDraw(pending); setWildColor(currentWild);
        if (hand.length === 0) { setFinished("cpu"); return; }
        if (card.value === "skip" || card.value === "reverse") setTurn("cpu"); // 2p: reverse = skip you
        else setTurn("you");
      } else {
        setMessage("CPU passed.");
        setDeck(d); setCpu(hand);
        setTurn("you");
      }
    }, 750);
    return () => clearTimeout(t);
  }, [turn, cpu, deck, discard, wildColor, top, pickColor, pendingDraw, finished]);

  const playCard = (i) => {
    if (turn !== "you" || pickColor || finished) return;
    const card = you[i];
    if (pendingDraw > 0) {
      const canStack = pendingDraw === 2 ? (card.value === "+2" || card.value === "+4") : card.value === "+4";
      if (!canStack) {
        setMessage(`Can't play. Draw ${pendingDraw} or stack a +${pendingDraw}.`);
        return;
      }
    } else if (!canPlay(card, top, wildColor)) {
      setMessage("Card doesn't match. Draw or try another.");
      return;
    }
    const hand = you.slice();
    const played = hand.splice(i, 1)[0];
    const dc = [...discard, played];
    let pending = pendingDraw;
    if (played.value === "+2") pending += 2;
    if (played.value === "+4") pending += 4;
    setYou(hand);
    setDiscard(dc);
    setPendingDraw(pending);
    sfx.card();
    if (played.color === "wild") {
      setPickColor(true);
      setMessage("Pick a colour.");
      return;
    }
    setWildColor(null);
    if (hand.length === 0) { setFinished("you"); return; }
    if (played.value === "skip" || played.value === "reverse") {
      setMessage("Skipped CPU — go again.");
      setTurn("you");
    } else {
      setMessage("CPU thinking…");
      setTurn("cpu");
    }
  };

  const drawCard = () => {
    if (turn !== "you" || pickColor || finished) return;
    if (pendingDraw > 0) {
      const d = deck.slice();
      const hand = you.slice();
      for (let i = 0; i < pendingDraw && d.length; i++) hand.push(d.shift());
      sfx.flip();
      setDeck(d); setYou(hand); setPendingDraw(0);
      setMessage(`Drew ${pendingDraw} cards.`);
      setTurn("cpu");
      return;
    }
    if (deck.length === 0) { setMessage("Deck empty — pass."); setTurn("cpu"); return; }
    const d = deck.slice();
    const drawn = d.shift();
    sfx.flip();
    setDeck(d);
    setYou([...you, drawn]);
    setMessage(`Drew ${drawn.value.toUpperCase()} ${drawn.color}. Play if playable, otherwise pass.`);
  };

  const pickColorBtn = (col) => {
    setWildColor(col);
    setPickColor(false);
    sfx.click();
    if (you.length === 0) { setFinished("you"); return; }
    setMessage(`Wild → ${col.toUpperCase()}. CPU's turn.`);
    setTurn("cpu");
  };

  return (
    <GameShell
      title="Uno"
      subtitle="Match colour or number. Wilds change the colour. First to empty their hand wins."
      color="#FF479A"
      onReset={init}
      extraActions={
        <span className="chip !border-neon-pink/50 !text-neon-pink" data-testid="uno-turn">
          {finished ? (finished === "you" ? "You won" : "CPU won") : turn === "you" ? "Your turn" : "CPU"}
        </span>
      }
    >
      {/* CPU hand backs */}
      <div className="flex flex-wrap justify-center gap-1" data-testid="uno-cpu-hand">
        {cpu.map((_, i) => (
          <div key={i} className="h-14 w-9 rounded-md border-2 border-black/40 bg-[#8a0e48]" />
        ))}
      </div>

      <div className="my-6 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={drawCard}
          disabled={turn !== "you" || pickColor || !!finished}
          data-testid="uno-draw"
          className="grid h-24 w-16 place-items-center rounded-lg border-2 border-black/40 bg-[#8a0e48] font-pixel text-xs text-white disabled:opacity-40"
        >
          Draw ({deck.length})
        </button>
        <UnoCard card={top} highlightColor={wildColor} />
        {pendingDraw > 0 && (
          <div className="rounded-full border border-neon-yellow/50 bg-neon-yellow/10 px-3 py-1 font-pixel text-xs text-neon-yellow">
            +{pendingDraw} stacked
          </div>
        )}
      </div>

      <p className="mb-4 text-center text-sm text-[#c9c8e2]" data-testid="uno-message">{message}</p>

      {pickColor && (
        <div className="mb-4 flex justify-center gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => pickColorBtn(c)}
              data-testid={`uno-pick-${c}`}
              className="h-10 w-10 rounded-full border-2 border-white/30"
              style={{ backgroundColor: COLOR_HEX[c], boxShadow: `0 0 12px ${COLOR_HEX[c]}66` }}
              aria-label={`Pick ${c}`}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2" data-testid="uno-you-hand">
        {you.map((c, i) => {
          const playable = pendingDraw > 0
            ? (pendingDraw === 2 ? (c.value === "+2" || c.value === "+4") : c.value === "+4")
            : canPlay(c, top, wildColor);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => playCard(i)}
              disabled={turn !== "you" || pickColor || !!finished || !playable}
              data-testid={`uno-card-${i}`}
              className="transition-transform duration-150 hover:-translate-y-2 disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ filter: !playable ? "grayscale(30%)" : "none" }}
            >
              <UnoCard card={c} />
            </button>
          );
        })}
      </div>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.uno}
        won={finished === "you"}
        statLabel="Cards left"
        statValue={finished === "cpu" ? you.length : 0}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
      />
    </GameShell>
  );
}

function UnoCard({ card, highlightColor }) {
  if (!card) return <div className="h-24 w-16" />;
  const bg = card.color === "wild" ? "#111111" : COLOR_HEX[card.color];
  const showWildBadge = card.color === "wild" && highlightColor;
  return (
    <div
      className="relative grid h-24 w-16 place-items-center rounded-lg border-2 border-white/20 text-white shadow-lg"
      style={{ backgroundColor: bg }}
    >
      {card.color === "wild" ? (
        <>
          <div
            className="absolute inset-1 grid grid-cols-2 overflow-hidden rounded"
            style={{ pointerEvents: "none" }}
          >
            <div style={{ backgroundColor: COLOR_HEX.red }} />
            <div style={{ backgroundColor: COLOR_HEX.yellow }} />
            <div style={{ backgroundColor: COLOR_HEX.green }} />
            <div style={{ backgroundColor: COLOR_HEX.blue }} />
          </div>
          <div className="relative z-10 rounded bg-black/70 px-2 py-1 font-display text-xs font-black">
            {card.value === "wild" ? "W" : "+4"}
          </div>
          {showWildBadge && (
            <div className="absolute -bottom-1.5 rounded-full px-2 font-pixel text-[9px] text-white" style={{ backgroundColor: COLOR_HEX[highlightColor] }}>
              {highlightColor}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="font-display text-2xl font-black">{card.value === "skip" ? "⊘" : card.value === "reverse" ? "⇄" : card.value === "+2" ? "+2" : card.value}</div>
        </>
      )}
    </div>
  );
}

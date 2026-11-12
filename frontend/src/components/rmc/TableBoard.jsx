import { useState } from "react";

const SUITS = { C: "♣", D: "♦", H: "♥", S: "♠" };
const SUIT_NAMES = { C: "clubs", D: "diamonds", H: "hearts", S: "spades" };
const RANKS = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const cardLabel = (card) => `${RANKS[card.slice(1)] || card.slice(1)} of ${SUIT_NAMES[card[0]]}`;
const actionButton = "rounded-xl border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-3 font-semibold text-neon-cyan disabled:cursor-not-allowed disabled:opacity-40";

export function TableRules({ game }) {
  return <details className="mt-5 rounded-xl border border-white/10 p-3 text-sm text-[#c9c8e2]">
    <summary className="cursor-pointer font-semibold text-white">How to play {game === "spades" ? "Spades" : "Dominoes"}</summary>
    {game === "spades" ? <div className="mt-3 space-y-2">
      <p>Four players, two teams. Your partner sits opposite you. Each player gets 13 cards, with aces high and spades always trump. No jokers or blind nil.</p>
      <p>Bid 0–13 tricks. A bid of 0 is nil: take no tricks for +100 points, or lose 100 if you take any. Follow the led suit when you can. Lead spades only after they are broken or when you hold only spades.</p>
      <p>Make your team bid for 10 points per bid trick; miss it to lose that amount. Extra tricks are bags, worth 1 each; every 10 bags costs 100 points. Failed-nil tricks count as bags, not toward your partner’s bid.</p>
      <p>After a hand, the higher-scoring team wins if it has at least 500 points. A tie continues into another hand.</p>
    </div> : <div className="mt-3 space-y-2">
      <p>Two-player draw Dominoes with a double-six set. Seven tiles each; the rest form the boneyard. The highest dealt double opens automatically, or the highest tile if neither hand has a double.</p>
      <p>Choose a tile, then a matching end of the chain. If you cannot play, draw one tile at a time until you can. Pass only when the boneyard is empty and you have no move.</p>
      <p>Empty your hand to win. If both players must pass, the lower remaining pip total wins; equal totals are a draw.</p>
    </div>}
  </details>;
}

function Card({ card, disabled, onClick, small = false }) {
  const red = card[0] === "D" || card[0] === "H";
  return <button type="button" aria-label={cardLabel(card)} disabled={disabled} onClick={onClick}
    className={`${small ? "h-16 w-11" : "h-24 w-14 sm:h-28 sm:w-16"} flex shrink-0 flex-col items-center justify-center rounded-lg border-2 border-white/40 bg-[#fff9ed] font-bold shadow-md transition-transform enabled:hover:-translate-y-1 enabled:hover:border-neon-cyan disabled:cursor-default ${red ? "text-red-700" : "text-slate-900"}`}
    style={{ opacity: disabled && !small ? 0.55 : 1 }}>
    <span className="text-xl">{RANKS[card.slice(1)] || card.slice(1)}</span><span className="text-2xl">{SUITS[card[0]]}</span>
  </button>;
}

function Tile({ tile, selected, disabled, onClick }) {
  const pips = Array.isArray(tile) ? tile : tile.split("-");
  return <button type="button" onClick={onClick} disabled={disabled} aria-label={`Tile ${pips[0]}-${pips[1]}`}
    aria-pressed={onClick ? selected : undefined}
    className={`flex h-12 min-w-20 items-center rounded-lg border-2 bg-[#f4ebce] font-display text-xl font-black text-[#221a04] shadow-md ${selected ? "-translate-y-1 border-neon-pink ring-2 ring-neon-pink" : "border-[#a79764]"} disabled:cursor-default`}
    style={{ opacity: disabled && onClick ? 0.5 : 1 }}>
    <span className="w-10 border-r border-[#a79764]">{pips[0]}</span><span className="w-10">{pips[1]}</span>
  </button>;
}

export default function TableBoard({ state, seat = 0, members, onAction, busy = false }) {
  const [selected, setSelected] = useState(null);
  const actions = state.actions || [];
  const spades = state.game === "spades";
  const name = (i) => i === seat ? "You" : members[i]?.name || "Player";
  const ended = state.phase === "ended";
  const myTeam = spades ? seat % 2 : seat;
  const won = state.winner === myTeam;
  const status = ended ? (state.winner === -1 ? "Draw" : won ? (spades ? "Your team wins!" : "You win!") : (spades ? "Other team wins" : `${name(state.winner)} wins`)) :
    state.phase === "round_end" ? "Hand complete" : state.turn === seat ? (state.phase === "bidding" ? "Your bid" : "Your turn") : `${name(state.turn)}’s ${state.phase === "bidding" ? "bid" : "turn"}`;
  const act = (action) => { if (!busy) { setSelected(null); onAction(action); } };
  const selectedActions = actions.filter((a) => a.type === "play" && a.tile === selected);
  const hand = spades ? [...state.hand].sort((a, b) => "CDHS".indexOf(a[0]) - "CDHS".indexOf(b[0]) || Number(a.slice(1)) - Number(b.slice(1))) : state.hand;

  return <div data-testid={`${state.game}-board`}>
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {members.map((member, i) => <div key={i} className={`rounded-xl border p-3 text-sm ${!ended && state.turn === i ? "border-neon-cyan bg-neon-cyan/10" : "border-white/10 bg-black/20"}`}>
        <p className="truncate font-bold text-white">{name(i)}</p>
        {spades && <p className={`text-xs ${i % 2 === myTeam ? "text-neon-cyan" : "text-[#c9c8e2]"}`}>{i === seat ? "Your team" : i % 2 === myTeam ? "Your partner" : "Other team"}</p>}
        <p className="text-xs text-[#c9c8e2]">{state.counts[i]} {spades ? "cards" : "tiles"}{spades ? ` · Bid ${state.bids[i] ?? "—"} · Won ${state.tricks[i]}` : ""}</p>
      </div>)}
    </div>
    <p role="status" aria-live="polite" className="mb-4 text-center font-display text-xl font-bold text-neon-yellow" data-testid="table-turn">{status}</p>
    {ended && <p className="mb-4 text-center text-sm text-[#c9c8e2]">{state.reason}</p>}
    {spades ? <>
      <div className="mb-4 flex flex-wrap justify-center gap-4 text-sm text-white">
        <span>Your team: <strong>{state.scores[myTeam]}</strong> · {state.bags[myTeam]} bags</span>
        <span>Other team: <strong>{state.scores[1 - myTeam]}</strong> · {state.bags[1 - myTeam]} bags</span>
        <span>Hand {state.round} · {state.broken ? "Spades broken" : "Spades not broken"}</span>
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#0c302c] p-4 sm:p-6">
        <p className="mb-3 text-center text-xs uppercase tracking-widest text-white/70">{state.trick.length ? "Current trick" : state.last_trick.length ? `Last trick · ${name(state.last_winner)} won` : "The table"}</p>
        <div className="flex min-h-24 flex-wrap justify-center gap-3" data-testid="spades-trick">
          {(state.trick.length ? state.trick : state.last_trick).map((play) => <div key={play.seat} className="text-center">
            <Card card={play.card} disabled small /><p className="mt-1 max-w-20 truncate text-xs text-white">{name(play.seat)}</p>
          </div>)}
          {!state.trick.length && !state.last_trick.length && <p className="self-center text-sm text-white/70">{state.phase === "bidding" ? "Place your bids to begin." : "Lead a card to begin the trick."}</p>}
        </div>
      </div>
      {state.phase === "bidding" && state.turn === seat && <fieldset className="my-4">
        <legend className="mb-2 text-sm text-white">Your bid (0 = nil)</legend>
        <div className="flex flex-wrap gap-2">{actions.map((a) => <button type="button" key={a.bid} onClick={() => act(a)} disabled={busy} className={actionButton} aria-label={`Bid ${a.bid === 0 ? "nil" : a.bid}`}>{a.bid === 0 ? "Nil" : a.bid}</button>)}</div>
      </fieldset>}
      {(state.phase === "round_end" || ended) && state.last_round.length > 0 && <div className="my-4 overflow-x-auto">
        <table className="w-full text-left text-sm text-[#c9c8e2]"><caption className="mb-2 text-white">Last hand scoring</caption>
          <thead><tr>{["Team", "Bid", "Tricks*", "Nil", "Bags", "Penalty", "Points"].map((t) => <th key={t} className="p-2">{t}</th>)}</tr></thead>
          <tbody>{state.last_round.map((r, i) => <tr key={i}>{[i === myTeam ? "Yours" : "Other", r.contract, r.taken, r.nil, r.over, r.penalty, `${r.delta > 0 ? "+" : ""}${r.delta}`].map((v, j) => <td key={j} className="border-t border-white/10 p-2">{v}</td>)}</tr>)}</tbody>
        </table><p className="mt-2 text-xs text-[#a3a1c6]">*Excludes tricks taken by nil bidders.</p>
      </div>}
    </> : <>
      <p className="mb-2 text-center text-sm text-[#c9c8e2]">Left end: {state.chain[0][0]} · Right end: {state.chain[state.chain.length - 1][1]} · Boneyard: {state.stock_count}</p>
      <div className="flex min-h-28 flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/10 bg-[#0c302c] p-3" data-testid="dominoes-chain">
        {state.chain.map((tile, i) => <Tile key={i} tile={tile} disabled />)}
      </div>
      <div className="my-4 flex min-h-12 flex-wrap justify-center gap-2">
        {["left", "right"].map((side) => <button type="button" key={side} className={actionButton} disabled={busy || !selectedActions.some((a) => a.side === side)}
          onClick={() => act(selectedActions.find((a) => a.side === side))}>Play {side}</button>)}
        {actions.filter((a) => ["draw", "pass"].includes(a.type)).map((a) => <button type="button" key={a.type} className={actionButton} onClick={() => act(a)} disabled={busy}>{a.type === "draw" ? "Draw a tile" : "Pass turn"}</button>)}
      </div>
    </>}
    <p className="mb-3 mt-5 text-center text-sm text-[#c9c8e2]">Your {spades ? "cards" : "tiles"}{state.phase === "playing" && state.turn === seat ? (spades ? " · Choose a highlighted card" : " · Select a tile, then choose an end") : ""}</p>
    <div className="flex flex-wrap justify-center gap-2" data-testid={`${state.game}-hand`}>
      {hand.map((item) => spades ? <Card key={item} card={item} disabled={busy || !actions.some((a) => a.card === item)} onClick={() => act({ type: "play", card: item })} /> :
        <Tile key={item} tile={item} selected={selected === item} disabled={busy || !actions.some((a) => a.tile === item)} onClick={() => setSelected(item)} />)}
    </div>
    {state.phase === "round_end" && <div className="mt-5 text-center"><button type="button" className={actionButton} disabled={busy} onClick={() => act({ type: "next" })}>Deal next hand</button></div>}
    <TableRules game={state.game} />
  </div>;
}

// Offline rules. Complete-match parity tests keep this aligned with the server.
const clone = (value) => JSON.parse(JSON.stringify(value));
const values = (tile) => tile.split("-").map(Number);
const sum = (items) => items.reduce((total, value) => total + value, 0);

export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function newGame(game, deck = null, previous = {}) {
  if (game === "dominoes") {
    const all = deck ? [...deck] : shuffle(Array.from({ length: 7 }, (_, a) =>
      Array.from({ length: 7 - a }, (_, i) => `${a}-${a + i}`)).flat());
    const hands = [all.slice(0, 7), all.slice(7, 14)];
    const candidates = hands.flatMap((hand, seat) => hand.map((tile) => ({ seat, tile })));
    const strength = ({ tile }) => {
      const [a, b] = values(tile);
      return (a === b ? 1000 : 0) + (a + b) * 10 + Math.max(a, b);
    };
    candidates.sort((a, b) => strength(b) - strength(a));
    const { seat, tile } = candidates[0];
    hands[seat] = hands[seat].filter((t) => t !== tile);
    return { game, phase: "playing", hands, stock: all.slice(14), chain: [values(tile)],
      turn: 1 - seat, passes: 0, winner: null, reason: "" };
  }
  if (game !== "spades") throw new Error("Unknown game");
  const all = deck ? [...deck] : shuffle([..."CDHS"].flatMap((s) =>
    Array.from({ length: 13 }, (_, i) => `${s}${i + 2}`)));
  const dealer = ((previous.dealer ?? 2) + 1) % 4;
  return { game, phase: "bidding", hands: Array.from({ length: 4 }, (_, i) => all.filter((_, j) => j % 4 === i)),
    dealer, turn: (dealer + 1) % 4, bids: [null, null, null, null], tricks: [0, 0, 0, 0],
    trick: [], last_trick: [], last_winner: null, broken: false,
    scores: [...(previous.scores || [0, 0])], bags: [...(previous.bags || [0, 0])],
    round: (previous.round || 0) + 1, last_round: previous.last_round || [], winner: null, reason: "" };
}

export function legalActions(state, seat) {
  if (state.phase === "round_end") return [{ type: "next" }];
  if (state.phase === "ended" || state.turn !== seat) return [];
  if (state.phase === "bidding") return Array.from({ length: 14 }, (_, bid) => ({ type: "bid", bid }));
  const hand = state.hands[seat];
  if (state.game === "dominoes") {
    const ends = { left: state.chain[0][0], right: state.chain[state.chain.length - 1][1] };
    const moves = hand.flatMap((tile) => Object.entries(ends)
      .filter(([, end]) => values(tile).includes(end)).map(([side]) => ({ type: "play", tile, side })));
    return moves.length ? moves : [{ type: state.stock.length ? "draw" : "pass" }];
  }
  let cards = hand;
  if (state.trick.length) {
    const matching = hand.filter((c) => c[0] === state.trick[0].card[0]);
    if (matching.length) cards = matching;
  } else if (!state.broken) {
    const nonSpades = hand.filter((c) => c[0] !== "S");
    if (nonSpades.length) cards = nonSpades;
  }
  return cards.map((card) => ({ type: "play", card }));
}

export function trickWinner(trick) {
  const lead = trick[0].card[0];
  const strength = ({ card }) => (card[0] === "S" ? 1000 : 0) + (card[0] === lead ? 100 : 0) + Number(card.slice(1));
  return trick.reduce((best, play) => strength(play) > strength(best) ? play : best).seat;
}

export function scoreRound(state) {
  state.last_round = [0, 1].map((team) => {
    const seats = [team, team + 2];
    const contract = sum(seats.map((s) => state.bids[s]));
    const taken = sum(seats.filter((s) => state.bids[s] !== 0).map((s) => state.tricks[s]));
    const nilSeats = seats.filter((s) => state.bids[s] === 0);
    const nil = sum(nilSeats.map((s) => state.tricks[s] === 0 ? 100 : -100));
    const over = Math.max(0, taken - contract) + sum(nilSeats.map((s) => state.tricks[s]));
    const bagTotal = state.bags[team] + over;
    const penalty = 100 * Math.floor(bagTotal / 10);
    const delta = (taken >= contract ? 10 * contract : -10 * contract) + over + nil - penalty;
    state.scores[team] += delta;
    state.bags[team] = bagTotal % 10;
    return { contract, taken, nil, over, penalty, delta };
  });
  if (Math.max(...state.scores) >= 500 && state.scores[0] !== state.scores[1]) {
    state.phase = "ended";
    state.winner = state.scores[0] > state.scores[1] ? 0 : 1;
    state.reason = "Target score reached";
  } else state.phase = "round_end";
}

export function applyAction(state, seat, action, deck = null) {
  const sameAction = (candidate) => Object.keys(candidate).length === Object.keys(action).length &&
    Object.entries(candidate).every(([key, value]) => action[key] === value);
  if (seat < 0 || seat >= state.hands.length || !legalActions(state, seat).some(sameAction)) {
    throw new Error("That move is not legal on this turn");
  }
  const s = clone(state);
  if (action.type === "next") return newGame("spades", deck, s);
  if (s.game === "dominoes") {
    if (action.type === "draw") { s.hands[seat].push(s.stock.shift()); return s; }
    if (action.type === "pass") {
      s.passes += 1;
      if (s.passes === 2) {
        const pips = s.hands.map((hand) => sum(hand.map((tile) => sum(values(tile)))));
        s.phase = "ended";
        s.winner = pips[0] === pips[1] ? -1 : (pips[0] < pips[1] ? 0 : 1);
        s.reason = "Blocked board: lowest remaining pip total wins";
      }
    } else {
      s.passes = 0;
      const [a, b] = values(action.tile);
      if (action.side === "left") s.chain.unshift(b === s.chain[0][0] ? [a, b] : [b, a]);
      else s.chain.push(a === s.chain[s.chain.length - 1][1] ? [a, b] : [b, a]);
      s.hands[seat] = s.hands[seat].filter((t) => t !== action.tile);
      if (!s.hands[seat].length) { s.phase = "ended"; s.winner = seat; s.reason = "All tiles played"; }
    }
    s.turn = 1 - seat;
    return s;
  }
  if (action.type === "bid") {
    s.bids[seat] = action.bid;
    s.turn = (seat + 1) % 4;
    if (s.bids.every((bid) => bid !== null)) s.phase = "playing";
    return s;
  }
  s.hands[seat] = s.hands[seat].filter((card) => card !== action.card);
  s.trick.push({ seat, card: action.card });
  s.broken ||= action.card[0] === "S";
  s.turn = (seat + 1) % 4;
  if (s.trick.length === 4) {
    const winner = trickWinner(s.trick);
    s.tricks[winner] += 1;
    s.turn = winner;
    s.last_trick = s.trick;
    s.trick = [];
    s.last_winner = winner;
    if (sum(s.tricks) === 13) scoreRound(s);
  }
  return s;
}

export function computerAction(state, seat) {
  const moves = legalActions(state, seat);
  if (!moves.length) throw new Error("Computer has no turn");
  if (state.phase === "bidding") {
    const hand = state.hands[seat];
    const estimate = hand.filter((c) => Number(c.slice(1)) === 14 || (c[0] === "S" && Number(c.slice(1)) >= 11)).length +
      Math.max(0, hand.filter((c) => c[0] === "S").length - 3);
    return { type: "bid", bid: Math.max(1, Math.min(8, estimate)) };
  }
  if (moves[0].type !== "play") return moves[0];
  if (state.game === "dominoes") return [...moves].sort((a, b) => sum(values(b.tile)) - sum(values(a.tile)))[0];
  const value = ({ card }) => (card[0] === "S" ? 100 : 0) + Number(card.slice(1));
  const ordered = [...moves].sort((a, b) => value(a) - value(b));
  if (!state.trick.length) return ordered[0];
  const winning = ordered.filter((m) => trickWinner([...state.trick, { seat, card: m.card }]) === seat);
  const losing = ordered.filter((m) => !winning.includes(m));
  if (state.bids[seat] === 0) return losing[losing.length - 1] || ordered[0];
  const current = trickWinner(state.trick);
  if (current % 2 === seat % 2 && state.bids[current] !== 0) return losing[0] || ordered[0];
  return winning[0] || ordered[0];
}

export function playerView(state, seat) {
  const { hands, stock, ...publicState } = state;
  return { ...publicState, hand: hands[seat], counts: hands.map((h) => h.length),
    stock_count: stock?.length || 0, actions: legalActions(state, seat) };
}

"""Pure, server-authoritative rules for draw Dominoes and partnership Spades.

No network or persistence dependencies. The offline JS implementation is checked
against these transitions by test_table_rules.py using complete seeded matches.
"""
from copy import deepcopy
from random import SystemRandom


def shuffled(values):
    values = list(values)
    SystemRandom().shuffle(values)
    return values


def tile_values(tile):
    return [int(value) for value in tile.split("-")]


def new_game(game, deck=None, previous=None):
    if game == "dominoes":
        deck = list(deck) if deck is not None else shuffled(
            f"{a}-{b}" for a in range(7) for b in range(a, 7))
        hands = [deck[:7], deck[7:14]]
        seat, tile = max(((i, tile) for i, hand in enumerate(hands) for tile in hand),
                         key=lambda item: (len(set(tile_values(item[1]))) == 1,
                                           sum(tile_values(item[1])), max(tile_values(item[1]))))
        hands[seat].remove(tile)
        return {"game": game, "phase": "playing", "hands": hands,
                "stock": deck[14:], "chain": [tile_values(tile)], "turn": 1 - seat,
                "passes": 0, "winner": None, "reason": ""}
    if game != "spades":
        raise ValueError("Unknown game")
    deck = list(deck) if deck is not None else shuffled(
        f"{suit}{rank}" for suit in "CDHS" for rank in range(2, 15))
    previous = previous or {}
    dealer = (previous.get("dealer", 2) + 1) % 4
    return {"game": game, "phase": "bidding", "hands": [deck[i::4] for i in range(4)],
            "dealer": dealer, "turn": (dealer + 1) % 4, "bids": [None] * 4,
            "tricks": [0] * 4, "trick": [], "last_trick": [], "last_winner": None,
            "broken": False, "scores": previous.get("scores", [0, 0])[:],
            "bags": previous.get("bags", [0, 0])[:], "round": previous.get("round", 0) + 1,
            "last_round": previous.get("last_round", []), "winner": None, "reason": ""}


def legal_actions(state, seat):
    if state["phase"] == "round_end":
        return [{"type": "next"}]
    if state["phase"] == "ended" or state["turn"] != seat:
        return []
    if state["phase"] == "bidding":
        return [{"type": "bid", "bid": bid} for bid in range(14)]
    hand = state["hands"][seat]
    if state["game"] == "dominoes":
        ends = {"left": state["chain"][0][0], "right": state["chain"][-1][1]}
        moves = [{"type": "play", "tile": tile, "side": side}
                 for tile in hand for side, end in ends.items() if end in tile_values(tile)]
        return moves or [{"type": "draw" if state["stock"] else "pass"}]
    cards = hand
    if state["trick"]:
        suit = state["trick"][0]["card"][0]
        cards = [c for c in hand if c[0] == suit] or hand
    elif not state["broken"]:
        cards = [c for c in hand if c[0] != "S"] or hand
    return [{"type": "play", "card": card} for card in cards]


def trick_winner(trick):
    lead = trick[0]["card"][0]
    return max(trick, key=lambda play: (play["card"][0] == "S",
                                      play["card"][0] == lead,
                                      int(play["card"][1:])))["seat"]


def score_round(state):
    summaries = []
    for team in range(2):
        seats = [team, team + 2]
        contract = sum(state["bids"][seat] for seat in seats)
        taken = sum(state["tricks"][seat] for seat in seats if state["bids"][seat] != 0)
        nil_tricks = sum(state["tricks"][seat] for seat in seats if state["bids"][seat] == 0)
        nil = sum(100 if state["tricks"][seat] == 0 else -100
                  for seat in seats if state["bids"][seat] == 0)
        over = max(0, taken - contract) + nil_tricks
        bag_total = state["bags"][team] + over
        penalty = 100 * (bag_total // 10)
        # Failed-nil tricks count as bags, never toward the partner's contract.
        delta = (10 * contract if taken >= contract else -10 * contract) + over + nil - penalty
        state["scores"][team] += delta
        state["bags"][team] = bag_total % 10
        summaries.append({"contract": contract, "taken": taken, "nil": nil,
                          "over": over, "penalty": penalty, "delta": delta})
    state["last_round"] = summaries
    scores = state["scores"]
    if max(scores) >= 500 and scores[0] != scores[1]:
        state.update(phase="ended", winner=0 if scores[0] > scores[1] else 1,
                     reason="Target score reached")
    else:
        state["phase"] = "round_end"


def apply_action(state, seat, action, deck=None):
    # Exact action matching prevents clients injecting cards, scores, or turns.
    # Python bool is an int subtype; it is not a valid bid.
    if action.get("type") == "bid" and type(action.get("bid")) is not int:
        raise ValueError("Choose a whole-number bid from 0 to 13")
    if seat < 0 or seat >= len(state["hands"]) or action not in legal_actions(state, seat):
        raise ValueError("That move is not legal on this turn")
    s = deepcopy(state)
    kind = action["type"]
    if kind == "next":
        return new_game("spades", deck, s)
    if s["game"] == "dominoes":
        if kind == "draw":
            s["hands"][seat].append(s["stock"].pop(0))
            return s
        if kind == "pass":
            s["passes"] += 1
            if s["passes"] == 2:
                pips = [sum(sum(tile_values(t)) for t in hand) for hand in s["hands"]]
                s.update(phase="ended", winner=-1 if pips[0] == pips[1] else pips.index(min(pips)),
                         reason="Blocked board: lowest remaining pip total wins")
        else:
            s["passes"] = 0
            a, b = tile_values(action["tile"])
            if action["side"] == "left":
                s["chain"].insert(0, [a, b] if b == s["chain"][0][0] else [b, a])
            else:
                s["chain"].append([a, b] if a == s["chain"][-1][1] else [b, a])
            s["hands"][seat].remove(action["tile"])
            if not s["hands"][seat]:
                s.update(phase="ended", winner=seat, reason="All tiles played")
        s["turn"] = 1 - seat
        return s
    if kind == "bid":
        s["bids"][seat] = action["bid"]
        s["turn"] = (seat + 1) % 4
        if all(bid is not None for bid in s["bids"]):
            s["phase"] = "playing"
        return s
    card = action["card"]
    s["hands"][seat].remove(card)
    s["trick"].append({"seat": seat, "card": card})
    s["broken"] = s["broken"] or card[0] == "S"
    s["turn"] = (seat + 1) % 4
    if len(s["trick"]) == 4:
        winner = trick_winner(s["trick"])
        s["tricks"][winner] += 1
        s["turn"] = winner
        s["last_trick"], s["trick"] = s["trick"], []
        s["last_winner"] = winner
        if sum(s["tricks"]) == 13:
            score_round(s)
    return s


def computer_action(state, seat):
    """Uses only this seat's hand and public bids/tricks, never opponents' cards."""
    moves = legal_actions(state, seat)
    if not moves:
        raise ValueError("Computer has no turn")
    if state["phase"] == "bidding":
        hand = state["hands"][seat]
        estimate = sum(1 for c in hand if int(c[1:]) == 14 or (c[0] == "S" and int(c[1:]) >= 11))
        estimate += max(0, sum(c[0] == "S" for c in hand) - 3)
        return {"type": "bid", "bid": max(1, min(8, estimate))}
    if moves[0]["type"] != "play":
        return moves[0]
    if state["game"] == "dominoes":
        return max(moves, key=lambda m: sum(tile_values(m["tile"])))
    value = lambda move: (move["card"][0] == "S", int(move["card"][1:]))
    ordered = sorted(moves, key=value)
    if not state["trick"]:
        return ordered[0]
    winning = [m for m in ordered if trick_winner(state["trick"] + [{"seat": seat, "card": m["card"]}]) == seat]
    losing = [m for m in ordered if m not in winning]
    if state["bids"][seat] == 0:
        return losing[-1] if losing else ordered[0]
    current = trick_winner(state["trick"])
    if current % 2 == seat % 2 and state["bids"][current] != 0:
        return losing[0] if losing else ordered[0]
    return winning[0] if winning else ordered[0]


def player_view(state, seat):
    public = {key: deepcopy(value) for key, value in state.items() if key not in ("hands", "stock")}
    public["hand"] = list(state["hands"][seat])
    public["counts"] = [len(hand) for hand in state["hands"]]
    public["stock_count"] = len(state.get("stock", []))
    public["actions"] = legal_actions(state, seat)
    return public

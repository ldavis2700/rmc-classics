"""Game-rule edge cases and complete offline/server transition parity."""
import json
from pathlib import Path
import random
import subprocess
import sys
from copy import deepcopy

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from table_rules import new_game, legal_actions, apply_action, computer_action, player_view, score_round, trick_winner


def deck(game, rng):
    cards = ([f"{a}-{b}" for a in range(7) for b in range(a, 7)] if game == "dominoes" else
             [f"{s}{r}" for s in "CDHS" for r in range(2, 15)])
    rng.shuffle(cards)
    return cards


def test_dominoes_deal_and_highest_opening():
    state = new_game("dominoes", [f"{a}-{b}" for a in range(7) for b in range(a, 7)])
    assert sum(map(len, state["hands"])) == 13
    assert len(state["stock"]) == 14
    assert state["chain"] == [[2, 2]]
    dealt = ["0-6", "1-6", "2-6", "3-6", "4-6", "5-6", "0-5", "1-5", "2-5", "3-5", "4-5", "0-4", "1-4", "2-4"]
    state = new_game("dominoes", dealt)
    assert state["chain"] == [[5, 6]]


def test_dominoes_draw_pass_and_equal_block_are_not_wins():
    state = {"game": "dominoes", "phase": "playing", "turn": 0, "hands": [["1-3"], ["0-4"]],
             "chain": [[6, 6]], "stock": ["0-0"], "passes": 0, "winner": None, "reason": ""}
    with pytest.raises(ValueError):
        apply_action(state, 0, {"type": "pass"})
    state = apply_action(state, 0, {"type": "draw"})
    assert state["turn"] == 0
    state = apply_action(state, 0, {"type": "pass"})
    state = apply_action(state, 1, {"type": "pass"})
    assert state["phase"] == "ended" and state["winner"] == -1


def test_spades_follow_suit_breaking_and_trump():
    state = new_game("spades")
    state.update(phase="playing", turn=0, broken=False, trick=[])
    state["hands"][0] = ["C2", "S14"]
    assert legal_actions(state, 0) == [{"type": "play", "card": "C2"}]
    with pytest.raises(ValueError):
        apply_action(state, 0, {"type": "play", "card": "S14"})
    state["trick"] = [{"seat": 3, "card": "C14"}]
    assert legal_actions(state, 0) == [{"type": "play", "card": "C2"}]
    state["hands"][0] = ["S2"]
    after = apply_action(state, 0, {"type": "play", "card": "S2"})
    assert after["broken"]
    assert trick_winner(after["trick"]) == 0
    state["trick"] = []
    assert legal_actions(state, 0) == [{"type": "play", "card": "S2"}]


@pytest.mark.parametrize("bid", [True, -1, 14, 1.2, "3"])
def test_invalid_bid_is_rejected_without_mutation(bid):
    state = new_game("spades")
    before = deepcopy(state)
    with pytest.raises(ValueError):
        apply_action(state, state["turn"], {"type": "bid", "bid": bid})
    assert state == before


def test_failed_nil_does_not_make_partner_contract_and_counts_bags():
    state = new_game("spades")
    state.update(bids=[0, 3, 5, 3], tricks=[2, 3, 4, 4], bags=[9, 0])
    score_round(state)
    assert state["last_round"][0] == {"contract": 5, "taken": 4, "nil": -100, "over": 2, "penalty": 100, "delta": -248}
    assert state["bags"][0] == 1


def test_successful_nil_team_scoring_and_target_tie():
    state = new_game("spades")
    state.update(bids=[0, 3, 5, 3], tricks=[0, 3, 6, 4])
    score_round(state)
    assert state["scores"] == [151, 61]
    state.update(scores=[349, 439], bags=[0, 0])
    score_round(state)
    assert state["scores"] == [500, 500] and state["phase"] == "round_end"
    state["scores"] = [350, 439]
    score_round(state)
    assert state["phase"] == "ended" and state["winner"] == 0


@pytest.mark.parametrize("game", ["dominoes", "spades"])
def test_private_projection_and_computer_does_not_peek(game):
    state = new_game(game)
    seat = state["turn"]
    projected = player_view(state, seat)
    assert "hands" not in projected and "stock" not in projected
    assert projected["hand"] == state["hands"][seat]
    expected = computer_action(state, seat)
    for i in range(len(state["hands"])):
        if i != seat:
            state["hands"][i] = []
    assert computer_action(state, seat) == expected


def test_complete_matches_and_js_server_parity(tmp_path):
    rng = random.Random(20261020)
    cases = []
    for game in ["dominoes"] * 20 + ["spades"] * 3:
        initial = deck(game, rng)
        state = new_game(game, initial)
        case = {"game": game, "deck": initial, "initial": deepcopy(state), "steps": []}
        played = set()
        for _ in range(6000):
            if state["phase"] == "ended":
                break
            seat = state["turn"]
            action = computer_action(state, seat)
            # Include nil bids in one test game and varied legal plays.
            if game == "spades" and state["phase"] == "bidding" and len(cases) == 20 and seat == 0:
                action = {"type": "bid", "bid": 0}
            next_deck = deck(game, rng) if action["type"] == "next" else None
            before = deepcopy(state)
            expected_ai = computer_action(state, seat)
            if action.get("card"):
                assert action["card"] not in played
                played.add(action["card"])
            state = apply_action(state, seat, action, next_deck)
            assert before != state
            if game == "dominoes":
                assert all(a[1] == b[0] for a, b in zip(state["chain"], state["chain"][1:]))
                assert sum(map(len, state["hands"])) + len(state["chain"]) + len(state["stock"]) == 28
            else:
                if action["type"] == "next":
                    played.clear()
                assert sum(map(len, state["hands"])) + len(state["trick"]) + 4 * sum(state["tricks"]) == 52
            case["steps"].append({"seat": seat, "action": action, "deck": next_deck, "ai": expected_ai, "expected": deepcopy(state)})
        assert state["phase"] == "ended", "A match must be able to finish"
        cases.append(case)
    fixture = tmp_path / "matches.json"
    fixture.write_text(json.dumps(cases))
    module = Path(__file__).resolve().parents[2] / "frontend/src/lib/tableRules.js"
    script = """
import fs from 'node:fs';
import assert from 'node:assert/strict';
const rules = await import('data:text/javascript;base64,' + fs.readFileSync(process.argv[1]).toString('base64'));
for (const test of JSON.parse(fs.readFileSync(process.argv[2]))) {
  let state = rules.newGame(test.game, test.deck);
  assert.deepEqual(state, test.initial);
  for (const step of test.steps) {
    assert.deepEqual(rules.computerAction(state, step.seat), step.ai);
    state = rules.applyAction(state, step.seat, step.action, step.deck);
    assert.deepEqual(state, step.expected);
  }
}
"""
    subprocess.run(["node", "--input-type=module", "-e", script, str(module), str(fixture)], check=True, capture_output=True, text=True)

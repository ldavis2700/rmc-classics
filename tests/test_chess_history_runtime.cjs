const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Chess } = require("../frontend/node_modules/chess.js");

const source = fs.readFileSync(path.join(__dirname, "../frontend/src/pages/games/Chess.jsx"), "utf8");
const start = source.indexOf("export default function Chess() {");
const end = source.indexOf("\n  return (", start);
const helpers = source.slice(source.indexOf("const PIECE_UNICODE"), start);
assert(start >= 0 && end > start);

// Exercise the real component's player and timer callbacks with the installed
// rules engine. Only CPU choice is scripted, using legal moves from that engine.
function harness({ authenticated = false, fen, cpuMoves = [] } = {}) {
  const slots = [], effects = [], timers = new Map(), requests = [];
  let cursor = 0, effectCursor = 0, queued = [], nextTimer = 0;
  class Engine extends Chess { constructor(position) { super(position || fen); } }
  const run = vm.runInNewContext(helpers + "\npickCpuMove = chooseCpu;\n(function Chess() {" +
    source.slice(start + "export default function Chess() {".length, end) +
    "\nreturn {onSquareClick,reset}; })", {
    ChessEngine: Engine,
    chooseCpu: game => {
      const san = cpuMoves.shift();
      const move = game.moves({ verbose: true }).find(m => m.san === san);
      assert(move, `Scripted CPU move ${san} must be legal`);
      return move;
    },
    useAuth: () => ({ user: authenticated ? { id: "history-player" } : null,
      submitScore: payload => new Promise(resolve => requests.push({payload, resolve})) }),
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useRef: initial => { const i = cursor++; return slots[i] || (slots[i] = {current:initial}); },
    useState: initial => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useEffect: (fn, deps) => {
      const i = effectCursor++, previous = effects[i];
      if (!previous || deps.some((dep,j) => !Object.is(dep,previous.deps[j]))) {
        queued.push(() => { previous?.dispose?.(); effects[i] = { deps, dispose:fn() }; });
      }
    },
    setTimeout: fn => { const id = ++nextTimer; timers.set(id,fn); return id; },
    clearTimeout: id => timers.delete(id),
    sfx: {click() {},drop() {},win() {},lose() {}}, toast: {success() {},error() {}},
  });
  const render = () => {
    cursor = 0; effectCursor = 0; queued = [];
    const actions = run(); queued.forEach(fn => fn()); return actions;
  };
  render();
  return {
    play(from,to) { render().onSquareClick(from); render().onSquareClick(to); render(); },
    cpu() { assert.equal(timers.size,1); for (const [id,fn] of [...timers]) {timers.delete(id);fn();} render(); },
    reset() { render().reset(); render(); },
    requests,
    get game() { return slots[0]; },
    get state() { return { status:slots[2],finished:slots[3],shareOpen:slots[5],xp:slots[6].xp }; },
    get pending() { return timers.size; },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

for (const authenticated of [false,true]) {
  test(`threefold repetition after CPU move ends ${authenticated ? "signed-in" : "guest"} game`,async()=>{
    const h = harness({authenticated,cpuMoves:["Nf6","Ng8","Nf6","Ng8"]});
    for (let i=0;i<2;i++) {
      h.play("g1","f3");h.cpu();h.play("f3","g1");h.cpu();
      if (i===0) assert.equal(h.state.finished,null,"Two occurrences are not a draw");
    }
    assert.equal(h.game.history().length,8);
    assert.equal(h.game.isThreefoldRepetition(),true);
    assert.equal(h.state.status,"Draw.");
    assert.equal(h.state.finished,"draw");
    assert.equal(h.pending,0);
    if (authenticated) {
      assert.equal(h.requests.length,1);
      assert.equal(h.requests[0].payload.won,false);
      assert.equal(h.requests[0].payload.score,0);
      h.requests[0].resolve({ok:true,xp_gained:5,challenge_completed:false});
      await settle();
      assert.equal(h.state.xp,5);
    } else assert.equal(h.requests.length,0);
    assert.equal(h.state.shareOpen,true);
    h.play("e2","e4");
    assert.equal(h.game.history().length,8,"Finished game cannot accept another move");
    h.reset();
    assert.equal(h.game.history().length,0);
    assert.equal(h.game.isThreefoldRepetition(),false);
    assert.equal(h.state.finished,null);
    assert.equal(h.state.shareOpen,false);
  });
}

test("threefold repetition after player move does not schedule another CPU turn",()=>{
  const initial = new Chess();initial.move("Nf3");
  const h = harness({fen:initial.fen(),cpuMoves:["Nf6","Ng8","Nf6","Ng8"]});
  for(let i=0;i<2;i++) {
    h.cpu();h.play("f3","g1");h.cpu();h.play("g1","f3");
    if(i===0) assert.equal(h.state.finished,null);
  }
  assert.equal(h.game.isThreefoldRepetition(),true);
  assert.equal(h.state.finished,"draw");
  assert.equal(h.state.shareOpen,true);
  assert.equal(h.pending,0);
});

test("history-preserving turns retain castling and en passant",()=>{
  const h = harness({cpuMoves:["e6","Nc6","Nf6","Be7","O-O","d5"]});
  for(const [from,to] of [["e2","e4"],["g1","f3"],["f1","e2"],["e1","g1"],["a2","a3"],["e4","e5"]]) {
    h.play(from,to);h.cpu();
  }
  assert.equal(h.game.get("g1").type,"k");assert.equal(h.game.get("f1").type,"r");
  assert.equal(h.game.get("g8").type,"k");assert.equal(h.game.get("f8").type,"r");
  h.play("e5","d6");
  assert.equal(h.game.history().at(-1),"exd6");
  assert.equal(h.game.get("d5"),undefined);
  assert.equal(h.game.get("d6").type,"p");
});

test("player promotion retains custom starting position and move history",()=>{
  const h = harness({fen:"7k/P7/8/8/8/8/8/7K w - - 0 1"});
  h.play("a7","a8");
  assert.equal(h.game.get("a8").type,"q");
  assert.equal(h.game.history().length,1);
  assert.equal(h.game.history()[0],"a8=Q+");
});

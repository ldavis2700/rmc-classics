import { useEffect, useRef, useState, useCallback } from "react";
import Matter from "matter-js";
import GameShell from "@/components/rmc/GameShell";
import ShareCard from "@/components/rmc/ShareCard";
import { sfx } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { GAME_MAP } from "@/lib/games";
import { haptic } from "@/lib/native";
import { Hand } from "lucide-react";

/**
 * TUMBLE TOWER (Jenga)
 *
 * 2D physics-based tower stacking game using matter-js.
 * - Side view of a wooden-block tower (12 rows × 3 blocks = 36 blocks).
 * - Player taps a block, then taps PULL. Block flies away with impulse.
 * - The tower reacts with realistic physics.
 * - Collapse detected when the top row falls below its expected height
 *   OR when a critical mass of blocks has dropped below tower base.
 * - Score = number of successful pulls before collapse.
 */

const ROWS = 12;
const BLOCKS_PER_ROW = 3;
const BLOCK_W = 44;
const BLOCK_H = 22;
const BLOCK_GAP = 1;
const WORLD_W = 500;
const WORLD_H = 700;
const GROUND_Y = WORLD_H - 30;
const TOWER_LEFT = WORLD_W / 2 - (BLOCK_W * BLOCKS_PER_ROW + BLOCK_GAP * (BLOCKS_PER_ROW - 1)) / 2;
const COLLAPSE_DROP_PX = 60;  // if any originally-top row block drops this far, tower has fallen
const SAFE_TOP_ROWS = 3;      // top N rows are always safe to pull

const WOOD_COLORS = ["#C8834E", "#B67240", "#D89463", "#A65D2E", "#CC8B57"];
const SAFE_STROKE = "#39FF14";        // green outline for "safe" blocks
const DEFAULT_STROKE = "#7a4a20";
const SELECTED_STROKE = "#FFD100";

export default function Jenga() {
  const { user, submitScore } = useAuth();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const renderRef = useRef(null);
  const blocksRef = useRef([]);        // array of matter bodies (in stack order)
  const originalYRef = useRef([]);     // starting Y of each block
  const selectedIdRef = useRef(null);
  const gameOverRef = useRef(false);

  const [score, setScore] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [xpInfo, setXpInfo] = useState({ xp: 0, done: false });

  // Recompute which remaining blocks are "safe to pull" and update their stroke color.
  // Safe blocks in real Jenga: (1) any block in the top few rows (no weight above them)
  //   (2) the MIDDLE-column block in any row, as long as its two outer siblings are still
  //       present to support the tower after removal.
  // Everything else is risky (default brown outline).
  const refreshSafetyHints = useCallback(() => {
    const blocks = blocksRef.current;
    if (!blocks.length) return;
    // Map rows -> {col: block}
    const rowMap = {};
    for (const b of blocks) {
      if (b.removed) continue;
      if (!rowMap[b.row]) rowMap[b.row] = {};
      rowMap[b.row][b.col] = b;
    }
    const remaining = blocks.filter((b) => !b.removed);
    if (!remaining.length) return;
    const topmostRemainingRow = Math.max(...remaining.map((b) => b.row));
    for (const b of blocks) {
      if (b.removed || b.blockId === selectedIdRef.current) continue;
      const rowsFromTop = topmostRemainingRow - b.row;
      const isNearTop = rowsFromTop < SAFE_TOP_ROWS;
      // Middle-column block is safe if both outer siblings still exist
      const isMiddleWithSupports =
        b.col === 1 && rowMap[b.row]?.[0] && rowMap[b.row]?.[2];
      const safe = isNearTop || isMiddleWithSupports;
      b.render.strokeStyle = safe ? SAFE_STROKE : DEFAULT_STROKE;
      b.render.lineWidth = safe ? 2 : 1;
    }
  }, []);

  const buildTower = useCallback(() => {
    const { World, Bodies } = Matter;
    const engine = engineRef.current;

    // Ground
    const ground = Bodies.rectangle(WORLD_W / 2, GROUND_Y + 15, WORLD_W, 30, {
      isStatic: true,
      render: { fillStyle: "#3a2d1a" },
      label: "ground",
    });
    World.add(engine.world, ground);

    // Blocks
    const blocks = [];
    const origY = [];
    let blockId = 0;
    for (let row = 0; row < ROWS; row++) {
      const y = GROUND_Y - BLOCK_H / 2 - row * BLOCK_H;
      for (let col = 0; col < BLOCKS_PER_ROW; col++) {
        const x = TOWER_LEFT + BLOCK_W / 2 + col * (BLOCK_W + BLOCK_GAP);
        const color = WOOD_COLORS[(row + col) % WOOD_COLORS.length];
        const block = Bodies.rectangle(x, y, BLOCK_W, BLOCK_H, {
          friction: 0.9,
          frictionStatic: 1.2,
          restitution: 0.02,
          density: 0.004,
          label: `block-${blockId}`,
          render: {
            fillStyle: color,
            strokeStyle: "#7a4a20",
            lineWidth: 1,
          },
        });
        block.blockId = blockId;
        block.row = row;
        block.col = col;
        blocks.push(block);
        origY.push(y);
        blockId++;
      }
    }
    World.add(engine.world, blocks);
    blocksRef.current = blocks;
    originalYRef.current = origY;
    refreshSafetyHints();
  }, [refreshSafetyHints]);

  const resetGame = useCallback(() => {
    if (renderRef.current) Matter.Render.stop(renderRef.current);
    if (engineRef.current) {
      Matter.Engine.clear(engineRef.current);
      Matter.World.clear(engineRef.current.world);
    }
    selectedIdRef.current = null;
    gameOverRef.current = false;
    setSelectedId(null);
    setScore(0);
    setGameOver(false);
    setBusy(false);
    setSubmitted(false);
    setXpInfo({ xp: 0, done: false });

    const engine = Matter.Engine.create();
    engine.world.gravity.y = 1.4;
    engineRef.current = engine;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = Matter.Render.create({
      canvas,
      engine,
      options: {
        width: WORLD_W,
        height: WORLD_H,
        wireframes: false,
        background: "transparent",
        pixelRatio: window.devicePixelRatio || 1,
      },
    });
    renderRef.current = render;

    buildTower();

    Matter.Render.run(render);
    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
    engine.runner = runner;

    // Collapse detector - runs on every tick
    Matter.Events.on(engine, "afterUpdate", () => {
      if (gameOverRef.current) return;
      const blocks = blocksRef.current;
      const orig = originalYRef.current;
      let fallen = 0;
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (b.removed) continue;
        // Check both drop AND being pushed way off center (block flew off)
        const dy = b.position.y - orig[i];
        const dx = Math.abs(b.position.x - (TOWER_LEFT + BLOCK_W / 2 + (i % BLOCKS_PER_ROW) * (BLOCK_W + BLOCK_GAP)));
        if (dy > COLLAPSE_DROP_PX || dx > WORLD_W * 0.35) {
          fallen++;
        }
      }
      // Tower collapses when 3+ still-attached blocks (non-selected pulls) have shifted
      if (fallen >= 3) {
        gameOverRef.current = true;
        setGameOver(true);
        sfx.lose();
        haptic("heavy");
      }
    });
  }, [buildTower]);

  // Mount / unmount
  useEffect(() => {
    resetGame();
    return () => {
      if (renderRef.current) Matter.Render.stop(renderRef.current);
      if (engineRef.current?.runner) Matter.Runner.stop(engineRef.current.runner);
      if (engineRef.current) {
        Matter.Engine.clear(engineRef.current);
        Matter.World.clear(engineRef.current.world);
      }
    };
  }, [resetGame]);

  // Canvas click -> select block
  const onCanvasClick = (e) => {
    if (gameOverRef.current || busy) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = WORLD_W / rect.width;
    const scaleY = WORLD_H / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // Query for a block at that point
    const bodies = blocksRef.current.filter((b) => !b.removed);
    const hit = Matter.Query.point(bodies, { x, y })[0];
    if (!hit) {
      selectedIdRef.current = null;
      setSelectedId(null);
      return;
    }
    // Highlight selected
    if (selectedIdRef.current !== null) {
      const prev = blocksRef.current[selectedIdRef.current];
      if (prev && !prev.removed) {
        prev.render.strokeStyle = DEFAULT_STROKE;
        prev.render.lineWidth = 1;
      }
    }
    hit.render.strokeStyle = SELECTED_STROKE;
    hit.render.lineWidth = 3;
    selectedIdRef.current = hit.blockId;
    setSelectedId(hit.blockId);
    refreshSafetyHints();      // repaint safe-hints for remaining blocks
    sfx.click();
    haptic("light");
  };

  // PULL selected block: apply strong lateral impulse and mark removed
  const pullBlock = () => {
    if (busy || gameOverRef.current) return;
    const id = selectedIdRef.current;
    if (id === null || id === undefined) {
      toast.error("Tap a block first");
      return;
    }
    const block = blocksRef.current[id];
    if (!block || block.removed) return;
    setBusy(true);
    haptic("medium");
    sfx.click();

    // Direction: eject sideways off screen
    const centerX = TOWER_LEFT + (BLOCK_W * BLOCKS_PER_ROW + BLOCK_GAP * (BLOCKS_PER_ROW - 1)) / 2;
    const dir = block.position.x < centerX ? -1 : 1;

    // Massive lateral impulse. Also flag as "removed" so collapse-detector ignores it.
    block.removed = true;
    // Reduce friction so it slides out fast; boost velocity directly.
    Matter.Body.setStatic(block, false);
    Matter.Body.applyForce(
      block,
      block.position,
      { x: dir * 0.08, y: -0.005 }
    );

    // After the impulse settles (600ms), score++ and check collapse.
    setTimeout(() => {
      if (gameOverRef.current) {
        setBusy(false);
        return;
      }
      setScore((s) => {
        const next = s + 1;
        sfx.win();
        return next;
      });
      selectedIdRef.current = null;
      setSelectedId(null);
      setBusy(false);
    }, 650);
  };

  // Submit score on game over
  useEffect(() => {
    if (!gameOver || submitted) return;
    setSubmitted(true);
    toast.error("Tower fell!");
    if (user) {
      submitScore({ game_id: "jenga", won: score >= 10, score }).then((res) => {
        if (res.ok) {
          setXpInfo({
            xp: res.xp_gained,
            done: res.challenge_completed,
            badges: res.newly_unlocked_badges,
          });
        }
        setShareOpen(true);
      });
    } else {
      setShareOpen(true);
    }
  }, [gameOver, submitted, user, submitScore, score]);

  const meta = GAME_MAP.jenga;

  return (
    <>
      <GameShell
        title="Tumble Tower"
        subtitle={meta?.tagline}
        color={meta?.color}
        onReset={resetGame}
      >
        <div className="grid gap-4 md:grid-cols-[1fr_240px]">
          {/* Canvas */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1a1230] to-[#0B0A1A]">
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              data-testid="jenga-canvas"
              style={{
                display: "block",
                width: "100%",
                aspectRatio: `${WORLD_W} / ${WORLD_H}`,
                touchAction: "manipulation",
                cursor: gameOver ? "default" : "pointer",
              }}
            />
            {gameOver && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60">
                <div className="text-center">
                  <div
                    className="font-display text-4xl font-black uppercase tracking-tight text-white sm:text-5xl"
                    style={{ textShadow: `0 0 40px ${meta?.color}` }}
                    data-testid="jenga-gameover"
                  >
                    Timber!
                  </div>
                  <div className="mt-3 font-pixel text-sm text-neon-yellow">
                    Final Score: {score}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Side panel */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#16152b] p-4">
              <p className="font-pixel text-[11px] uppercase tracking-widest text-[#6a6890]">
                Pulls
              </p>
              <div
                className="font-display text-4xl font-black text-white"
                data-testid="jenga-score"
                style={{ textShadow: `0 0 22px ${meta?.color}66` }}
              >
                {score}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#16152b] p-4 text-xs text-[#a3a1c6]">
              <p className="mb-2 font-pixel text-[11px] uppercase tracking-widest text-neon-cyan">
                How to play
              </p>
              <ol className="list-decimal space-y-1 pl-4">
                <li>Tap a block to select it</li>
                <li>Tap PULL to yank it out</li>
                <li>Every clean pull scores +1</li>
                <li>Don&apos;t topple the tower</li>
              </ol>
              <div
                className="mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] text-neon-green"
                style={{
                  border: "1px solid rgba(57, 255, 20, 0.3)",
                  background: "rgba(57, 255, 20, 0.06)",
                }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm bg-transparent"
                  style={{ border: "2px solid #39FF14" }}
                />
                Green outline = safer pull
              </div>
            </div>
            <button
              type="button"
              onClick={pullBlock}
              disabled={busy || gameOver || selectedId === null}
              data-testid="jenga-pull-btn"
              className="btn-arcade flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${meta?.color}, ${meta?.accent})`,
                color: "#0B0A1A",
              }}
            >
              <Hand className="h-4 w-4" />
              {selectedId !== null ? "Pull!" : "Select a block"}
            </button>
          </div>
        </div>
      </GameShell>

      <ShareCard
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        game={GAME_MAP.jenga}
        won={score >= 10}
        statLabel="Pulls"
        statValue={score}
        xpGained={xpInfo.xp}
        challengeCompleted={xpInfo.done}
        newlyUnlockedBadges={xpInfo.badges || []}
      />
    </>
  );
}

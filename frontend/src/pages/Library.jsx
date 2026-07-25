import { motion } from "framer-motion";
import GameCard from "@/components/rmc/GameCard";
import { GAMES } from "@/lib/games";

export default function Library() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 md:px-8 md:pt-14">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="font-pixel text-xs text-neon-cyan">// GAME LIBRARY</p>
          <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
          Nine classics. Endless replays.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[#a3a1c6]">
            Every game is instantly playable. Log in to save your stats and climb the global boards.
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g, i) => (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
          >
            <GameCard game={g} index={i} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

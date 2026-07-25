import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { sfx } from "@/lib/sound";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    sfx.click();
    const res = await register(email, password, name);
    setBusy(false);
    if (res.ok) {
      sfx.win();
      toast.success("Account created! Let's play.");
      navigate("/library");
    } else {
      sfx.lose();
      toast.error(res.error || "Registration failed");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10 md:pt-16">
      <div className="rounded-3xl border border-white/10 bg-[#16152b] p-8">
        <p className="font-pixel text-xs text-neon-yellow">// NEW PLAYER</p>
        <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white">
          Create account
        </h1>
        <p className="mt-2 text-sm text-[#a3a1c6]">
          One account. Every game. Every leaderboard.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="Nickname" type="text" value={name} onChange={setName} testId="register-name" required />
          <Field label="Email" type="email" value={email} onChange={setEmail} testId="register-email" required />
          <Field
            label="Password (min 6 chars)"
            type="password"
            value={password}
            onChange={setPassword}
            testId="register-password"
            required
          />
          <button
            type="submit"
            data-testid="register-submit"
            disabled={busy}
            className="btn-arcade w-full rounded-2xl py-3 text-sm font-black disabled:opacity-60"
          >
            {busy ? "..." : "▶ Start playing"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[#a3a1c6]">
          Already have an account?{" "}
          <Link to="/login" data-testid="link-login" className="font-semibold text-neon-cyan hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, testId, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[#a3a1c6]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        data-testid={testId}
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-[#6a6890] focus:border-neon-pink focus:ring-1 focus:ring-neon-pink"
      />
    </label>
  );
}

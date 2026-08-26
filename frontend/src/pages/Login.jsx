import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { sfx } from "@/lib/sound";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!acceptedTerms) {
      toast.error("Please agree to the Terms of Use and Privacy Policy before logging in.");
      return;
    }
    setBusy(true);
    sfx.click();
    const res = await login(email, password, acceptedTerms);
    setBusy(false);
    if (res.ok) {
      sfx.win();
      toast.success("Welcome back!");
      navigate("/profile");
    } else {
      sfx.lose();
      toast.error(res.error || "Login failed");
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pt-10 md:pt-16">
      <div className="rounded-3xl border border-white/10 bg-[#16152b] p-8">
        <p className="font-pixel text-xs text-neon-cyan">// ACCESS PORTAL</p>
        <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white">
          Log in
        </h1>
        <p className="mt-2 text-sm text-[#a3a1c6]">
          Continue your streak and defend your rank.
        </p>
        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <Field label="Email" type="email" value={email} onChange={setEmail} testId="login-email" required />
          <Field label="Password" type="password" value={password} onChange={setPassword} testId="login-password" required />
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-[#c5c3df]">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              data-testid="login-terms-checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-[#00F0FF]"
            />
            <span>
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="font-semibold text-neon-cyan hover:underline">Terms of Use</Link>{" "}
              and{" "}
              <Link to="/privacy" target="_blank" className="font-semibold text-neon-cyan hover:underline">Privacy Policy</Link>.
              Abusive or objectionable behavior is prohibited and may be reported or blocked.
            </span>
          </label>
          <button
            type="submit"
            data-testid="login-submit"
            disabled={busy || !acceptedTerms}
            className="btn-arcade w-full rounded-2xl py-3 text-sm font-black disabled:opacity-60"
          >
            {busy ? "..." : "▶ Log in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[#a3a1c6]">
          New player?{" "}
          <Link to="/register" data-testid="link-register" className="font-semibold text-neon-cyan hover:underline">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, testId, required }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-[#a3a1c6]">{label}</span>
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

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

export default function AccountSettings() {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  const onDelete = async () => {
    if (!confirmed || busy) return;
    const finalConfirm = window.confirm(
      "Permanently delete your RMC Classics account and associated account data? This cannot be undone."
    );
    if (!finalConfirm) return;
    setBusy(true);
    const result = await deleteAccount();
    setBusy(false);
    if (result.ok) {
      toast.success("Your account has been permanently deleted.");
      navigate("/", { replace: true });
    } else {
      toast.error(result.error || "Unable to delete account. Please try again.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 md:px-8 md:pt-14">
      <p className="font-pixel text-xs text-neon-cyan">// ACCOUNT</p>
      <h1 className="mt-1 font-display text-3xl font-black uppercase tracking-tight text-white">
        Account settings
      </h1>

      <div className="mt-6 rounded-3xl border border-white/10 bg-[#16152b] p-6">
        <h2 className="font-display text-xl font-black uppercase tracking-tight text-white">
          Signed in as
        </h2>
        <p className="mt-2 text-sm text-[#a3a1c6]">{user.email}</p>
      </div>

      <div className="mt-6 rounded-3xl border border-red-500/40 bg-red-500/5 p-6" data-testid="delete-account-section">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-tight text-white">
              Permanently delete account
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#c5c3df]">
              This permanently deletes your RMC Classics account and associated account data, including your profile,
              friend connections, gameplay history tied to your account, and stored progression. This is not temporary
              deactivation and cannot be undone.
            </p>
          </div>
        </div>

        <label className="mt-5 block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-[#a3a1c6]">
            Type DELETE to confirm
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            data-testid="delete-account-confirm-input"
            autoCapitalize="characters"
            className="w-full rounded-xl border border-red-500/30 bg-black/30 px-4 py-3 text-white outline-none focus:border-red-400"
          />
        </label>

        <button
          type="button"
          onClick={onDelete}
          disabled={!confirmed || busy}
          data-testid="delete-account-button"
          className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-red-500/50 bg-red-500/10 px-5 py-3 text-sm font-black uppercase tracking-widest text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
          {busy ? "Deleting…" : "Delete account permanently"}
        </button>
      </div>
    </div>
  );
}

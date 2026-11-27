import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function AccountRefreshNotice() {
  const { refreshError, refresh, logout } = useAuth();
  const [retrying, setRetrying] = useState(false);
  if (!refreshError) return null;
  return (
    <div role="alert" className="mx-auto my-6 max-w-xl rounded-2xl border border-white/20 bg-[#16152b] p-5 text-white" data-testid="account-refresh-error">
      <p>{refreshError}</p>
      <button type="button" disabled={retrying} data-testid="account-refresh-retry" className="btn-arcade mt-4" onClick={async () => {
        setRetrying(true);
        try { await refresh(); } finally { setRetrying(false); }
      }}>{retrying ? "Retrying…" : "Try again"}</button>
      <button type="button" className="ml-4 underline" onClick={logout}>Sign out</button>
    </div>
  );
}

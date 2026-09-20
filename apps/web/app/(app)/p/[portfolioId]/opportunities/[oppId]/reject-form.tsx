"use client";

import { useActionState } from "react";
import { rejectOpportunity, type OppState } from "../actions";

export function RejectForm({ portfolioId, oppId }: { portfolioId: string; oppId: string }) {
  const [state, action, pending] = useActionState<OppState, FormData>(rejectOpportunity, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="portfolioId" value={portfolioId} />
      <input type="hidden" name="oppId" value={oppId} />
      <input
        name="reason"
        placeholder="Reason (optional)"
        className="h-9 flex-1 rounded-md border border-[var(--color-border)] bg-transparent px-2 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-9 rounded-md border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
      >
        {pending ? "…" : "Reject"}
      </button>
      {state?.error ? <span className="text-xs text-red-500">{state.error}</span> : null}
    </form>
  );
}

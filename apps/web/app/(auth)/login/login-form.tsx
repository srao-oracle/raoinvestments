"use client";

import { useActionState } from "react";
import { signInWithPassword, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--color-muted-foreground)]">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 rounded-md border border-[var(--color-border)] bg-transparent px-3 text-base outline-none focus:border-[var(--color-primary)]"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-[var(--color-muted-foreground)]">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 rounded-md border border-[var(--color-border)] bg-transparent px-3 text-base outline-none focus:border-[var(--color-primary)]"
        />
      </label>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-[var(--color-primary)] px-4 font-medium text-[var(--color-primary-foreground)] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

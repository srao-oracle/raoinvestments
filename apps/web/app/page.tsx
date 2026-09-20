import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium tracking-wide text-[var(--color-muted-foreground)]">
          raoinvestments.app
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          RaoInvestments
        </h1>
        <p className="max-w-prose text-lg text-[var(--color-muted-foreground)]">
          A private, hedge-fund-style AI portfolio manager for stocks &amp; options. It develops
          strategy, scouts and red-teams opportunities, and proposes sized trades for your
          approval — it never executes on its own.
        </p>
      </div>

      <div>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-md bg-[var(--color-primary)] px-5 font-medium text-[var(--color-primary-foreground)]"
        >
          Sign in
        </Link>
      </div>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        Private &amp; invite-only. For informational purposes; not investment advice.
      </p>
    </main>
  );
}

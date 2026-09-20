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

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">
        <p className="font-medium text-[var(--color-foreground)]">M0 — Foundations</p>
        <p className="mt-1">
          Monorepo scaffolded. Data model &amp; auth land in M1, market data in M2. Access will be
          email-allowlisted. Not investment advice.
        </p>
      </div>
    </main>
  );
}

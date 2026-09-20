import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type PortfolioRow = {
  id: string;
  name: string;
  cash_balance: number;
  risk_tolerance: string;
};

export default async function PortfoliosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance, risk_tolerance")
    .order("name");

  const portfolios = (data ?? []) as PortfolioRow[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Portfolios</h1>
        <span className="text-sm text-[var(--color-muted-foreground)]">
          {portfolios.length} portfolio{portfolios.length === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-500">
          Couldn’t load portfolios: {error.message}
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {portfolios.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-[var(--color-border)] p-4"
          >
            <Link href={`/p/${p.id}`} className="flex flex-col gap-1">
              <span className="text-lg font-medium">{p.name}</span>
              <span className="text-sm text-[var(--color-muted-foreground)]">
                Cash{" "}
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(Number(p.cash_balance))}{" "}
                · {p.risk_tolerance.replace("_", " ")}
              </span>
            </Link>
          </li>
        ))}
        {portfolios.length === 0 && !error ? (
          <li className="text-sm text-[var(--color-muted-foreground)]">
            No portfolios yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

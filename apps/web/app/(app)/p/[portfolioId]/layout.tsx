import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PortfolioNav } from "@/components/shell/portfolio-nav";

export default async function PortfolioLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, name, risk_tolerance")
    .eq("id", portfolioId)
    .maybeSingle();

  if (!portfolio) notFound();

  return (
    <div className="flex min-h-full flex-col pb-16 md:pb-0">
      <div className="border-b border-[var(--color-border)] px-4 py-3 md:px-6">
        <Link
          href="/portfolios"
          className="mb-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ChevronLeft className="size-3.5" aria-hidden /> Portfolios
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{portfolio.name}</h1>
        <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
          {String(portfolio.risk_tolerance).replace("_", " ")}
        </p>
      </div>

      <div className="hidden md:block">
        <div className="mx-auto max-w-5xl px-6">
          <PortfolioNav portfolioId={portfolioId} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">{children}</div>

      <div className="md:hidden">
        <PortfolioNav portfolioId={portfolioId} />
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Wallet, ArrowLeftRight, PiggyBank, Lightbulb } from "lucide-react";

export function PortfolioNav({ portfolioId }: { portfolioId: string }) {
  const pathname = usePathname();
  const base = `/p/${portfolioId}`;
  const items = [
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${base}/opportunities`, label: "Ideas", icon: Lightbulb, exact: false },
    { href: `${base}/positions`, label: "Positions", icon: Wallet, exact: false },
    { href: `${base}/trades`, label: "Trades", icon: ArrowLeftRight, exact: false },
    { href: `${base}/funds`, label: "Funds", icon: PiggyBank, exact: false },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className={cn(
        // mobile: fixed bottom tab bar; desktop: inline top tab row
        "fixed inset-x-0 bottom-0 z-20 flex items-stretch justify-around border-t border-[var(--color-border)] bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)]",
        "md:static md:justify-start md:gap-1 md:border-t-0 md:border-b md:pb-0",
      )}
    >
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-xs md:flex-none md:flex-row md:gap-2 md:px-3 md:py-2.5 md:text-sm",
              active
                ? "text-[var(--color-primary)] md:border-b-2 md:border-[var(--color-primary)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
            )}
          >
            <Icon className="size-5 md:size-4" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { signOut } from "./actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAllowedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/login?denied=1");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <span className="font-semibold tracking-tight">RaoInvestments</span>
        <div className="flex items-center gap-3 text-sm text-[var(--color-muted-foreground)]">
          <span className="hidden sm:inline">{user.email}</span>
          <a href="/settings" className="hover:text-[var(--color-foreground)]">
            Settings
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 hover:bg-[var(--color-muted)]"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

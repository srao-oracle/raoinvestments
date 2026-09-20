import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/portfolios");

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium tracking-wide text-[var(--color-muted-foreground)]">
          raoinvestments.app
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Private access. Accounts are invite-only.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}

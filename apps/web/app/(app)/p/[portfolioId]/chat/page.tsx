import { createClient } from "@/lib/supabase/server";
import { Chat, type ChatMsg } from "./chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  const supabase = await createClient();
  const { data: thread } = await supabase
    .from("agent_threads")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("scope", "portfolio")
    .is("opportunity_id", null)
    .maybeSingle();

  let initial: ChatMsg[] = [];
  if ((thread as { id: string } | null)?.id) {
    const { data: msgs } = await supabase
      .from("agent_messages")
      .select("role, content")
      .eq("thread_id", (thread as { id: string }).id)
      .order("seq", { ascending: true })
      .limit(50);
    initial = ((msgs ?? []) as Array<{ role: "user" | "assistant"; content: Array<{ text?: string }> }>).map(
      (m) => ({ role: m.role, text: (m.content ?? []).map((b) => b.text ?? "").join("") }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Portfolio chat</h2>
      <Chat portfolioId={portfolioId} initial={initial} />
    </div>
  );
}

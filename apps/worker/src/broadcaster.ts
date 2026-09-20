import { config } from "./config";

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: unknown;
}

/**
 * Fan out via Supabase Realtime's stateless broadcast endpoint (one HTTP POST per flush)
 * rather than maintaining hundreds of client channels.
 */
export async function broadcast(messages: BroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const res = await fetch(`${config.supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabaseServiceKey,
      Authorization: `Bearer ${config.supabaseServiceKey}`,
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ ...m, private: false })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`broadcast ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
}

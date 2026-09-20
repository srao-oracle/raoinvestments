import WebSocket from "ws";
import { config } from "./config";
import { broadcast, type BroadcastMessage } from "./broadcaster";
import { supabase } from "./supabase";
import { deriveStockSymbols, deriveOptionOccSymbols } from "./symbols";

interface PolyEvent {
  ev?: string; // "status" | "T" | "Q" | "AM"
  sym?: string;
  status?: string;
  message?: string;
  p?: number; // trade price
  bp?: number; // bid price
  ap?: number; // ask price
  t?: number; // timestamp (ms)
}

interface Tick {
  symbol: string;
  last?: number;
  bid?: number;
  ask?: number;
  ts: number;
}

type ClusterName = "stocks" | "options";

class Cluster {
  private ws?: WebSocket;
  private authed = false;
  private desired = new Set<string>();
  private subscribed = new Set<string>();
  private buf = new Map<string, Tick>();
  private backoff = 1000;
  private lastMessageAt = 0;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly name: ClusterName,
    private readonly url: string,
  ) {}

  start(): void {
    this.connect();
    this.flushTimer = setInterval(() => this.flush(), config.throttleMs);
  }

  setDesired(channels: string[]): void {
    this.desired = new Set(channels);
    this.syncSubscriptions();
  }

  status() {
    return {
      cluster: this.name,
      connected: this.ws?.readyState === WebSocket.OPEN && this.authed,
      subscriptions: this.subscribed.size,
      lastMessageAt: this.lastMessageAt ? new Date(this.lastMessageAt).toISOString() : null,
    };
  }

  private connect(): void {
    this.authed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.on("open", () => {
      ws.send(JSON.stringify({ action: "auth", params: config.massiveKey }));
    });
    ws.on("message", (data: WebSocket.RawData) => this.onMessage(data.toString()));
    ws.on("close", () => this.scheduleReconnect());
    ws.on("error", (err: Error) => {
      void this.recordHealth(false, err.message);
    });
  }

  private scheduleReconnect(): void {
    this.authed = false;
    this.subscribed.clear();
    const delay = this.backoff + Math.random() * 500;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    setTimeout(() => this.connect(), delay);
  }

  private onMessage(raw: string): void {
    this.lastMessageAt = Date.now();
    let events: PolyEvent[];
    try {
      events = JSON.parse(raw) as PolyEvent[];
    } catch {
      return;
    }
    for (const ev of events) {
      if (ev.ev === "status") {
        if (ev.status === "auth_success") {
          this.authed = true;
          this.backoff = 1000;
          this.subscribed.clear();
          void this.recordHealth(true);
          this.syncSubscriptions();
        } else if (ev.status === "auth_failed") {
          void this.recordHealth(false, ev.message ?? "auth_failed");
        }
        continue;
      }
      this.ingest(ev);
    }
  }

  private ingest(ev: PolyEvent): void {
    if (!ev.sym) return;
    const tick = this.buf.get(ev.sym) ?? { symbol: ev.sym, ts: 0 };
    if (ev.ev === "T" && ev.p != null) {
      tick.last = ev.p;
      tick.ts = ev.t ?? Date.now();
    } else if (ev.ev === "Q") {
      if (ev.bp != null) tick.bid = ev.bp;
      if (ev.ap != null) tick.ask = ev.ap;
      tick.ts = ev.t ?? Date.now();
    } else {
      return; // AM bar persistence handled by REST/EOD jobs for now
    }
    this.buf.set(ev.sym, tick);
  }

  private flush(): void {
    if (this.buf.size === 0) return;
    const messages: BroadcastMessage[] = [];
    for (const tick of this.buf.values()) {
      messages.push({ topic: `quotes:${tick.symbol}`, event: "tick", payload: tick });
    }
    this.buf.clear();
    broadcast(messages).catch((err) =>
      console.error(`[${this.name}] broadcast error`, err),
    );
  }

  private syncSubscriptions(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authed) return;
    const toAdd = [...this.desired].filter((c) => !this.subscribed.has(c));
    const toRemove = [...this.subscribed].filter((c) => !this.desired.has(c));
    if (toAdd.length) {
      this.ws.send(JSON.stringify({ action: "subscribe", params: toAdd.join(",") }));
      toAdd.forEach((c) => this.subscribed.add(c));
    }
    if (toRemove.length) {
      this.ws.send(JSON.stringify({ action: "unsubscribe", params: toRemove.join(",") }));
      toRemove.forEach((c) => this.subscribed.delete(c));
    }
  }

  private async recordHealth(connected: boolean, error?: string): Promise<void> {
    const now = new Date().toISOString();
    try {
      await supabase.from("feed_health").upsert({
        feed_name: this.name,
        status: connected ? "ok" : "down",
        connected,
        last_success_at: connected ? now : undefined,
        last_error: error ?? null,
        last_error_at: error ? now : undefined,
        updated_at: now,
      });
    } catch {
      /* health write is best-effort */
    }
  }
}

export async function startRelay() {
  const stocks = new Cluster("stocks", config.wsStocks);
  const options = new Cluster("options", config.wsOptions);
  stocks.start();
  options.start();

  const refresh = async () => {
    const [syms, occ] = await Promise.all([
      deriveStockSymbols(),
      deriveOptionOccSymbols(),
    ]);
    stocks.setDesired(syms.flatMap((s) => [`T.${s}`, `Q.${s}`]));
    options.setDesired(occ.flatMap((o) => [`T.${o}`, `Q.${o}`]));
    console.log(`[relay] symbols → ${syms.length} stocks, ${occ.length} option contracts`);
  };

  await refresh().catch((err) => console.error("[relay] initial symbol refresh failed", err));
  setInterval(() => {
    refresh().catch((err) => console.error("[relay] symbol refresh failed", err));
  }, config.symbolRefreshMs);

  return {
    status: () => ({ stocks: stocks.status(), options: options.status() }),
  };
}

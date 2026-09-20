// Standalone Massive WS handshake check (no DB, no broadcast). Run with:
//   MASSIVE_API_KEY=... pnpm --filter worker exec tsx src/ws-handshake-test.ts
import WebSocket from "ws";

const URL = process.env.MASSIVE_WS_STOCKS ?? "wss://socket.massive.com/stocks";
const KEY = process.env.MASSIVE_API_KEY;
if (!KEY) throw new Error("MASSIVE_API_KEY not set");

const ws = new WebSocket(URL);
let authed = false;

const done = (ok: boolean, msg: string) => {
  console.log(ok ? `HANDSHAKE OK — ${msg}` : `HANDSHAKE FAILED — ${msg}`);
  ws.close();
  process.exit(ok ? 0 : 1);
};

const timer = setTimeout(() => done(authed, authed ? "subscribed (no ticks; market may be closed)" : "timeout"), 8000);

ws.on("open", () => ws.send(JSON.stringify({ action: "auth", params: KEY })));
ws.on("message", (data) => {
  const events = JSON.parse(data.toString()) as Array<{ ev?: string; status?: string; message?: string }>;
  for (const ev of events) {
    if (ev.ev === "status") {
      console.log(`status: ${ev.status}${ev.message ? ` (${ev.message})` : ""}`);
      if (ev.status === "auth_success") {
        authed = true;
        ws.send(JSON.stringify({ action: "subscribe", params: "T.AAPL,Q.AAPL" }));
      } else if (ev.status === "auth_failed") {
        clearTimeout(timer);
        done(false, ev.message ?? "auth_failed");
      }
    } else {
      clearTimeout(timer);
      done(true, `received ${ev.ev} for AAPL (live tick)`);
    }
  }
});
ws.on("error", (e) => {
  clearTimeout(timer);
  done(false, String(e));
});

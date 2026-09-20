function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set`);
  return v;
}

export const config = {
  massiveKey: req("MASSIVE_API_KEY"),
  supabaseUrl: req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceKey: req("SUPABASE_SERVICE_ROLE_KEY"),
  wsStocks: process.env.MASSIVE_WS_STOCKS ?? "wss://socket.massive.com/stocks",
  wsOptions: process.env.MASSIVE_WS_OPTIONS ?? "wss://socket.massive.com/options",
  port: Number(process.env.PORT ?? 8080),
  throttleMs: Number(process.env.WS_THROTTLE_MS ?? 1000),
  symbolRefreshMs: Number(process.env.SYMBOL_REFRESH_MS ?? 30_000),
  defaultWatch: (process.env.DEFAULT_WATCH ?? "SPY,QQQ,AAPL,MSFT,NVDA")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

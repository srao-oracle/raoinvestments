import http from "node:http";

export function startHealthServer(
  port: number,
  getStatus: () => unknown,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ...(getStatus() as object) }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, () => console.log(`[health] listening on :${port}`));
  return server;
}

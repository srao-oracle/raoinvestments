import { config } from "./config";
import { startHealthServer } from "./health";
import { startRelay } from "./relay";

async function main(): Promise<void> {
  console.log("raoinvestments worker starting…");
  const relay = await startRelay();
  startHealthServer(config.port, () => relay.status());
  console.log("[worker] relay + health up");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});

import { config } from "./config";
import { startHealthServer } from "./health";
import { startRelay } from "./relay";
import { startJobPoller, recoverOrphans } from "./jobs";

async function main(): Promise<void> {
  console.log("raoinvestments worker starting…");
  const relay = await startRelay();
  startHealthServer(config.port, () => relay.status());
  await recoverOrphans();
  startJobPoller();
  console.log("[worker] relay + health + job poller up");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});

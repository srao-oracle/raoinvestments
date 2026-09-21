import { supabase } from "./supabase";
// The agent pipeline lives in the web app but is plain TS (no Next deps in this
// subtree). esbuild/tsup bundles it into the worker so long-running Opus jobs run
// here on the always-on machine instead of a time-limited Vercel function.
import { runPipeline, runStrategist } from "../../web/lib/agents/pipeline";
import { runScout } from "../../web/lib/agents/scout";

type Job = {
  id: string;
  portfolio_id: string;
  kind: "pipeline" | "scout" | "strategist";
  params: Record<string, unknown>;
};

async function claimNext(): Promise<Job | null> {
  const { data } = await supabase
    .from("agent_jobs")
    .select("id, portfolio_id, kind, params, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  // Optimistic claim: only succeeds if still queued (guards against double-run).
  const { data: claimed } = await supabase
    .from("agent_jobs")
    .update({
      status: "running",
      started_at: new Date().toISOString(),
      attempts: (data.attempts ?? 0) + 1,
    })
    .eq("id", data.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claimed) return null;

  return {
    id: data.id,
    portfolio_id: data.portfolio_id,
    kind: data.kind,
    params: (data.params ?? {}) as Record<string, unknown>,
  };
}

async function runJob(job: Job): Promise<void> {
  let result: unknown = null;
  let error: string | null = null;
  try {
    if (job.kind === "pipeline") {
      const maxCandidates = Number(job.params.maxCandidates ?? 1) || 1;
      result = await runPipeline(job.portfolio_id, { maxCandidates });
    } else if (job.kind === "scout") {
      result = await runScout(job.portfolio_id);
    } else if (job.kind === "strategist") {
      result = await runStrategist(job.portfolio_id);
    } else {
      throw new Error(`unknown job kind: ${job.kind}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error(`[jobs] ${job.kind} ${job.id} failed:`, error);
  }
  await supabase
    .from("agent_jobs")
    .update({
      status: error ? "error" : "done",
      result: (result as Record<string, unknown> | null) ?? null,
      error,
      finished_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

/** Poll for queued agent jobs and run them one at a time (pipeline is heavy). */
export function startJobPoller(intervalMs = 5000): () => void {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const job = await claimNext();
      if (job) {
        console.log(`[jobs] running ${job.kind} for portfolio ${job.portfolio_id} (job ${job.id})`);
        const t0 = Date.now();
        await runJob(job);
        console.log(`[jobs] finished ${job.id} in ${Math.round((Date.now() - t0) / 1000)}s`);
      }
    } catch (e) {
      console.error("[jobs] poll error", e);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}

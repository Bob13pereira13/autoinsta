import { assertNoPlaceholderSecrets, PlaceholderSecretError } from "@/lib/env-safety";

/**
 * Run once when a process starts (web: instrumentation.ts, worker:
 * worker/dm-worker.ts). In production a placeholder secret stops the process;
 * in development it only warns, so a fresh clone still runs with the examples.
 */
export function runStartupChecks(processName: string): void {
  try {
    assertNoPlaceholderSecrets();
  } catch (err) {
    if (!(err instanceof PlaceholderSecretError)) throw err;
    if (process.env.NODE_ENV === "production") {
      console.error(`[${processName}] ${err.message}`);
      process.exit(1);
    }
    console.warn(`[${processName}] Development only — ${err.message}`);
  }
}

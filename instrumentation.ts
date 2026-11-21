// Runs once when the Next.js server starts, before it serves requests.
export async function register() {
  // process.exit and the checks are Node-only; the Edge runtime skips them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupChecks } = await import("./lib/startup-check");
    runStartupChecks("web");
  }
}

import { getDb } from "../lib/db.ts";
import { runScheduledReports } from "../lib/reports.ts";
const tick = () => {
  try {
    const results = runScheduledReports(getDb());
    console.log(
      JSON.stringify({
        time: new Date().toISOString(),
        ready: results.filter((r) => r.status === "ready").length,
        failed: results.filter((r) => r.status === "failed").length,
      }),
    );
  } catch (error) {
    console.error(
      "Local scheduler failed:",
      error instanceof Error ? error.name : "unknown",
    );
    process.exitCode = 1;
  }
};
tick();
if (process.argv.includes("--watch")) setInterval(tick, 60_000);

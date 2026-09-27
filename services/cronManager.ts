import { exec } from "child_process";
import { promisify } from "util";
import { dreamCycle } from "./dreamCycle";

const execAsync = promisify(exec);

export function startNightlyCron() {
  console.log("[SNOW] Starting Nightly Memory Consolidation Cron (03:00 AM)...");
  
  // Calculate time until next 3:00 AM
  const now = new Date();
  const nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0);
  if (now.getTime() > nextRun.getTime()) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const msUntilRun = nextRun.getTime() - now.getTime();
  
  setTimeout(() => {
    runNightlyTasks();
    // Re-schedule for next 24 hours
    setInterval(runNightlyTasks, 24 * 60 * 60 * 1000);
  }, msUntilRun);
}

async function runNightlyTasks() {
  console.log("[SNOW CRON] Executing nightly maintenance...");
  try {
    await dreamCycle.runDreamCycle();
    console.log("[SNOW CRON] Dream cycle complete.");
  } catch (err: any) {
    console.error("[SNOW CRON] Dream cycle failed:", err.message);
  }
}

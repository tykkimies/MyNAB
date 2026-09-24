/**
 * The durable background worker: `npm run worker`. Runs beside the app in its
 * own container, using the same application modules and database.
 *
 * On SIGTERM it stops claiming, lets the current job finish (or its lease lapse
 * if the container is killed first) and exits, so a restart never loses work:
 * an unfinished job is reclaimed once its lease expires.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getDb } from "../src/infrastructure/db";
import { getConfig } from "../src/infrastructure/config";
import { claim, heartbeat, runJob, scheduleDue } from "../src/application/jobs";

const IDLE_MS = 15_000;
const SCHEDULE_MS = 5 * 60_000;
const HEARTBEAT_FILE = "/tmp/mynab-worker-heartbeat";

getConfig(); // Refuse to start with invalid configuration.
const id = `worker-${randomUUID().slice(0, 8)}`;
const startedAt = new Date();
let running = true;
let wake: (() => void) | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    running = false;
    wake?.();
  });
const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(timer);
      resolve();
    };
  });

// Logs carry job kinds and outcomes only: never payloads, tokens or errors verbatim.
const log = (message: string) =>
  console.log(`${new Date().toISOString()} ${id} ${message}`);

let lastSchedule = 0;
log("started");
while (running) {
  try {
    await heartbeat(id, startedAt);
    await writeFile(HEARTBEAT_FILE, new Date().toISOString());
    if (Date.now() - lastSchedule >= SCHEDULE_MS) {
      const queued = await scheduleDue();
      lastSchedule = Date.now();
      if (queued) log(`queued ${queued} job(s)`);
    }
    const job = await claim();
    if (!job) {
      await pause(IDLE_MS);
      continue;
    }
    log(`${job.kind} attempt ${job.attempts}: ${await runJob(job)}`);
  } catch {
    // The database may be restarting; back off rather than spin.
    log("loop error; retrying shortly");
    await pause(IDLE_MS);
  }
}
await getDb()
  .workerHeartbeat.deleteMany({ where: { id } })
  .catch(() => undefined);
await getDb().$disconnect();
log("stopped");

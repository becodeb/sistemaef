import { beforeAll, beforeEach } from "vitest";
import { resetRateLimits } from "@server/lib/rate-limit";

beforeAll(async () => {
  const { runMigrations } = await import("@server/db/migrate");
  await runMigrations();
});

beforeEach(async () => {
  resetRateLimits();
  const { resetDb } = await import("./helpers");
  await resetDb();
});

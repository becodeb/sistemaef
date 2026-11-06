import type { users } from "./db/schema";

export type SessionUser = typeof users.$inferSelect;
export type AppEnv = { Variables: { user: SessionUser | null } };

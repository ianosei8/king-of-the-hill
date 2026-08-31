import "server-only";

import postgres from "postgres";
import { getDatabaseUrl } from "@/lib/env";

const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export function getSql() {
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(getDatabaseUrl(), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForDb.sql;
}

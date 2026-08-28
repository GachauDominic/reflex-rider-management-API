import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: (globalThis as typeof globalThis & {
      process: { env: Record<string, string | undefined> };
    }).process.env.DATABASE_URL as string,
  },
  verbose: true,
  strict: true,
  
} satisfies Config;

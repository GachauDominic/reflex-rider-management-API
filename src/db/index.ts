import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

// Works against a local Postgres instance or a hosted Postgres (e.g. Neon)
// connection string. For Neon, use the pooled connection string.
export const pool = new Pool({
  connectionString,
});

export async function checkDatabaseConnection() {
  await pool.query("SELECT 1");
}

export const db = drizzle(pool, { schema, logger: true });


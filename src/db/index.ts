import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import "dotenv/config"

const connectionString = process.env.DATABASE_URL as string;

// Works against a local Postgres instance or a hosted Postgres (e.g. Neon)
// connection string. For Neon, use the pooled connection string.
export const pool = new Pool({
  connectionString,
  // ssl: connectionString.includes("localhost")
  //   ? false
  //   : { rejectUnauthorized: false },
});

const main = async() => {
  await pool.connect();
}
main().then(()=>{
console.log("Connected to the DB")
}).catch((error)=>{
  console.error("Error connecting to the DB: ", error)
})

export const db = drizzle(pool, { schema, logger: true });


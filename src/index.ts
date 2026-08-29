import dotenv from "dotenv";
import { createApp } from "./app";
import { checkDatabaseConnection, pool } from "./db";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  await checkDatabaseConnection();

  const app = createApp();

  app.listen(PORT, () => {
    console.log(`Reflex API listening on port ${PORT}`);
  });
}

start().catch(async (error) => {
  console.error("Unable to connect to the database:", error);
  await pool.end();
  process.exitCode = 1;
});

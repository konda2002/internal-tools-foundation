import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

// Fresh SQLite database for every test run: migrate, then seed.
export default function setup() {
  const dbPath = path.resolve(__dirname, "../../prisma/test.db");
  rmSync(dbPath, { force: true });
  rmSync(`${dbPath}-journal`, { force: true });
  const env = {
    ...process.env,
    DATABASE_URL: "file:./test.db",
    SESSION_SECRET: "test-secret-0123456789abcdef",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}

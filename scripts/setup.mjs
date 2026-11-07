// `npm run setup`: install, create .env, migrate, generate client, seed.
// After this `npm run dev` and `npm test` both work.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log("Created .env from .env.example");
}

run("npm install");
run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");

console.log("\nSetup complete. Run `npm run dev` and open http://localhost:3000/login");

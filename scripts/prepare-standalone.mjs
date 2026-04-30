import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");
const dest = join(root, "src-tauri", "server");

// Copy .next/static and public into the standalone output — Next.js does not
// include them automatically in the standalone build.
console.log("Copying .next/static …");
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  console.log("Copying public/ …");
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

// Bundle the initial SQLite database so the app can seed it on first run.
const db = join(root, "prisma", "dev.db");
if (existsSync(db)) {
  console.log("Copying prisma/dev.db …");
  mkdirSync(join(standalone, "prisma"), { recursive: true });
  cpSync(db, join(standalone, "prisma", "dev.db"));
}

// Copy the complete standalone output into src-tauri/server/ so Tauri can
// bundle it as a resource.  Clear first to avoid stale files.
console.log("Copying standalone output → src-tauri/server/ …");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(standalone, dest, { recursive: true });

console.log("✓ src-tauri/server/ ready for bundling");

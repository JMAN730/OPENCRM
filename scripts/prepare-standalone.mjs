import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

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
// Exclude src-tauri and .git to avoid accidentally bundling the whole repo.
console.log("Copying standalone output → src-tauri/server/ …");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
const excluded = [join(root, "src-tauri"), join(root, ".git")];
cpSync(standalone, dest, {
  recursive: true,
  filter: (src) => !excluded.some((ex) => src.startsWith(ex)),
});

// Copy native Node.js addons that Next.js standalone trace misses.
// @libsql/client uses a platform-specific .node binary for SQLite access.
const nativePkgs = [
  "@libsql/win32-x64-msvc",
  "@libsql/linux-x64-gnu",
  "@libsql/darwin-x64",
  "@libsql/darwin-arm64",
  "@libsql/linux-arm64-gnu",
];
for (const pkg of nativePkgs) {
  const src = join(root, "node_modules", pkg, "index.node");
  const pkgDest = join(dest, "node_modules", pkg);
  if (existsSync(src) && existsSync(pkgDest)) {
    console.log(`Copying native addon ${pkg}/index.node …`);
    cpSync(src, join(pkgDest, "index.node"));
  }
}

console.log("✓ src-tauri/server/ ready for bundling");

// NSIS flattens directory trees when bundling resource globs, so we ship the
// server as a single ZIP and extract it on first run instead.
const zipPath = join(root, "src-tauri", "server.zip");
rmSync(zipPath, { force: true });
console.log("Creating server.zip …");
execSync(
  `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${dest}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal"`,
  { stdio: "inherit" }
);
console.log("✓ server.zip created");

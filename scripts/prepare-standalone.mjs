import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(root, ".next", "standalone");
const dest = join(root, "src-tauri", "server");

// Copy .next/static and public into the standalone output. Next.js does not
// include them automatically in the standalone build output.
console.log("Copying .next/static ...");
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  console.log("Copying public/ ...");
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

// Copy the complete standalone output into src-tauri/server/ so Tauri can
// bundle it as a resource. Clear first to avoid stale files.
console.log("Copying standalone output -> src-tauri/server/ ...");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

const excluded = [join(root, "src-tauri"), join(root, ".git")];
cpSync(standalone, dest, {
  recursive: true,
  filter: (src) => !excluded.some((excludedPath) => src.startsWith(excludedPath)),
});

console.log("Ready: src-tauri/server/");

// NSIS flattens directory trees when bundling resource globs, so we ship the
// server as a single ZIP and extract it on first run instead.
const zipPath = join(root, "src-tauri", "server.zip");
rmSync(zipPath, { force: true });
console.log("Creating server.zip ...");
execSync(
  `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${dest}\\*' -DestinationPath '${zipPath}' -CompressionLevel Optimal"`,
  { stdio: "inherit" }
);
console.log("Created: server.zip");

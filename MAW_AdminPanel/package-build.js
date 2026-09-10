import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendSrcDir = path.join(__dirname, "../backend");
const deployDir = path.join(__dirname, "deploy_package");

const args = process.argv.slice(2);
const requestedMode = args.includes("--mode")
  ? args[args.indexOf("--mode") + 1]
  : "all";
const supportedModes = new Set(["all", "production", "staging"]);
if (!supportedModes.has(requestedMode)) {
  console.error(`Unsupported package mode: ${requestedMode}`);
  process.exit(1);
}

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const source = path.join(src, entry.name);
    const destination = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, destination);
    } else {
      fs.copyFileSync(source, destination);
    }
  }
};

const copyApi = (destination, includeStagingTools = false) => {
  fs.mkdirSync(destination, { recursive: true });
  const files = [
    "connection.php",
    "db_config.example.php",
    "check_env.php",
    "run_migrations.php",
    ".user.ini",
    ".htaccess",
  ];
  if (includeStagingTools) {
    files.push("sync_db.php", "clear_db.php");
  }
  for (const file of files) {
    fs.copyFileSync(
      path.join(backendSrcDir, file),
      path.join(destination, file),
    );
  }
  fs.copyFileSync(
    path.join(backendSrcDir, "api.php"),
    path.join(destination, "api.php"),
  );
  copyDir(
    path.join(backendSrcDir, "modules"),
    path.join(destination, "modules"),
  );
  copyDir(
    path.join(backendSrcDir, "migrations"),
    path.join(destination, "migrations"),
  );
  copyDir(
    path.join(backendSrcDir, "storage"),
    path.join(destination, "storage"),
  );
  copyDir(
    path.join(backendSrcDir, "uploads"),
    path.join(destination, "uploads"),
  );
};

const buildEnvironment = (mode, destination) => {
  const command =
    mode === "staging" ? "npx vite build --mode staging" : "npx vite build";
  console.log(`Building Admin Panel ${mode}...`);
  execSync(command, { cwd: __dirname, stdio: "inherit" });
  copyDir(path.join(__dirname, "dist"), destination);
  copyApi(
    path.join(destination, mode === "staging" ? "api_staging" : "api"),
    mode === "staging",
  );
};

try {
  if (fs.existsSync(deployDir)) {
    fs.rmSync(deployDir, { recursive: true, force: true });
  }
  fs.mkdirSync(deployDir);

  if (requestedMode === "all" || requestedMode === "production") {
    buildEnvironment("production", deployDir);
  }
  if (requestedMode === "all") {
    buildEnvironment("staging", path.join(deployDir, "staging"));
  } else if (requestedMode === "staging") {
    buildEnvironment("staging", deployDir);
  }

  const zipFileName =
    requestedMode === "staging"
      ? "AdminSystem_Update_Staging.zip"
      : "AdminSystem_Update.zip";
  const zipFilePath = path.join(__dirname, zipFileName);
  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }
  // Archive the directory itself so root-level deployment files such as
  // .htaccess are included. A ./* glob silently omits dotfiles.
  if (process.platform === "win32") {
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${deployDir.replace(/\\/g, '\\\\')}', '${zipFilePath.replace(/\\/g, '\\\\')}')"`;
    execSync(psCmd, { stdio: "inherit" });
  } else {
    execSync(`zip -r "${zipFilePath}" .`, {
      cwd: deployDir,
      stdio: "ignore",
    });
  }
  console.log(`Package ready: ${zipFilePath}`);
  if (requestedMode === "all") {
    console.log("This single ZIP contains production and staging deployments.");
  }
} catch (error) {
  console.error("Build or packaging failed:", error);
  process.exitCode = 1;
} finally {
  if (fs.existsSync(deployDir)) {
    try {
      fs.rmSync(deployDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (e) {
      // Ignore transient cleanup lock
    }
  }
}

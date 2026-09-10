import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const deployDir = path.join(__dirname, 'deploy_package');
const zipFilePath = path.join(__dirname, 'CustomerApp_Update.zip');

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

const buildEnvironment = (mode, destination) => {
  const command = mode === 'staging'
    ? 'npx vite build --mode staging'
    : 'npx vite build';
  console.log(`Building Customer App ${mode}...`);
  execSync(command, { cwd: __dirname, stdio: 'inherit' });
  copyDir(distDir, destination);
};

try {
  if (fs.existsSync(deployDir)) {
    fs.rmSync(deployDir, { recursive: true, force: true });
  }
  fs.mkdirSync(deployDir);

  buildEnvironment('staging', path.join(deployDir, 'staging'));
  buildEnvironment('production', deployDir);

  if (fs.existsSync(zipFilePath)) {
    fs.unlinkSync(zipFilePath);
  }
  if (process.platform === 'win32') {
    const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('${deployDir.replace(/\\/g, '\\\\')}', '${zipFilePath.replace(/\\/g, '\\\\')}')"`;
    execSync(psCmd, { stdio: 'inherit' });
  } else {
    execSync(`zip -r "${zipFilePath}" .`, {
      cwd: deployDir,
      stdio: 'ignore',
    });
  }

  console.log(`Package ready: ${zipFilePath}`);
  console.log('This single ZIP contains production and staging Customer App builds.');
} catch (error) {
  console.error('Customer App build or packaging failed:', error);
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


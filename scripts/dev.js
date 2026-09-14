// Runs the API and the client together so `npm start` at the repo root is
// enough to bring the whole app up. Both halves still have their own
// `npm run dev` — this only saves opening two terminals.
//
// Output is prefixed per process, because the alternative is two interleaved
// logs with no way to tell which one just failed.
const { spawn } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

const processes = [
  { name: "server", color: "[36m", cwd: path.join(root, "server") },
  { name: "client", color: "[35m", cwd: path.join(root, "client") },
];

const RESET = "[0m";
const children = [];
let shuttingDown = false;

const prefixOutput = (stream, label, color) => {
  let buffered = "";

  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffered += chunk;
    const lines = buffered.split("\n");
    // The last element is whatever came in without a trailing newline; hold it
    // back so a prefix never lands in the middle of a line.
    buffered = lines.pop();

    for (const line of lines) {
      process.stdout.write(`${color}[${label}]${RESET} ${line}\n`);
    }
  });
};

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill(signal);
  }
};

for (const { name, color, cwd } of processes) {
  const child = spawn("npm", ["run", "dev"], {
    cwd,
    shell: process.platform === "win32",
  });

  children.push(child);
  prefixOutput(child.stdout, name, color);
  prefixOutput(child.stderr, name, color);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    // One half dying alone leaves a half-running app that looks fine in the
    // browser until a request fails, so take the other one down with it.
    process.stdout.write(
      `${color}[${name}]${RESET} exited (${signal || `code ${code}`}) - stopping the other process\n`
    );
    shutdown("SIGTERM");
    process.exitCode = code === 0 ? 0 : 1;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

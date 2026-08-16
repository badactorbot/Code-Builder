/**
 * kill-port.cjs — kills whatever process owns port 8080 before the server starts.
 * Run as a prestart step. Uses /proc/net/tcp (Linux) to find the PID without lsof.
 */
const fs = require('fs');
const PORT = 8080;
const HEX_PORT = PORT.toString(16).toUpperCase().padStart(4, '0');

function findPid() {
  for (const file of ['/proc/net/tcp6', '/proc/net/tcp']) {
    try {
      const lines = fs.readFileSync(file, 'utf8').split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 10) continue;
        const portHex = (parts[1] ?? '').split(':').pop() ?? '';
        if (portHex.toUpperCase() !== HEX_PORT) continue;
        const inode = parts[9];
        // Map inode → PID via /proc/<pid>/fd symlinks
        for (const pid of fs.readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
          if (parseInt(pid) === process.pid) continue;
          try {
            for (const fd of fs.readdirSync(`/proc/${pid}/fd`)) {
              try {
                if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`) {
                  return parseInt(pid);
                }
              } catch {}
            }
          } catch {}
        }
      }
    } catch {}
  }
  return null;
}

const pid = findPid();
if (pid) {
  console.log(`[kill-port] port ${PORT} held by PID ${pid} — sending SIGTERM`);
  try { process.kill(pid, 'SIGTERM'); } catch {}
  // Wait up to 2 s for it to exit, then SIGKILL
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch { break; } // process gone
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  try { process.kill(pid, 'SIGKILL'); } catch {}
  console.log(`[kill-port] done`);
} else {
  console.log(`[kill-port] port ${PORT} is free`);
}

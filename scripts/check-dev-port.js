// Runs as `predev` before `next dev` starts. Next's dev server does NOT
// refuse to start on a port already in use — it silently retries on the
// next port (3001, 3002, ...) while still reading/writing the same shared
// `.next/dev` Turbopack cache as the first instance, which corrupts that
// cache and causes routes to spuriously 404. Fail loudly here instead.
//
// NOTE: this probes by attempting a client connection, not by binding a
// server on the port. Binding does NOT reliably detect an in-use port on
// Windows here (Node/Windows did not surface EADDRINUSE for a bind attempt
// against an already-listening port during testing), so a connect-based
// check is used instead.
const net = require("net");

const PORT = Number(process.env.PORT) || 3000;

const socket = net.createConnection({ port: PORT, host: "127.0.0.1" });

socket.setTimeout(500);

const onInUse = () => {
  socket.destroy();
  console.error(
    `\nPort ${PORT} is already in use — a dev server is likely already running.\n` +
      `Reuse it instead of starting a new one, or stop it first.\n` +
      `(Windows: "netstat -ano | findstr :${PORT}" to find the owning PID, then ` +
      `"powershell -Command \\"Stop-Process -Id <pid> -Force\\"" to stop it.)\n`
  );
  process.exit(1);
};

socket.once("connect", onInUse);

socket.once("error", () => {
  // ECONNREFUSED (or similar) means nothing is listening — fine to proceed.
  process.exit(0);
});

socket.once("timeout", () => {
  // No response either way; don't block dev startup on an inconclusive probe.
  socket.destroy();
  process.exit(0);
});

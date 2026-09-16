import { execSync } from "node:child_process";
import { ScraplingBridge } from "../../src/scrapling/bridge.js";
import type { EphemeralBridgeBenchmark } from "./types.js";

export async function runBridgeLifecycleBenchmark(): Promise<EphemeralBridgeBenchmark> {
  const bridge = new ScraplingBridge();

  const spawnStart = performance.now();
  await bridge.ensureStarted();
  const spawnAndHandshakeMs = Math.round((performance.now() - spawnStart) * 100) / 100;

  const allocatedPort = bridge.getPort();
  const pid = (bridge as any).process?.pid ?? 0;

  // Make a fast test request to verify readiness
  await bridge.fetch({
    url: "https://example.com/",
    mode: "http",
    timeout_ms: 10000,
    follow_redirects: false,
  });

  const teardownStart = performance.now();
  await bridge.dispose();
  const teardownMs = Math.round((performance.now() - teardownStart) * 100) / 100;

  // Verify process does not exist
  let verifiedZeroLeakedProcesses = true;
  if (pid > 0) {
    try {
      execSync(`kill -0 ${pid} 2>/dev/null`);
      // If kill -0 succeeds, process is still alive!
      verifiedZeroLeakedProcesses = false;
    } catch {
      // kill -0 threw error, process cleanly terminated
      verifiedZeroLeakedProcesses = true;
    }
  }

  return {
    spawnAndHandshakeMs,
    allocatedPort,
    pid,
    teardownMs,
    verifiedZeroLeakedProcesses,
  };
}

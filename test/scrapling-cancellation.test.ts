import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { WebError } from "@deepseek-ai/dsh-web";
import { ScraplingBridge } from "../src/scrapling/bridge.js";
import { ScraplingFetchProvider } from "../src/scrapling/provider.js";

describe("Scrapling Cancellation & Lifecycle Tests", () => {
  let bridge: ScraplingBridge;

  after(async () => {
    if (bridge) {
      await bridge.dispose();
    }
  });

  it("handles pre-aborted signal immediately with WEB_ABORTED", async () => {
    const provider = new ScraplingFetchProvider();
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted test"));

    await assert.rejects(
      async () => {
        await provider.fetch({ url: "https://example.com" }, controller.signal);
      },
      (err: any) => {
        assert.ok(err instanceof WebError);
        assert.equal(err.code, "WEB_ABORTED");
        return true;
      }
    );
  });

  it("spawns sidecar on ephemeral port, gets PID, and handles cancellation during fetch", async () => {
    bridge = new ScraplingBridge();
    const port = await bridge.ensureStarted();
    assert.ok(port > 0, `Port should be allocated: ${port}`);
    assert.ok(bridge.isAlive(), "Bridge should be alive");
    const pid = bridge.getPid();
    assert.ok(pid && pid > 0, `PID should be valid: ${pid}`);

    const provider = new ScraplingFetchProvider({}, bridge);

    const controller = new AbortController();
    // Abort after 50ms
    setTimeout(() => {
      controller.abort(new Error("User cancelled"));
    }, 50);

    await assert.rejects(
      async () => {
        await provider.fetch({ url: "https://example.com" }, controller.signal);
      },
      (err: any) => {
        assert.ok(err instanceof WebError);
        assert.equal(err.code, "WEB_ABORTED");
        return true;
      }
    );

    // Bridge remains alive and healthy for subsequent requests
    assert.ok(bridge.isAlive(), "Bridge should still be alive for reuse");
  });

  it("disposes bridge cleanly leaving zero leaked child processes", async () => {
    const testBridge = new ScraplingBridge();
    await testBridge.ensureStarted();
    const pid = testBridge.getPid();
    assert.ok(pid && pid > 0, "PID must exist");

    // Verify process is running in OS
    const checkRunning = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    assert.equal(checkRunning(), true, "Process should be running before disposal");

    await testBridge.dispose();

    // Allow process exit to settle
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(checkRunning(), false, "Process should be terminated after disposal");
    assert.equal(testBridge.isAlive(), false, "Bridge isAlive() should be false");
  });
});

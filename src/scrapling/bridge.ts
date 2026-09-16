import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { WebError } from "@deepseek-ai/dsh-web";
import type { SidecarFetchPayload, SidecarFetchResponse } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve path to python/scrapling_sidecar.py relative to package root
export const DEFAULT_SIDECAR_PATH = resolve(__dirname, "../../python/scrapling_sidecar.py");

export const DEFAULT_PYTHON_VENV = "/Users/kuba/Documents/Github/Scrapling/.venv311/bin/python3";

export interface BridgeOptions {
  readonly pythonBinary?: string;
  readonly sidecarPath?: string;
  readonly startupTimeoutMs?: number;
}

export class ScraplingBridge {
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private pid: number | null = null;
  private startPromise: Promise<number> | null = null;
  private readonly options: BridgeOptions;
  private exitHandler: (() => void) | null = null;

  constructor(options?: BridgeOptions) {
    this.options = options ?? {};
  }

  /**
   * Determine the best Python executable to use.
   */
  resolvePythonBinary(): string {
    if (this.options.pythonBinary && this.options.pythonBinary.trim().length > 0) {
      return this.options.pythonBinary;
    }
    if (process.env.SCRAPLING_PYTHON && process.env.SCRAPLING_PYTHON.trim().length > 0) {
      return process.env.SCRAPLING_PYTHON;
    }
    if (existsSync(DEFAULT_PYTHON_VENV)) {
      return DEFAULT_PYTHON_VENV;
    }
    return "python3";
  }

  /**
   * Resolve the path to the sidecar Python script.
   */
  resolveSidecarPath(): string {
    if (this.options.sidecarPath && existsSync(this.options.sidecarPath)) {
      return this.options.sidecarPath;
    }
    if (existsSync(DEFAULT_SIDECAR_PATH)) {
      return DEFAULT_SIDECAR_PATH;
    }
    throw new WebError(
      `Scrapling sidecar script not found at ${DEFAULT_SIDECAR_PATH}`,
      "WEB_PROVIDER_ERROR"
    );
  }

  /**
   * Returns whether the sidecar process is currently running and ready.
   */
  isAlive(): boolean {
    return this.child !== null && this.port !== null && !this.child.killed && this.child.exitCode === null;
  }

  /**
   * Get the allocated ephemeral port.
   */
  getPort(): number | null {
    return this.port;
  }

  /**
   * Get the child process PID.
   */
  getPid(): number | null {
    return this.pid;
  }

  /**
   * Start the Scrapling micro-sidecar and await the readiness handshake.
   */
  async ensureStarted(): Promise<number> {
    if (this.isAlive() && this.port !== null) {
      return this.port;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startProcess();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startProcess(): Promise<number> {
    const pythonBin = this.resolvePythonBinary();
    const sidecarPath = this.resolveSidecarPath();
    const timeoutMs = this.options.startupTimeoutMs ?? 10000;

    return new Promise<number>((res, rej) => {
      let resolved = false;
      let stderrBuffer = "";

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.killChild();
          rej(
            new WebError(
              `Scrapling sidecar timed out after ${timeoutMs}ms during startup. Stderr: ${stderrBuffer}`,
              "WEB_PROVIDER_ERROR"
            )
          );
        }
      }, timeoutMs);

      try {
        const child = spawn(pythonBin, [sidecarPath], {
          stdio: ["ignore", "pipe", "pipe"],
          detached: process.platform !== "win32",
        });

        this.child = child;
        this.pid = child.pid ?? null;

        let stdoutBuffer = "";

        child.stdout?.on("data", (chunk: Buffer) => {
          stdoutBuffer += chunk.toString("utf-8");
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
              try {
                const parsed = JSON.parse(trimmed);
                if (parsed.status === "ready" && typeof parsed.port === "number") {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    this.port = parsed.port;
                    this.pid = parsed.pid ?? child.pid ?? null;
                    res(parsed.port);
                    return;
                  }
                }
              } catch {
                // Ignore non-JSON or partial output
              }
            }
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          stderrBuffer += chunk.toString("utf-8");
        });

        child.on("error", (err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            this.killChild();
            rej(
              new WebError(
                `Failed to spawn Scrapling sidecar with '${pythonBin}': ${err.message}`,
                "WEB_PROVIDER_ERROR",
                { cause: err }
              )
            );
          }
        });

        child.on("exit", (code, signal) => {
          this.port = null;
          this.child = null;
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            rej(
              new WebError(
                `Scrapling sidecar exited prematurely with code ${code}, signal ${signal}. Stderr: ${stderrBuffer}`,
                "WEB_PROVIDER_ERROR"
              )
            );
          }
        });

        // Register process exit hook to prevent orphan processes
        this.exitHandler = () => {
          this.disposeSync();
        };
        process.once("exit", this.exitHandler);
      } catch (spawnErr) {
        clearTimeout(timer);
        rej(
          new WebError(
            `Exception while spawning Scrapling sidecar: ${String(spawnErr)}`,
            "WEB_PROVIDER_ERROR",
            { cause: spawnErr }
          )
        );
      }
    });
  }

  /**
   * Execute an HTTP fetch request against the sidecar IPC endpoint.
   */
  async fetch(payload: SidecarFetchPayload, signal?: AbortSignal): Promise<SidecarFetchResponse> {
    const port = await this.ensureStarted();

    if (signal?.aborted) {
      throw new WebError("web fetch aborted", "WEB_ABORTED", { cause: signal.reason });
    }

    const endpoint = `http://127.0.0.1:${port}/fetch`;

    try {
      const response = await globalThis.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        throw new WebError(
          `Scrapling sidecar returned HTTP ${response.status} ${response.statusText}`,
          "WEB_PROVIDER_ERROR"
        );
      }

      const data = (await response.json()) as SidecarFetchResponse;
      return data;
    } catch (err: any) {
      if (err instanceof WebError) {
        throw err;
      }
      if (signal?.aborted) {
        throw new WebError("web fetch aborted", "WEB_ABORTED", { cause: signal.reason });
      }
      throw new WebError(`Scrapling IPC fetch failed: ${err.message}`, "WEB_PROVIDER_ERROR", {
        cause: err,
      });
    }
  }

  /**
   * Cleanly terminate child process and release resources.
   */
  async dispose(): Promise<void> {
    if (this.exitHandler) {
      process.removeListener("exit", this.exitHandler);
      this.exitHandler = null;
    }

    if (this.port !== null) {
      try {
        await globalThis.fetch(`http://127.0.0.1:${this.port}/shutdown`, {
          method: "POST",
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        // Shutdown request is best-effort
      }
    }

    this.killChild();
  }

  /**
   * Synchronous kill used on Node process exit.
   */
  private disposeSync(): void {
    this.killChild();
  }

  private killChild(): void {
    const child = this.child;
    const pid = this.pid;
    this.child = null;
    this.port = null;
    this.pid = null;

    if (!child) return;

    try {
      if (pid && process.platform !== "win32") {
        // Send SIGTERM to process group
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }

        setTimeout(() => {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // Process already exited
          }
        }, 1500).unref();
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

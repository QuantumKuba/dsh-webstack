import { ScraplingFetchProvider } from "../../src/scrapling/provider.js";
import { WebError } from "@deepseek-ai/dsh-web";
import type { SecurityBenchmarkResult } from "./types.js";

interface SecurityTargetSpec {
  target: string;
  category: "loopback" | "rfc1918-private" | "cloud-metadata" | "cgnat" | "cross-origin-redirect" | "public-safe";
  shouldBlock: boolean;
  expectedCode?: string;
}

const SECURITY_BENCHMARK_TARGETS: readonly SecurityTargetSpec[] = [
  {
    target: "http://127.0.0.1:8000/v1/models",
    category: "loopback",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://localhost:8080/search",
    category: "loopback",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://10.0.0.1/admin",
    category: "rfc1918-private",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://192.168.1.1/router",
    category: "rfc1918-private",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://172.16.0.1/internal",
    category: "rfc1918-private",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://169.254.169.254/latest/meta-data/",
    category: "cloud-metadata",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "http://100.64.0.1/cgnat-test",
    category: "cgnat",
    shouldBlock: true,
    expectedCode: "WEB_BLOCKED_URL",
  },
  {
    target: "https://example.com/",
    category: "public-safe",
    shouldBlock: false,
  },
];

export async function runSecurityBenchmarks(
  provider: ScraplingFetchProvider
): Promise<SecurityBenchmarkResult[]> {
  const results: SecurityBenchmarkResult[] = [];

  for (const spec of SECURITY_BENCHMARK_TARGETS) {
    const start = performance.now();
    let blockedAsExpected = false;
    let returnedCode: string | undefined;

    try {
      await provider.fetch({ url: spec.target });
      const elapsed = Math.round((performance.now() - start) * 100) / 100;

      if (!spec.shouldBlock) {
        blockedAsExpected = true;
      } else {
        blockedAsExpected = false;
      }

      results.push({
        target: spec.target,
        category: spec.category,
        durationMs: elapsed,
        blockedAsExpected,
      });
    } catch (err: any) {
      const elapsed = Math.round((performance.now() - start) * 100) / 100;
      if (err instanceof WebError) {
        returnedCode = err.code;
        if (spec.shouldBlock && err.code === spec.expectedCode) {
          blockedAsExpected = true;
        }
      }

      results.push({
        target: spec.target,
        category: spec.category,
        durationMs: elapsed,
        blockedAsExpected,
        returnedCode,
      });
    }
  }

  return results;
}

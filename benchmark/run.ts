import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import os from "node:os";
import { SearxngSearchProvider } from "../src/searxng/provider.js";
import { ScraplingFetchProvider } from "../src/scrapling/provider.js";
import { runSearchBenchmarks } from "./engine/search-benchmarks.js";
import { runFetchBenchmarks } from "./engine/fetch-benchmarks.js";
import { runSecurityBenchmarks } from "./engine/security-benchmarks.js";
import { runBridgeLifecycleBenchmark } from "./engine/bridge-benchmarks.js";
import { generateMarkdownReport } from "./reporters/markdown-reporter.js";
import type { BenchmarkReportData } from "./engine/types.js";

async function main() {
  console.log("===============================================================");
  console.log("  DEEPSEEK HARNESS ADVANCED WEB SEARCH & FETCH BENCHMARK SUITE");
  console.log("===============================================================\n");

  const searxngProvider = new SearxngSearchProvider({
    baseURL: process.env.SEARXNG_URL ?? "http://127.0.0.1:8080",
    timeoutMs: 15000,
  });

  const scraplingProvider = new ScraplingFetchProvider({
    pythonBinary:
      process.env.SCRAPLING_PYTHON ??
      "/Users/kuba/Documents/Github/Scrapling/.venv311/bin/python3",
    timeoutMs: 30000,
    enableDynamicFallback: false,
  });

  console.log("[1/5] Running SearXNG Search Benchmarks (10 queries)...");
  const searchResults = await runSearchBenchmarks(searxngProvider);
  console.log(
    `      Done. Mean Latency: ${searchResults.stats.mean}ms (P95: ${searchResults.stats.p95}ms, Success: ${searchResults.results.filter((r) => r.success).length}/10)\n`
  );

  console.log("[2/5] Running Scrapling Fetch Benchmarks (Static, Dynamic, Docs)...");
  const fetchResults = await runFetchBenchmarks(scraplingProvider);
  console.log(
    `      Done. Mean HTTP Latency: ${fetchResults.httpStats.mean}ms (P95: ${fetchResults.httpStats.p95}ms)`
  );
  if (fetchResults.dynamicStats) {
    console.log(
      `            Mean Dynamic Latency: ${fetchResults.dynamicStats.mean}ms`
    );
  }
  if (fetchResults.stealthStats) {
    console.log(
      `            Mean Stealth Bypass Latency: ${fetchResults.stealthStats.mean}ms`
    );
  }
  console.log(
    `            Context Reduction: ${fetchResults.overallReductionPercent}% (Gain Factor: ${fetchResults.contextCapacityGainFactor}x)\n`
  );

  console.log("[3/5] Running Security & SSRF Defense Benchmarks (8 targets)...");
  const securityResults = await runSecurityBenchmarks(scraplingProvider);
  const allBlocked = securityResults
    .filter((s) => s.category !== "public-safe")
    .every((s) => s.blockedAsExpected);
  console.log(
    `      Done. All SSRF Vectors Blocked: ${allBlocked ? "YES (100% Secure)" : "NO"}\n`
  );

  console.log("[4/5] Running Ephemeral Bridge Lifecycle Benchmark...");
  const bridgeBenchmark = await runBridgeLifecycleBenchmark();
  console.log(
    `      Done. Spawn & Handshake: ${bridgeBenchmark.spawnAndHandshakeMs}ms, Teardown: ${bridgeBenchmark.teardownMs}ms, Zero Leaks: ${bridgeBenchmark.verifiedZeroLeakedProcesses}\n`
  );

  // Clean up main fetch provider bridge
  await scraplingProvider.dispose();

  console.log("[5/5] Compiling Benchmark Report...");
  const reportData: BenchmarkReportData = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      searxngEndpoint: "http://127.0.0.1:8080",
      scraplingVersion: "0.4.7",
      modelName: "Qwen3.8-27B-MLX-8bit",
      modelEndpoint: "http://127.0.0.1:8000/v1",
    },
    searchBenchmarks: searchResults.results,
    searchStats: searchResults.stats,
    fetchBenchmarks: fetchResults.results,
    fetchHttpStats: fetchResults.httpStats,
    fetchDynamicStats: fetchResults.dynamicStats,
    fetchStealthStats: fetchResults.stealthStats,
    securityBenchmarks: securityResults,
    bridgeLifecycle: bridgeBenchmark,
    contextSavings: {
      meanRawTokens: fetchResults.meanRawTokens,
      meanMarkdownTokens: fetchResults.meanMarkdownTokens,
      overallReductionPercent: fetchResults.overallReductionPercent,
      contextCapacityGainFactor: fetchResults.contextCapacityGainFactor,
    },
  };

  const markdownReport = generateMarkdownReport(reportData);
  const reportPath = resolve("benchmark", "BENCHMARK_REPORT.md");
  writeFileSync(reportPath, markdownReport, "utf-8");

  console.log(`\n===============================================================`);
  console.log(`  BENCHMARK COMPLETE!`);
  console.log(`  Report saved to: ${reportPath}`);
  console.log(`===============================================================\n`);
}

main().catch((err) => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});

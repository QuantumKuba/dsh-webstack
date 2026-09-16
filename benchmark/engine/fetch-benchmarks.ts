import TurndownService from "turndown";
import { ScraplingFetchProvider } from "../../src/scrapling/provider.js";
import { calculateLatencyStats, estimateTokenCount } from "./statistics.js";
import type { FetchBenchmarkResult, LatencyStats } from "./types.js";

interface BenchmarkFetchSpec {
  url: string;
  label: string;
  category: "static-minimal" | "semantic-article" | "dense-tables" | "encyclopedia-heavy" | "redirect-hop";
  mode: "http" | "dynamic";
}

const BENCHMARK_TARGETS: readonly BenchmarkFetchSpec[] = [
  {
    url: "https://example.com/",
    label: "Example Domain (Baseline)",
    category: "static-minimal",
    mode: "http",
  },
  {
    url: "https://httpbin.org/html",
    label: "HttpBin Herman Melville Article",
    category: "semantic-article",
    mode: "http",
  },
  {
    url: "https://news.ycombinator.com/",
    label: "Hacker News Frontpage",
    category: "dense-tables",
    mode: "http",
  },
  {
    url: "https://docs.python.org/3/library/asyncio.html",
    label: "Python Asyncio Docs",
    category: "dense-tables",
    mode: "http",
  },
  {
    url: "https://en.wikipedia.org/wiki/DeepSeek",
    label: "Wikipedia: DeepSeek Article",
    category: "encyclopedia-heavy",
    mode: "http",
  },
  {
    url: "https://example.com/",
    label: "Example Domain (Dynamic Chrome Engine)",
    category: "static-minimal",
    mode: "dynamic",
  },
  {
    url: "https://example.com/",
    label: "Example Domain (Tier 3 Stealth Engine + Advanced Bypass)",
    category: "static-minimal",
    mode: "stealth",
  },
];

export async function runFetchBenchmarks(
  provider: ScraplingFetchProvider
): Promise<{
  results: FetchBenchmarkResult[];
  httpStats: LatencyStats;
  dynamicStats?: LatencyStats;
  stealthStats?: LatencyStats;
  meanRawTokens: number;
  meanMarkdownTokens: number;
  overallReductionPercent: number;
  contextCapacityGainFactor: number;
}> {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
  });

  // Strip scripts and styles like dsh-tool-web does
  turndown.remove(["script", "style", "noscript", "svg"]);

  const results: FetchBenchmarkResult[] = [];
  const httpLatencies: number[] = [];
  const dynamicLatencies: number[] = [];
  const stealthLatencies: number[] = [];

  let totalRawTokens = 0;
  let totalMarkdownTokens = 0;

  for (const target of BENCHMARK_TARGETS) {
    const start = performance.now();
    try {
      let rawHtml = "";
      let statusCode = 200;

      if (target.mode === "dynamic") {
        // Test dynamic mode directly via bridge
        const res = await provider.bridge.fetch({
          url: target.url,
          mode: "dynamic",
          timeout_ms: 30000,
          network_idle: true,
          disable_resources: false,
        });

        if ("error" in res) {
          throw new Error(res.error);
        }
        rawHtml = res.html ?? "";
        statusCode = res.statusCode;
      } else if (target.mode === "stealth") {
        // Test stealth mode directly via bridge with advanced bypass features
        const res = await provider.bridge.fetch({
          url: target.url,
          mode: "stealth",
          timeout_ms: 60000,
          network_idle: true,
          solve_cloudflare: true,
          hide_canvas: true,
          block_webrtc: true,
          allow_webgl: true,
          google_search: true,
          block_ads: true,
          real_chrome: true,
        });

        if ("error" in res) {
          throw new Error(res.error);
        }
        rawHtml = res.html ?? "";
        statusCode = res.statusCode;
      } else {
        const fetchRes = await provider.fetch({ url: target.url });
        statusCode = fetchRes.statusCode;
        rawHtml = fetchRes.body.content;
      }

      const elapsed = Math.round(performance.now() - start);

      if (target.mode === "dynamic") {
        dynamicLatencies.push(elapsed);
      } else if (target.mode === "stealth") {
        stealthLatencies.push(elapsed);
      } else {
        httpLatencies.push(elapsed);
      }

      const rawHtmlBytes = Buffer.byteLength(rawHtml, "utf-8");
      let markdown = "";
      try {
        markdown = turndown.turndown(rawHtml);
      } catch {
        markdown = rawHtml;
      }
      const markdownBytes = Buffer.byteLength(markdown, "utf-8");

      const estimatedTokensRaw = estimateTokenCount(rawHtml);
      const estimatedTokensMarkdown = estimateTokenCount(markdown);

      totalRawTokens += estimatedTokensRaw;
      totalMarkdownTokens += estimatedTokensMarkdown;

      const tokenSavingsPercent =
        estimatedTokensRaw > 0
          ? Math.round(
              ((estimatedTokensRaw - estimatedTokensMarkdown) /
                estimatedTokensRaw) *
                1000
            ) / 10
          : 0;

      results.push({
        url: target.url,
        label: target.label,
        category: target.category,
        mode: target.mode,
        durationMs: elapsed,
        statusCode,
        rawHtmlBytes,
        markdownBytes,
        estimatedTokensRaw,
        estimatedTokensMarkdown,
        tokenSavingsPercent,
        success: statusCode >= 200 && statusCode < 400,
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      if (target.mode === "dynamic") {
        dynamicLatencies.push(elapsed);
      } else if (target.mode === "stealth") {
        stealthLatencies.push(elapsed);
      } else {
        httpLatencies.push(elapsed);
      }

      results.push({
        url: target.url,
        label: target.label,
        category: target.category,
        mode: target.mode,
        durationMs: elapsed,
        statusCode: 500,
        rawHtmlBytes: 0,
        markdownBytes: 0,
        estimatedTokensRaw: 0,
        estimatedTokensMarkdown: 0,
        tokenSavingsPercent: 0,
        success: false,
      });
    }
  }

  const httpStats = calculateLatencyStats(httpLatencies);
  const dynamicStats =
    dynamicLatencies.length > 0
      ? calculateLatencyStats(dynamicLatencies)
      : undefined;
  const stealthStats =
    stealthLatencies.length > 0
      ? calculateLatencyStats(stealthLatencies)
      : undefined;

  const validRuns = results.filter((r) => r.success && r.estimatedTokensRaw > 0);
  const meanRawTokens =
    validRuns.length > 0 ? Math.round(totalRawTokens / validRuns.length) : 0;
  const meanMarkdownTokens =
    validRuns.length > 0
      ? Math.round(totalMarkdownTokens / validRuns.length)
      : 0;
  const overallReductionPercent =
    totalRawTokens > 0
      ? Math.round(
          ((totalRawTokens - totalMarkdownTokens) / totalRawTokens) * 1000
        ) / 10
      : 0;
  const contextCapacityGainFactor =
    totalMarkdownTokens > 0
      ? Math.round((totalRawTokens / totalMarkdownTokens) * 100) / 100
      : 1;

  return {
    results,
    httpStats,
    dynamicStats,
    stealthStats,
    meanRawTokens,
    meanMarkdownTokens,
    overallReductionPercent,
    contextCapacityGainFactor,
  };
}

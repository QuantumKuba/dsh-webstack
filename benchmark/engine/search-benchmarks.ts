import { SearxngSearchProvider } from "../../src/searxng/provider.js";
import { calculateLatencyStats } from "./statistics.js";
import type { SearchBenchmarkResult, LatencyStats } from "./types.js";

interface BenchmarkQuerySpec {
  query: string;
  category: "technical-api" | "error-debugging" | "general-discovery" | "unicode-punctuation";
}

const BENCHMARK_QUERIES: readonly BenchmarkQuerySpec[] = [
  {
    query: "deepseek v3 api tool calling documentation",
    category: "technical-api",
  },
  {
    query: "python asyncio event loop get_running_loop",
    category: "technical-api",
  },
  {
    query: "react useSyncExternalStore typescript definition",
    category: "technical-api",
  },
  {
    query: "scrapling python web scraper documentation",
    category: "technical-api",
  },
  {
    query: "TypeError: Cannot read properties of undefined reading map",
    category: "error-debugging",
  },
  {
    query: "RuntimeError: Event loop is closed asyncio python macos",
    category: "error-debugging",
  },
  {
    query: "apple silicon mlx llm inference framework",
    category: "general-discovery",
  },
  {
    query: "searxng metasearch engine architecture json api",
    category: "general-discovery",
  },
  {
    query: "C++ std::variant vs std::any performance",
    category: "unicode-punctuation",
  },
  {
    query: "npm install @deepseek-ai/dsh-web package.json",
    category: "unicode-punctuation",
  },
];

export async function runSearchBenchmarks(
  provider: SearxngSearchProvider
): Promise<{
  results: SearchBenchmarkResult[];
  stats: LatencyStats;
}> {
  const results: SearchBenchmarkResult[] = [];
  const latencies: number[] = [];

  for (const spec of BENCHMARK_QUERIES) {
    const start = performance.now();
    let success = false;
    let sourcesCount = 0;
    let topTitle: string | undefined;
    let topSnippetLength = 0;

    try {
      const res = await provider.search({ query: spec.query });
      const elapsed = Math.round(performance.now() - start);
      latencies.push(elapsed);
      success = true;
      sourcesCount = res.sources.length;

      if (res.sources.length > 0) {
        topTitle = res.sources[0].title;
        topSnippetLength = res.sources[0].snippet?.length ?? 0;
      }

      results.push({
        query: spec.query,
        category: spec.category,
        durationMs: elapsed,
        sourcesCount,
        topTitle,
        topSnippetLength,
        hasEngineWarnings: false,
        success,
      });
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      latencies.push(elapsed);
      results.push({
        query: spec.query,
        category: spec.category,
        durationMs: elapsed,
        sourcesCount: 0,
        topSnippetLength: 0,
        hasEngineWarnings: true,
        success: false,
      });
    }
  }

  const stats = calculateLatencyStats(latencies);
  return { results, stats };
}

export interface LatencyStats {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly p95: number;
  readonly stdDev: number;
}

export interface SearchBenchmarkResult {
  readonly query: string;
  readonly category: "technical-api" | "error-debugging" | "general-discovery" | "unicode-punctuation";
  readonly durationMs: number;
  readonly sourcesCount: number;
  readonly topTitle?: string;
  readonly topSnippetLength: number;
  readonly hasEngineWarnings: boolean;
  readonly success: boolean;
}

export interface FetchBenchmarkResult {
  readonly url: string;
  readonly label: string;
  readonly category: "static-minimal" | "semantic-article" | "dense-tables" | "encyclopedia-heavy" | "redirect-hop";
  readonly mode: "http" | "dynamic" | "stealth";
  readonly durationMs: number;
  readonly statusCode: number;
  readonly rawHtmlBytes: number;
  readonly markdownBytes: number;
  readonly estimatedTokensRaw: number;
  readonly estimatedTokensMarkdown: number;
  readonly tokenSavingsPercent: number;
  readonly success: boolean;
}

export interface SecurityBenchmarkResult {
  readonly target: string;
  readonly category: "loopback" | "rfc1918-private" | "cloud-metadata" | "cgnat" | "cross-origin-redirect" | "public-safe";
  readonly durationMs: number;
  readonly blockedAsExpected: boolean;
  readonly returnedCode?: string;
}

export interface EphemeralBridgeBenchmark {
  readonly spawnAndHandshakeMs: number;
  readonly allocatedPort: number;
  readonly pid: number;
  readonly teardownMs: number;
  readonly verifiedZeroLeakedProcesses: boolean;
}

export interface BenchmarkReportData {
  readonly timestamp: string;
  readonly environment: {
    readonly nodeVersion: string;
    readonly os: string;
    readonly searxngEndpoint: string;
    readonly scraplingVersion: string;
    readonly modelName: string;
    readonly modelEndpoint: string;
  };
  readonly searchBenchmarks: readonly SearchBenchmarkResult[];
  readonly searchStats: LatencyStats;
  readonly fetchBenchmarks: readonly FetchBenchmarkResult[];
  readonly fetchHttpStats: LatencyStats;
  readonly fetchDynamicStats?: LatencyStats;
  readonly fetchStealthStats?: LatencyStats;
  readonly securityBenchmarks: readonly SecurityBenchmarkResult[];
  readonly bridgeLifecycle: EphemeralBridgeBenchmark;
  readonly contextSavings: {
    readonly meanRawTokens: number;
    readonly meanMarkdownTokens: number;
    readonly overallReductionPercent: number;
    readonly contextCapacityGainFactor: number;
  };
}

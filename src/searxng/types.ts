import z from "@deepseek-ai/schemastery";

export interface SearxngSearchConfig {
  /** Base URL of the SearXNG instance. Defaults to http://127.0.0.1:8080 or SEARXNG_URL env var. */
  readonly baseURL?: string;
  /** Request timeout in milliseconds. Defaults to 15,000 ms. */
  readonly timeoutMs?: number;
}

export const SearxngConfig: z<SearxngSearchConfig> = z.object({
  baseURL: z.string().default("http://127.0.0.1:8080").description("Base URL of the SearXNG instance"),
  timeoutMs: z.number().step(1).min(100).default(15000).description("Search request timeout in milliseconds"),
});

export interface SearxngRawResult {
  readonly url: string;
  readonly title?: string;
  readonly content?: string;
  readonly publishedDate?: string | null;
  readonly engine?: string;
  readonly engines?: readonly string[];
  readonly score?: number;
}

export interface SearxngRawResponse {
  readonly query?: string;
  readonly results?: readonly SearxngRawResult[];
  readonly unresponsive_engines?: readonly (readonly [string, string])[];
  readonly answers?: readonly unknown[];
  readonly suggestions?: readonly string[];
}

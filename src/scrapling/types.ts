import z from "@deepseek-ai/schemastery";

export interface ScraplingFetchConfig {
  /** Path to Python binary. Defaults to SCRAPLING_PYTHON env var or virtualenv python. */
  readonly pythonBinary?: string;
  /** Request timeout in milliseconds. Defaults to 30,000 ms. */
  readonly timeoutMs?: number;
  /** Maximum number of same-origin redirects to follow. Defaults to 5. */
  readonly maxRedirects?: number;
  /** Maximum response body bytes before truncation. Defaults to 5,000,000 bytes. */
  readonly maxResponseBytes?: number;
  /**
   * Enable dynamic browser fallback (Playwright Chrome) for SPA shells / JS requirements.
   * NOTE: Browser fallback remains opt-in until egress connection-pinning SSRF protection is verified.
   * Defaults to false.
   */
  readonly enableDynamicFallback?: boolean;
  /**
   * Enable stealth browser fallback for heavy anti-bot / Cloudflare challenges.
   * Defaults to false.
   */
  readonly enableStealthFallback?: boolean;
}

export const ScraplingConfig: z<ScraplingFetchConfig> = z.object({
  pythonBinary: z.string().description("Path to python executable with Scrapling installed"),
  timeoutMs: z.number().step(1).min(1000).default(30000).description("Fetch timeout in milliseconds"),
  maxRedirects: z.number().step(1).min(0).max(20).default(5).description("Max same-origin redirects to follow"),
  maxResponseBytes: z.number().step(1).min(1024).default(5000000).description("Max response body size in bytes"),
  enableDynamicFallback: z.boolean().default(false).description("Enable dynamic browser fallback for JS SPAs"),
  enableStealthFallback: z.boolean().default(false).description("Enable stealth browser fallback for WAF challenges"),
});

export interface SidecarFetchPayload {
  readonly url: string;
  readonly mode: "http" | "dynamic" | "stealth";
  readonly timeout_ms: number;
  readonly follow_redirects: boolean;
  readonly max_response_bytes?: number;
  readonly network_idle?: boolean;
  readonly disable_resources?: boolean;
}

export interface SidecarFetchSuccess {
  readonly statusCode: number;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly html?: string;
  readonly text?: string;
  readonly encoding?: string;
}

export interface SidecarFetchError {
  readonly error: string;
  readonly error_type?: string;
  readonly is_timeout?: boolean;
}

export type SidecarFetchResponse = SidecarFetchSuccess | SidecarFetchError;

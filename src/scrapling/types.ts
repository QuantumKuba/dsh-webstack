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
  /**
   * Automatically solve Cloudflare Turnstile / Interstitial challenges when in stealth mode.
   * Defaults to true.
   */
  readonly stealthSolveCloudflare?: boolean;
  /**
   * Inject random noise into canvas image data to prevent canvas fingerprinting.
   * Defaults to true.
   */
  readonly stealthHideCanvas?: boolean;
  /**
   * Force WebRTC to respect proxy settings and prevent local IP address leaks.
   * Defaults to true.
   */
  readonly stealthBlockWebRtc?: boolean;
  /**
   * Allow WebGL / WebGL 2.0 (disabling WebGL triggers WAF anti-bot flags).
   * Defaults to true.
   */
  readonly stealthAllowWebGl?: boolean;
  /**
   * Spoof Google search referrer (https://www.google.com/) for search camouflage.
   * Defaults to true.
   */
  readonly stealthGoogleSearch?: boolean;
  /**
   * Block ~3,500 known ad and tracking domains to eliminate anti-bot telemetry scripts.
   * Defaults to true.
   */
  readonly stealthBlockAds?: boolean;
  /**
   * Launch system installed Chrome for authentic browser fingerprints.
   * Defaults to true.
   */
  readonly stealthRealChrome?: boolean;
  /**
   * Timeout in milliseconds specifically for stealth challenge solving.
   * Defaults to 60,000 ms as recommended by Scrapling documentation.
   */
  readonly stealthTimeoutMs?: number;
}

export const ScraplingConfig: z<ScraplingFetchConfig> = z.object({
  pythonBinary: z.string().description("Path to python executable with Scrapling installed"),
  timeoutMs: z.number().step(1).min(1000).default(30000).description("Fetch timeout in milliseconds"),
  maxRedirects: z.number().step(1).min(0).max(20).default(5).description("Max same-origin redirects to follow"),
  maxResponseBytes: z.number().step(1).min(1024).default(5000000).description("Max response body size in bytes"),
  enableDynamicFallback: z.boolean().default(false).description("Enable dynamic browser fallback for JS SPAs"),
  enableStealthFallback: z.boolean().default(false).description("Enable stealth browser fallback for WAF challenges"),
  stealthSolveCloudflare: z.boolean().default(true).description("Auto-solve Cloudflare Turnstile/Interstitial in stealth mode"),
  stealthHideCanvas: z.boolean().default(true).description("Inject canvas noise to defeat fingerprinting"),
  stealthBlockWebRtc: z.boolean().default(true).description("Block WebRTC local IP leak"),
  stealthAllowWebGl: z.boolean().default(true).description("Allow WebGL to avoid anti-bot flags"),
  stealthGoogleSearch: z.boolean().default(true).description("Spoof Google search referer"),
  stealthBlockAds: z.boolean().default(true).description("Block ~3500 ad/tracker domains"),
  stealthRealChrome: z.boolean().default(true).description("Use real Chrome for authentic browser fingerprint"),
  stealthTimeoutMs: z.number().step(1).min(10000).default(60000).description("Timeout in ms for stealth challenge solving"),
});

export interface SidecarFetchPayload {
  readonly url: string;
  readonly mode: "http" | "dynamic" | "stealth";
  readonly timeout_ms: number;
  readonly follow_redirects: boolean;
  readonly max_response_bytes?: number;
  readonly network_idle?: boolean;
  readonly disable_resources?: boolean;
  readonly solve_cloudflare?: boolean;
  readonly hide_canvas?: boolean;
  readonly block_webrtc?: boolean;
  readonly allow_webgl?: boolean;
  readonly google_search?: boolean;
  readonly block_ads?: boolean;
  readonly real_chrome?: boolean;
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

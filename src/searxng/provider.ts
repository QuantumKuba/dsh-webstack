import { WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource } from "@deepseek-ai/dsh-web";
import type { SearxngRawResponse, SearxngSearchConfig } from "./types.js";

export const SEARXNG_PROVIDER_ID = "searxng";
export const DEFAULT_SEARXNG_BASE_URL = "http://127.0.0.1:8080";
export const DEFAULT_SEARXNG_TIMEOUT_MS = 15000;

export class SearxngSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID;
  private readonly configProvider: () => SearxngSearchConfig;

  constructor(config?: SearxngSearchConfig | (() => SearxngSearchConfig)) {
    if (typeof config === "function") {
      this.configProvider = config;
    } else {
      const staticConfig = config ?? {};
      this.configProvider = () => staticConfig;
    }
  }

  /**
   * Resolve the active base URL from config or environment variable.
   */
  resolveBaseURL(): string {
    const config = this.configProvider();
    return (
      config.baseURL ??
      process.env.SEARXNG_URL ??
      DEFAULT_SEARXNG_BASE_URL
    );
  }

  /**
   * Resolve the active timeout in milliseconds.
   */
  resolveTimeoutMs(): number {
    const config = this.configProvider();
    return config.timeoutMs ?? DEFAULT_SEARXNG_TIMEOUT_MS;
  }

  /**
   * Cheap local usability check.
   * Never makes network requests or health pings.
   */
  available(): boolean {
    const url = this.resolveBaseURL();
    return typeof url === "string" && URL.canParse(url);
  }

  /**
   * Run one search against SearXNG.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (signal?.aborted) {
      throw new WebError("SearXNG search aborted", "WEB_ABORTED", { cause: signal.reason });
    }

    const baseURL = this.resolveBaseURL();
    if (!URL.canParse(baseURL)) {
      throw new WebError(`Invalid SearXNG base URL: ${baseURL}`, "WEB_PROVIDER_ERROR");
    }

    const targetUrl = new URL("/search", baseURL);
    // Strict parameter integrity: set only documented query and format=json
    targetUrl.searchParams.set("q", request.query);
    targetUrl.searchParams.set("format", "json");

    const timeoutMs = this.resolveTimeoutMs();
    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort(new Error("SEARXNG_TIMEOUT"));
    }, timeoutMs);

    let combinedSignal: AbortSignal;
    if (signal) {
      combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
    } else {
      combinedSignal = timeoutController.signal;
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "deepseek-harness/0.0.1",
        },
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new WebError(
          `SearXNG returned HTTP ${response.status} ${response.statusText}`.trim(),
          "WEB_PROVIDER_ERROR"
        );
      }

      let data: SearxngRawResponse;
      try {
        data = (await response.json()) as SearxngRawResponse;
      } catch (jsonErr) {
        throw new WebError("SearXNG returned invalid JSON", "WEB_PROVIDER_ERROR", { cause: jsonErr });
      }

      const sources = this.mapResponse(data);

      // The ctx.web seam enforces request.maxResults and sets truncated: true.
      // The provider returns the ranked sources as produced by the search engine.
      return {
        sources,
        truncated: false,
      };
    } catch (error) {
      if (error instanceof WebError) {
        throw error;
      }

      if (signal?.aborted) {
        throw new WebError("SearXNG search aborted", "WEB_ABORTED", { cause: signal.reason });
      }

      if (timeoutController.signal.aborted) {
        throw new WebError(`SearXNG search timed out after ${timeoutMs}ms`, "WEB_PROVIDER_ERROR");
      }

      throw new WebError(`SearXNG search failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Map raw SearXNG JSON results to normalized WebSearchSource objects.
   * Filters out invalid URLs, trims text, deduplicates URLs, and preserves ranking.
   */
  private mapResponse(data: SearxngRawResponse): WebSearchSource[] {
    const rawResults = Array.isArray(data.results) ? data.results : [];
    const sources: WebSearchSource[] = [];
    const seenUrls = new Set<string>();

    for (const item of rawResults) {
      if (!item.url || typeof item.url !== "string") {
        continue;
      }

      const trimmedUrl = item.url.trim();
      if (trimmedUrl.length === 0 || !URL.canParse(trimmedUrl)) {
        continue;
      }

      if (seenUrls.has(trimmedUrl)) {
        continue;
      }
      seenUrls.add(trimmedUrl);

      const title = item.title && typeof item.title === "string" ? item.title.trim() : undefined;
      const snippet = item.content && typeof item.content === "string" ? item.content.trim() : undefined;
      const publishedAt =
        item.publishedDate && typeof item.publishedDate === "string" && item.publishedDate.trim().length > 0
          ? item.publishedDate.trim()
          : undefined;

      const source: WebSearchSource = {
        url: trimmedUrl,
        ...(title ? { title } : {}),
        ...(snippet ? { snippet } : {}),
        ...(publishedAt ? { publishedAt } : {}),
      };

      sources.push(source);
    }

    return sources;
  }
}

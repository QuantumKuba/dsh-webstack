import { existsSync } from "node:fs";
import {
  WebError,
  type WebFetchBody,
  type WebFetchProvider,
  type WebFetchRequest,
  type WebFetchResult,
} from "@deepseek-ai/dsh-web";
import { ScraplingBridge } from "./bridge.js";
import {
  validateFetchUrl,
  resolvePublicAddresses,
  isSameOrigin,
  resolveRedirect,
} from "./security.js";
import type {
  ScraplingFetchConfig,
  SidecarFetchPayload,
  SidecarFetchSuccess,
} from "./types.js";

export const SCRAPLING_PROVIDER_ID = "scrapling";
export const DEFAULT_FETCH_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_RESPONSE_BYTES = 5000000;

export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

export function classifyContentType(contentType?: string | null): "html" | "text" | undefined {
  const mime = (contentType ?? "").replace(/;.*$/s, "").trim().toLowerCase();
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime.startsWith("text/")) return "text";
  if (
    mime === "application/json" ||
    mime === "application/xml" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml")
  ) {
    return "text";
  }
  return undefined;
}

export class ScraplingFetchProvider implements WebFetchProvider {
  readonly id = SCRAPLING_PROVIDER_ID;
  private readonly configProvider: () => ScraplingFetchConfig;
  private bridgeInstance: ScraplingBridge | null = null;

  constructor(
    config?: ScraplingFetchConfig | (() => ScraplingFetchConfig),
    bridge?: ScraplingBridge
  ) {
    if (typeof config === "function") {
      this.configProvider = config;
    } else {
      const staticConfig = config ?? {};
      this.configProvider = () => staticConfig;
    }
    if (bridge) {
      this.bridgeInstance = bridge;
    }
  }

  get bridge(): ScraplingBridge {
    if (!this.bridgeInstance) {
      const config = this.configProvider();
      this.bridgeInstance = new ScraplingBridge({
        pythonBinary: config.pythonBinary,
      });
    }
    return this.bridgeInstance;
  }

  /**
   * Cheap local usability check.
   * Verifies Python executable or environment without spawning subprocesses or making network calls.
   */
  available(): boolean {
    const pythonBin = this.bridge.resolvePythonBinary();
    if (pythonBin.includes("/") || pythonBin.includes("\\")) {
      return existsSync(pythonBin);
    }
    // If just "python3", consider available
    return true;
  }

  /**
   * Fetch one URL with strict SSRF pre-flight validation, connection safety,
   * same-origin redirects, and clean HTML/text body extraction.
   */
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<WebFetchResult> {
    if (signal?.aborted) {
      throw new WebError("web fetch aborted", "WEB_ABORTED", { cause: signal.reason });
    }

    const config = this.configProvider();
    const timeoutMs = config.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const maxRedirects = config.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort(new Error("WEB_FETCH_TIMEOUT"));
    }, timeoutMs);

    let activeSignal: AbortSignal;
    if (signal) {
      activeSignal = AbortSignal.any([signal, timeoutController.signal]);
    } else {
      activeSignal = timeoutController.signal;
    }

    try {
      return await this.followAndFetch(request.url, activeSignal, {
        timeoutMs,
        maxRedirects,
        maxResponseBytes,
        enableDynamicFallback: config.enableDynamicFallback ?? false,
        enableStealthFallback: config.enableStealthFallback ?? false,
      });
    } catch (error: any) {
      if (error instanceof WebError) {
        throw error;
      }
      if (signal?.aborted) {
        throw new WebError("web fetch aborted", "WEB_ABORTED", { cause: signal.reason });
      }
      if (timeoutController.signal.aborted) {
        throw new WebError("web fetch timed out", "WEB_FETCH_TIMEOUT");
      }
      throw new WebError(`web fetch failed: ${error.message}`, "WEB_PROVIDER_ERROR", {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async followAndFetch(
    initialUrl: string,
    signal: AbortSignal,
    options: {
      timeoutMs: number;
      maxRedirects: number;
      maxResponseBytes: number;
      enableDynamicFallback: boolean;
      enableStealthFallback: boolean;
    }
  ): Promise<WebFetchResult> {
    let currentUrl = validateFetchUrl(initialUrl);
    let redirectsFollowed = 0;

    for (;;) {
      if (signal.aborted) {
        throw new WebError("web fetch aborted", "WEB_ABORTED", { cause: signal.reason });
      }

      // Step 1: Strict SSRF pre-flight validation against loopback, private subnets, cloud metadata
      await resolvePublicAddresses(currentUrl.hostname, signal);

      // Step 2: Tier 1 fetch through cheap HTTP with browser impersonation
      let sidecarRes = await this.executeFetchHop(currentUrl, "http", options.timeoutMs, signal);

      // Check if redirect
      if (isRedirectStatus(sidecarRes.statusCode)) {
        if (redirectsFollowed >= options.maxRedirects) {
          throw new WebError(
            `exceeded the maximum of ${options.maxRedirects} redirects`,
            "WEB_REDIRECT_BLOCKED"
          );
        }

        const location = sidecarRes.headers["location"];
        if (!location) {
          throw new WebError(
            `redirect response (HTTP ${sidecarRes.statusCode}) without a Location header`,
            "WEB_PROVIDER_ERROR"
          );
        }

        const target = resolveRedirect(location, currentUrl);
        const validatedTarget = validateFetchUrl(target.toString());

        // Step 3: Strict same-origin redirect enforcement
        if (!isSameOrigin(validatedTarget, currentUrl)) {
          throw new WebError(
            `cross-origin redirect to ${validatedTarget.origin} is not followed automatically; retry against that URL directly`,
            "WEB_REDIRECT_BLOCKED"
          );
        }

        currentUrl = validatedTarget;
        redirectsFollowed++;
        continue;
      }

      // Check Content-Type
      const contentType = sidecarRes.headers["content-type"];
      let kind = classifyContentType(contentType);
      if (kind === undefined) {
        throw new WebError(
          `unsupported content type "${contentType ?? "unknown"}"`,
          "WEB_UNSUPPORTED_CONTENT_TYPE"
        );
      }

      // Step 4: Check if Dynamic Browser escalation is needed & enabled
      if (
        kind === "html" &&
        options.enableDynamicFallback &&
        this.shouldEscalateToDynamic(sidecarRes.html ?? "")
      ) {
        try {
          const dynamicRes = await this.executeFetchHop(
            currentUrl,
            "dynamic",
            options.timeoutMs,
            signal
          );
          if (dynamicRes.statusCode === 200 && dynamicRes.html && dynamicRes.html.length > 0) {
            sidecarRes = dynamicRes;
          }
        } catch {
          // Dynamic fallback is progressive; if it fails, retain Tier 1 result
        }
      }

      // Step 5: Format body & enforce size caps
      const rawContent = kind === "html" ? sidecarRes.html ?? "" : sidecarRes.text ?? "";
      const rawBuffer = Buffer.from(rawContent, "utf-8");

      let content = rawContent;
      let truncated = false;

      if (rawBuffer.byteLength > options.maxResponseBytes) {
        // Safe UTF-8 truncation
        content = rawBuffer.subarray(0, options.maxResponseBytes).toString("utf-8");
        truncated = true;
      }

      const body: WebFetchBody =
        kind === "html"
          ? { kind: "html", content }
          : { kind: "text", content };

      return {
        url: currentUrl.toString(),
        statusCode: sidecarRes.statusCode,
        body,
        truncated,
      };
    }
  }

  private async executeFetchHop(
    url: URL,
    mode: "http" | "dynamic" | "stealth",
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<SidecarFetchSuccess> {
    const payload: SidecarFetchPayload = {
      url: url.toString(),
      mode,
      timeout_ms: timeoutMs,
      follow_redirects: false, // Provider explicitly owns redirect validation loop
      network_idle: true,
      disable_resources: false,
    };

    const res = await this.bridge.fetch(payload, signal);

    if ("error" in res) {
      if (res.is_timeout) {
        throw new WebError("web fetch timed out", "WEB_FETCH_TIMEOUT");
      }
      throw new WebError(`web fetch failed: ${res.error}`, "WEB_PROVIDER_ERROR");
    }

    return res;
  }

  /**
   * Progressive escalation trigger: detects empty JS SPA shells or explicit noscript requirements.
   */
  private shouldEscalateToDynamic(html: string): boolean {
    if (!html || html.length === 0) return true;

    // Check for empty React/Vue/Angular root divs
    const hasSpaRoot =
      html.includes('id="root"></div>') ||
      html.includes('id="app"></div>') ||
      html.includes('id="__next"></div>');

    // Check for explicit JavaScript required message
    const hasJsRequired =
      html.includes("<noscript>") &&
      (html.includes("JavaScript is required") ||
        html.includes("enable JavaScript") ||
        html.includes("requires JavaScript"));

    // Check if body text content is suspiciously small (< 250 chars) for an HTML doc
    const stripped = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const isVirtuallyEmpty = stripped.length < 250 && hasSpaRoot;

    return hasJsRequired || isVirtuallyEmpty;
  }

  /**
   * Clean up bridge process on disposal.
   */
  async dispose(): Promise<void> {
    if (this.bridgeInstance) {
      await this.bridgeInstance.dispose();
      this.bridgeInstance = null;
    }
  }
}

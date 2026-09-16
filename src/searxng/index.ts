import type { Context } from "@deepseek-ai/cordis";
import { SearxngSearchProvider, SEARXNG_PROVIDER_ID } from "./provider.js";
import { SearxngConfig, type SearxngSearchConfig } from "./types.js";

export const name = "web-search-searxng";
export const inject = ["web"] as const;
export const Config = SearxngConfig;

export function apply(ctx: Context, config: SearxngSearchConfig): void {
  const provider = new SearxngSearchProvider(config);
  ctx.web.registerSearchProvider(provider);
}

export {
  SearxngSearchProvider,
  SEARXNG_PROVIDER_ID,
  SearxngConfig,
  type SearxngSearchConfig,
};

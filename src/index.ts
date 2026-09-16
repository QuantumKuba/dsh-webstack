import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import {
  apply as applySearxng,
  SearxngConfig,
  SearxngSearchProvider,
  SEARXNG_PROVIDER_ID,
  type SearxngSearchConfig,
} from "./searxng/index.js";
import {
  apply as applyScrapling,
  ScraplingConfig,
  ScraplingFetchProvider,
  SCRAPLING_PROVIDER_ID,
  type ScraplingFetchConfig,
} from "./scrapling/index.js";

export const name = "dsh-webstack";
export const inject = ["web"] as const;

export interface AdvancedWebSearchConfig {
  readonly searxng?: SearxngSearchConfig;
  readonly scrapling?: ScraplingFetchConfig;
}

export const Config: z<AdvancedWebSearchConfig> = z.object({
  searxng: SearxngConfig.description("SearXNG search provider configuration"),
  scrapling: ScraplingConfig.description("Scrapling fetch provider configuration"),
});

export function apply(ctx: Context, config: AdvancedWebSearchConfig = {}): void {
  applySearxng(ctx, config.searxng ?? {});
  applyScrapling(ctx, config.scrapling ?? {});
}

export {
  SearxngSearchProvider,
  SEARXNG_PROVIDER_ID,
  SearxngConfig,
  type SearxngSearchConfig,
  ScraplingFetchProvider,
  SCRAPLING_PROVIDER_ID,
  ScraplingConfig,
  type ScraplingFetchConfig,
};

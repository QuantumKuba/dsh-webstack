import type { Context } from "@deepseek-ai/cordis";
import { ScraplingFetchProvider, SCRAPLING_PROVIDER_ID } from "./provider.js";
import { ScraplingConfig, type ScraplingFetchConfig } from "./types.js";

export const name = "web-fetch-scrapling";
export const inject = ["web"] as const;
export const Config = ScraplingConfig;

export function apply(ctx: Context, config: ScraplingFetchConfig): void {
  const provider = new ScraplingFetchProvider(config);
  ctx.web.registerFetchProvider(provider);

  // Hook cleanup into Cordis plugin unmount
  ctx.effect(() => {
    return () => {
      provider.dispose().catch(() => {});
    };
  });
}

export {
  ScraplingFetchProvider,
  SCRAPLING_PROVIDER_ID,
  ScraplingConfig,
  type ScraplingFetchConfig,
};

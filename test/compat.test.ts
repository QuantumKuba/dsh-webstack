/**
 * Host-compatibility contract tests.
 *
 * These tests exercise every surface this plugin depends on from
 * `@deepseek-ai/dsh-web` / `@deepseek-ai/cordis` / `@deepseek-ai/schemastery`
 * WITHOUT any external network, SearXNG instance, or Python. They are the
 * gate used by CI and the dependency canary: if one fails after a dsh release,
 * the plugin is genuinely incompatible with that release.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Context } from "@deepseek-ai/cordis";
import { WebRuntime, WebError } from "@deepseek-ai/dsh-web";
import * as Plugin from "../src/index.js";

interface FakeSearxng {
  readonly baseURL: string;
  readonly requests: URL[];
  close(): Promise<void>;
}

async function startFakeSearxng(): Promise<FakeSearxng> {
  const requests: URL[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requests.push(url);
    if (url.pathname !== "/search" || url.searchParams.get("format") !== "json") {
      res.writeHead(403).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        query: url.searchParams.get("q"),
        results: [
          { url: "https://example.org/a", title: " First ", content: "snippet a", engine: "x" },
          { url: "https://example.org/a", title: "Duplicate of first" },
          { url: "not a url", title: "Invalid" },
          { url: "https://example.org/b", title: "Second", publishedDate: "2026-01-01" },
          { url: "https://example.org/c", title: "Third" },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    baseURL: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function mount(config: Plugin.AdvancedWebSearchConfig) {
  const ctx = new Context();
  new WebRuntime(ctx, { searchProvider: Plugin.SEARXNG_PROVIDER_ID, fetchProvider: Plugin.SCRAPLING_PROVIDER_ID });
  const fork = ctx.plugin(Plugin, config);
  return { ctx, fork };
}

describe("dsh-web host compatibility (offline contract)", () => {
  let fake: FakeSearxng;

  before(async () => {
    fake = await startFakeSearxng();
  });

  after(async () => {
    await fake.close();
  });

  it("exposes the plugin shape the cordis loader expects", () => {
    assert.equal(typeof Plugin.name, "string");
    assert.deepEqual([...Plugin.inject], ["web"]);
    assert.equal(typeof Plugin.apply, "function");
    assert.equal(typeof Plugin.Config, "function", "Config must be a callable schemastery schema");
    assert.equal(Plugin.SEARXNG_PROVIDER_ID, "searxng");
    assert.equal(Plugin.SCRAPLING_PROVIDER_ID, "scrapling");
  });

  it("validates and defaults config through the host's schemastery", () => {
    const parsed = Plugin.Config({}) as Plugin.AdvancedWebSearchConfig;
    assert.equal(parsed.searxng?.timeoutMs, 15000);
    assert.equal(parsed.scrapling?.timeoutMs, 30000);

    assert.throws(() => Plugin.Config({ searxng: { timeoutMs: 1 } }), "timeoutMs below minimum must be rejected");
  });

  it("registers the search provider on ctx.web and serves results through the seam", async () => {
    const { ctx, fork } = mount({ searxng: { baseURL: fake.baseURL } });
    await fork;

    const result = await ctx.web.search({ query: "contract probe", maxResults: 2 });

    assert.ok(Array.isArray(result.sources));
    assert.ok(result.sources.length <= 2, "seam must bound sources to maxResults");
    assert.equal(result.sources[0]?.url, "https://example.org/a");
    assert.equal(result.sources[0]?.title, "First");
    assert.equal(result.truncated, true, "seam must flag truncation when results exceed maxResults");

    const seen = fake.requests.at(-1);
    assert.equal(seen?.searchParams.get("q"), "contract probe");
    assert.equal(seen?.searchParams.get("format"), "json");

    fork.dispose();
  });

  it("registers the fetch provider on ctx.web and enforces URL safety before any sidecar starts", async () => {
    const { ctx, fork } = mount({ searxng: { baseURL: fake.baseURL } });
    await fork;

    await assert.rejects(
      () => ctx.web.fetch({ url: "http://127.0.0.1:1/" }),
      (err: unknown) => {
        assert.ok(err instanceof WebError, "errors must be the host's WebError class");
        assert.equal(err.code, "WEB_BLOCKED_URL");
        return true;
      }
    );

    fork.dispose();
  });

  it("surfaces provider failures as the host's WebError taxonomy", async () => {
    const { ctx, fork } = mount({ searxng: { baseURL: "http://127.0.0.1:1", timeoutMs: 1000 } });
    await fork;

    await assert.rejects(
      () => ctx.web.search({ query: "unreachable" }),
      (err: unknown) => {
        assert.ok(err instanceof WebError);
        assert.equal(err.code, "WEB_PROVIDER_ERROR");
        return true;
      }
    );

    fork.dispose();
  });

  it("tolerates being mounted twice without WEB_DUPLICATE_PROVIDER", async () => {
    const ctx = new Context();
    new WebRuntime(ctx, { searchProvider: "searxng", fetchProvider: "scrapling" });

    const first = ctx.plugin(Plugin, { searxng: { baseURL: fake.baseURL } });
    await first;
    let second: ReturnType<typeof ctx.plugin> | undefined;
    assert.doesNotThrow(() => {
      second = ctx.plugin(Plugin, { searxng: { baseURL: fake.baseURL } });
    });
    await second;

    first.dispose();
    second?.dispose();
  });
});

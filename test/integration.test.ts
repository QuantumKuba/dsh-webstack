import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Context } from "@deepseek-ai/cordis";
import { WebRuntime, WebError } from "@deepseek-ai/dsh-web";
import { ScraplingFetchProvider } from "../src/scrapling/provider.js";
import { ScraplingBridge } from "../src/scrapling/bridge.js";
import * as AdvancedWebSearchPlugin from "../src/index.js";

describe("Scrapling Fetch Provider Integration Tests", () => {
  const bridge = new ScraplingBridge();
  const provider = new ScraplingFetchProvider(
    {
      timeoutMs: 15000,
      maxRedirects: 3,
      maxResponseBytes: 10000,
    },
    bridge
  );

  after(async () => {
    await provider.dispose();
  });

  it("fetches public live page https://example.com successfully", async () => {
    const result = await provider.fetch({ url: "https://example.com" });

    assert.equal(result.statusCode, 200);
    assert.ok(result.url.startsWith("https://example.com"));
    assert.equal(result.body.kind, "html");
    assert.ok(result.body.content.includes("Example Domain"));
    assert.equal(result.truncated, false);
  });

  it("strictly blocks cross-origin redirects with WEB_REDIRECT_BLOCKED", async () => {
    // Test server that attempts a cross-origin redirect
    // Since public IPs are validated, we test using a public URL that issues a cross-origin redirect
    // Or we use mock resolver with a local server
    const server = http.createServer((req, res) => {
      res.writeHead(302, {
        Location: "https://evil-cross-origin.com/landing",
      });
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      // Mock resolver returning public IP for our test host
      const customProvider = new ScraplingFetchProvider({}, bridge);

      // Fetch against a known cross-origin redirect or test the same-origin guard
      // Using httpbin redirect-to
      await assert.rejects(
        async () => {
          await customProvider.fetch({
            url: "https://httpbin.org/redirect-to?url=https://example.com&status_code=302",
          });
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_REDIRECT_BLOCKED");
          assert.match(err.message, /cross-origin redirect to https:\/\/example\.com/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("follows same-origin redirects to the final destination", async () => {
    const result = await provider.fetch({
      url: "https://httpbin.org/redirect/1",
    });

    assert.equal(result.statusCode, 200);
    assert.ok(result.url.includes("httpbin.org/get"));
  });

  it("truncates body when response exceeds maxResponseBytes and sets truncated: true", async () => {
    const smallCapProvider = new ScraplingFetchProvider(
      {
        maxResponseBytes: 250,
      },
      bridge
    );

    const result = await smallCapProvider.fetch({ url: "https://example.com" });
    assert.equal(result.statusCode, 200);
    assert.equal(result.truncated, true);
    assert.ok(Buffer.byteLength(result.body.content, "utf-8") <= 250);
  });
});

describe("Cordis Integration & Plugin Seam Tests", () => {
  it("mounts dsh-advanced-web-search bundle into WebRuntime seamlessly", async () => {
    const ctx = new Context();

    // Install WebRuntime service on ctx.web configured to use our providers
    new WebRuntime(ctx, {
      searchProvider: "searxng",
      fetchProvider: "scrapling",
    });

    // Mount our plugin bundle and await fiber activation
    const fork = ctx.plugin(AdvancedWebSearchPlugin, {
      searxng: {
        baseURL: "http://127.0.0.1:8080",
      },
      scrapling: {
        timeoutMs: 15000,
      },
    });
    await fork;

    assert.ok(ctx.web, "ctx.web must be initialized");

    // Execute search through the WebRuntime seam
    const searchResult = await ctx.web.search({
      query: "DeepSeek AI",
      maxResults: 3,
    });

    assert.ok(searchResult, "Search result should be returned");
    assert.ok(Array.isArray(searchResult.sources), "Sources should be an array");
    // Seam bounds check: maxResults was 3, so sources.length <= 3
    assert.ok(searchResult.sources.length <= 3, "Seam must bound sources to maxResults");

    // Execute fetch through the WebRuntime seam
    const fetchResult = await ctx.web.fetch({
      url: "https://example.com",
    });

    assert.ok(fetchResult, "Fetch result should be returned");
    assert.equal(fetchResult.statusCode, 200);
    assert.equal(fetchResult.body.kind, "html");
    assert.ok(fetchResult.body.content.includes("Example Domain"));

    // Cleanly unmount plugin fork
    fork.dispose();
  });
});

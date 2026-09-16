import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebError } from "@deepseek-ai/dsh-web";
import { SearxngSearchProvider, SEARXNG_PROVIDER_ID } from "../src/searxng/provider.js";

describe("SearxngSearchProvider Unit Tests", () => {
  it("has correct provider ID", () => {
    const provider = new SearxngSearchProvider();
    assert.equal(provider.id, SEARXNG_PROVIDER_ID);
    assert.equal(provider.id, "searxng");
  });

  it("available() returns true for valid URL and false for malformed URL", () => {
    const validProvider = new SearxngSearchProvider({ baseURL: "http://127.0.0.1:8080" });
    assert.equal(validProvider.available(), true);

    const invalidProvider = new SearxngSearchProvider({ baseURL: "not-a-valid-url" });
    assert.equal(invalidProvider.available(), false);
  });

  it("correctly encodes query parameters and sends only documented params (no invented maxResults)", async () => {
    let requestedUrl: string | undefined;

    const server = http.createServer((req, res) => {
      requestedUrl = req.url;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          query: "test query with + & spaces",
          results: [
            {
              url: "https://example.com/page1",
              title: "Example Title 1",
              content: "Example snippet 1",
              publishedDate: "2026-03-01T12:00:00Z",
            },
          ],
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
      });

      const query = "test query with + & spaces";
      const result = await provider.search({ query, maxResults: 5 });

      assert.ok(requestedUrl, "Server should have received a request");
      const url = new URL(requestedUrl, `http://127.0.0.1:${port}`);
      assert.equal(url.pathname, "/search");
      assert.equal(url.searchParams.get("q"), query);
      assert.equal(url.searchParams.get("format"), "json");
      // Critical check: we must not invent a maxResults parameter on the query to SearXNG
      assert.equal(url.searchParams.get("maxResults"), null);
      assert.equal(url.searchParams.get("num_results"), null);

      assert.equal(result.sources.length, 1);
      assert.equal(result.sources[0].url, "https://example.com/page1");
      assert.equal(result.sources[0].title, "Example Title 1");
      assert.equal(result.sources[0].snippet, "Example snippet 1");
      assert.equal(result.sources[0].publishedAt, "2026-03-01T12:00:00Z");
      assert.equal(result.truncated, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("normalizes response, deduplicates URLs, trims whitespace, and ignores unresponsive_engines", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          query: "multi result",
          results: [
            {
              url: "  https://example.com/first  ",
              title: "  First Title  ",
              content: "  First snippet text  ",
              publishedDate: "2026-02-15T08:30:00",
              engine: "brave",
              score: 0.95,
            },
            {
              // Duplicate URL - should be deduped
              url: "https://example.com/first",
              title: "Duplicate Title",
              content: "Duplicate snippet",
            },
            {
              url: "https://example.com/second",
              title: "Second Title",
              content: "Second snippet",
              publishedDate: null,
            },
            {
              // Invalid URL - should be dropped
              url: "not a valid url",
              title: "Invalid",
            },
            {
              // Missing title and snippet
              url: "https://example.com/bare",
            },
          ],
          unresponsive_engines: [["duckduckgo", "SSL error: certificate validation has failed"]],
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
      });

      const result = await provider.search({ query: "multi result" });

      assert.equal(result.sources.length, 3);

      // Item 1
      assert.equal(result.sources[0].url, "https://example.com/first");
      assert.equal(result.sources[0].title, "First Title");
      assert.equal(result.sources[0].snippet, "First snippet text");
      assert.equal(result.sources[0].publishedAt, "2026-02-15T08:30:00");
      // Ensure engine internals are stripped
      assert.equal((result.sources[0] as any).engine, undefined);
      assert.equal((result.sources[0] as any).score, undefined);

      // Item 2
      assert.equal(result.sources[1].url, "https://example.com/second");
      assert.equal(result.sources[1].title, "Second Title");
      assert.equal(result.sources[1].snippet, "Second snippet");
      assert.equal(result.sources[1].publishedAt, undefined);

      // Item 3 (bare)
      assert.equal(result.sources[2].url, "https://example.com/bare");
      assert.equal(result.sources[2].title, undefined);
      assert.equal(result.sources[2].snippet, undefined);
      assert.equal(result.sources[2].publishedAt, undefined);

      assert.equal(result.truncated, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("throws WEB_ABORTED when pre-aborted signal is provided", async () => {
    const provider = new SearxngSearchProvider({ baseURL: "http://127.0.0.1:8080" });
    const controller = new AbortController();
    controller.abort(new Error("Pre-aborted test"));

    await assert.rejects(
      async () => {
        await provider.search({ query: "test" }, controller.signal);
      },
      (err: any) => {
        assert.ok(err instanceof WebError);
        assert.equal(err.code, "WEB_ABORTED");
        return true;
      }
    );
  });

  it("throws WEB_ABORTED when signal aborts during in-flight request", async () => {
    const server = http.createServer((req, res) => {
      // Deliberately stall response
      setTimeout(() => {
        res.writeHead(200);
        res.end("{}");
      }, 2000);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
        timeoutMs: 5000,
      });

      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("Cancelled")), 50);

      await assert.rejects(
        async () => {
          await provider.search({ query: "cancel me" }, controller.signal);
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_ABORTED");
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("throws WEB_PROVIDER_ERROR when request times out", async () => {
    const server = http.createServer((req, res) => {
      // Never respond
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
        timeoutMs: 100, // very short timeout
      });

      await assert.rejects(
        async () => {
          await provider.search({ query: "timeout test" });
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_PROVIDER_ERROR");
          assert.match(err.message, /timed out/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("throws WEB_PROVIDER_ERROR when SearXNG returns HTTP 500", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
      });

      await assert.rejects(
        async () => {
          await provider.search({ query: "error test" });
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_PROVIDER_ERROR");
          assert.match(err.message, /500/);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("throws WEB_PROVIDER_ERROR when SearXNG returns malformed JSON", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("NOT VALID JSON {{");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new SearxngSearchProvider({
        baseURL: `http://127.0.0.1:${port}`,
      });

      await assert.rejects(
        async () => {
          await provider.search({ query: "malformed test" });
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_PROVIDER_ERROR");
          assert.match(err.message, /invalid JSON/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("throws WEB_PROVIDER_ERROR when SearXNG is unreachable", async () => {
    // Port 1 is reserved and typically nothing listens there
    const provider = new SearxngSearchProvider({
      baseURL: "http://127.0.0.1:1",
      timeoutMs: 1000,
    });

    await assert.rejects(
      async () => {
        await provider.search({ query: "unreachable test" });
      },
      (err: any) => {
        assert.ok(err instanceof WebError);
        assert.equal(err.code, "WEB_PROVIDER_ERROR");
        return true;
      }
    );
  });
});

describe("SearxngSearchProvider Live Test against Local SearXNG", () => {
  it("searches local SearXNG at http://127.0.0.1:8080 and returns valid sources", async () => {
    const provider = new SearxngSearchProvider({
      baseURL: "http://127.0.0.1:8080",
      timeoutMs: 15000,
    });

    assert.equal(provider.available(), true);

    const result = await provider.search({ query: "DeepSeek AI" });

    assert.ok(result, "Result should be defined");
    assert.ok(Array.isArray(result.sources), "Sources should be an array");
    assert.equal(result.truncated, false);

    if (result.sources.length > 0) {
      const first = result.sources[0];
      assert.ok(first.url.startsWith("http"), `URL should be valid http(s): ${first.url}`);
      assert.ok(first.title !== undefined || first.snippet !== undefined, "Result should have title or snippet");
    }
  });
});

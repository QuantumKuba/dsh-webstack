# Programmatic Usage Guide

While `dsh-webstack` is engineered as a plugin for **DeepSeek Harness** (`ctx.web`), you can also import and use the search and fetch providers as standalone TypeScript/JavaScript libraries in any Node.js project.

---

## 1. Installation

```bash
pnpm add dsh-webstack
# or
npm install dsh-webstack
```

---

## 2. Using `SearxngSearchProvider`

The search provider queries a local or remote SearXNG metasearch instance and returns deduplicated, normalized sources:

```typescript
import { SearxngSearchProvider } from "dsh-webstack/searxng";

// Instantiate the search provider
const searchProvider = new SearxngSearchProvider({
  baseURL: "http://127.0.0.1:8080", // Default: process.env.SEARXNG_URL or http://127.0.0.1:8080
  timeoutMs: 15000,
});

// Perform a search
try {
  const result = await searchProvider.search({
    query: "DeepSeek V3 api tool calling documentation",
  });

  console.log(`Retrieved ${result.sources.length} sources:`);
  for (const source of result.sources) {
    console.log(`- Title: ${source.title}`);
    console.log(`  URL:   ${source.url}`);
    console.log(`  Snippet: ${source.snippet?.slice(0, 100)}...`);
  }
} catch (error) {
  console.error("Search failed:", error);
}
```

### Cancellation with `AbortSignal`

SearXNG search requests honor standard `AbortSignal` instances:

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort("Request took too long"), 5000);

const result = await searchProvider.search(
  { query: "asyncio event loop" },
  controller.signal
);
```

---

## 3. Using `ScraplingFetchProvider`

The fetch provider performs secure pre-flight DNS validation, enforces same-origin redirects, and retrieves content across Tier 1 (HTTP), Tier 2 (Headless Chrome), or Tier 3 (Stealth Bypass):

```typescript
import { ScraplingFetchProvider } from "dsh-webstack/scrapling";

// Instantiate fetch provider
const fetchProvider = new ScraplingFetchProvider({
  pythonBinary: "/Users/kuba/.venvs/scrapling/bin/python3",
  timeoutMs: 20000,
  maxRedirects: 5,
  maxResponseBytes: 5000000,
  enableDynamicFallback: true,
  enableStealthFallback: true,
  stealthSolveCloudflare: true,
});

// Fetch a web page
try {
  const page = await fetchProvider.fetch({
    url: "https://news.ycombinator.com",
  });

  console.log(`Status: ${page.status}`);
  console.log(`Content-Type: ${page.body.contentType}`);
  console.log(`Payload length: ${page.body.content.length} chars`);
  console.log(`Truncated: ${page.body.truncated}`);
} finally {
  // Always clean up the sidecar process when your application shuts down
  await fetchProvider.dispose();
}
```

---

## 4. Error Handling (`WebError`)

Both providers throw typed `WebError` instances defined by `@deepseek-ai/dsh-web`:

```typescript
import { WebError } from "@deepseek-ai/dsh-web";

try {
  await fetchProvider.fetch({ url: "http://127.0.0.1:8000/internal" });
} catch (error) {
  if (error instanceof WebError) {
    console.log(`Error code: ${error.code}`); // e.g. "WEB_BLOCKED_URL"
    console.log(`Message: ${error.message}`);
  }
}
```

### Standard Error Codes
| Code | Cause |
| :--- | :--- |
| `WEB_INVALID_URL` | Malformed URL string or unsupported protocol (non-HTTP/HTTPS). |
| `WEB_BLOCKED_URL` | URL targets private subnets, localhost, cloud metadata, or contains credentials. |
| `WEB_REDIRECT_BLOCKED` | Request attempted to cross origins during redirection. |
| `WEB_ABORTED` | The request was cancelled via `AbortSignal`. |
| `WEB_PROVIDER_ERROR` | Upstream service returned a 5xx error or connection failed. |
| `WEB_TIMEOUT` | Request exceeded configured timeout threshold. |

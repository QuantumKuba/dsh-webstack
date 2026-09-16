# dsh-advanced-web-search

High-grade, production-ready web capability plugin for **DeepSeek Harness** (`ctx.web`), integrating **SearXNG** for web search/discovery and **Scrapling** for URL content retrieval and extraction.

Specifically engineered for local models such as **Qwen 3.8 27B** with a 90k context window.

---

## Key Highlights

* **Zero Tool-Bloat for Models**: The model only ever sees the standard `web_search` and `web_fetch` tools. No new tool names, no dynamic scraping parameters exposed to the LLM.
* **SearXNG Search Provider (`searxng`)**:
  * Direct integration with local SearXNG (`http://127.0.0.1:8080`).
  * Strict parameter integrity: sends only documented query parameters (`q` and `format=json`).
  * Harness `ctx.web` seam owns source slicing and `truncated: true`.
  * Preserves engine ranking, deduplicates URLs, trims whitespace, and tolerates `unresponsive_engines` when valid results are present.
* **Scrapling Fetch Provider (`scrapling`)**:
  * **Tier 1 (Default)**: Ultra-fast HTTP retrieval via `curl_cffi` with browser TLS fingerprint impersonation (`impersonate="chrome"`).
  * **Tier 2 (Progressive)**: Dynamic Playwright headless Chrome (`real_chrome=True`, `network_idle=True`) for JavaScript SPAs. Opt-in via `enableDynamicFallback`.
  * **Tier 3 (Stealth)**: Anti-bot bypass with `StealthyFetcher` (`solve_cloudflare=True`). Opt-in via `enableStealthFallback`.
* **Enterprise SSRF & Safe-URL Parity**:
  * Pre-flight DNS resolution ensuring every returned IPv4 and IPv6 address is public unicast.
  * Blocks loopback (`127.0.0.0/8`, `::1`), private subnets (RFC 1918), link-local & cloud metadata (`169.254.169.254`), carrier-grade NAT (`100.64.0.0/10`), and IPv4-mapped IPv6.
  * Strict same-origin redirect enforcement: cross-origin redirects are rejected with `WEB_REDIRECT_BLOCKED`.
  * Browser Safety Invariant: Dynamic browser fetching is not falsely claimed as connection-pinned SSRF parity, remaining an explicit opt-in setting.
* **Zero-Leak Process Supervisor**:
  * Python micro-sidecar binds to loopback `127.0.0.1:0` (OS-allocated ephemeral port) and handshakes readiness via stdout JSON (`{"status": "ready", "port": ..., "pid": ...}`).
  * Complete lifecycle teardown hooked into Cordis fiber disposal, ensuring zero orphaned Python or Chromium processes.
* **Context Protection for 27B Local Models**:
  * `fetchMaxOutputChars` capped at 50,000 characters (configured on `dsh-tool-web`).
  * HTML content automatically converted to GitHub-Flavored Markdown via Harness's built-in `TurndownService`.

---

## Installation & Setup

### 1. Requirements
* Node.js $\ge$ 22
* Python 3.11+ with Scrapling (`pip install scrapling` or local venv)
* Local SearXNG instance running on `http://127.0.0.1:8080` (or configured via `SEARXNG_URL`)

### 2. Install Dependencies & Build
```bash
pnpm install
pnpm build
```

### 3. Link to DeepSeek Harness Profile
In your target DSH profile (e.g. `~/.dsh/profiles/web/package.json`):
```json
{
  "dependencies": {
    "dsh-advanced-web-search": "link:/Users/kuba/Documents/Github/dsh-advanced-web-search"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-advanced-web-search"
      ]
    }
  }
}
```

And in `cordis.patch.yml`:
```yaml
- id: web
  config:
    searchProvider: searxng
    fetchProvider: scrapling

- id: tool-web
  config:
    fetchMaxOutputChars: 50000
    searchMaxResults: 8
```

---

## Running Tests

The test suite covers unit testing, SSRF security validation, cancellation & process leak prevention, and end-to-end integration:

```bash
# Run all tests
pnpm test

# Run focused test suites
pnpm test:searxng       # SearXNG query encoding, response mapping, errors
pnpm test:security      # SSRF validation, private IP blocking, same-origin redirects
pnpm test:cancellation  # Cancellation, process termination, zero leaked PIDs
pnpm test:integration   # Live HTTP fetch, redirect rules, Cordis WebRuntime seam
```

---

## License

MIT

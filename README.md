<p align="center">
  <img src="img/header-image.png" alt="dsh-webstack banner" width="100%" />
</p>

<p align="center">
  <strong>Enterprise-Grade Web Search & Retrieval Plugin for DeepSeek Harness (<code>ctx.web</code>)</strong>
</p>

<p align="center">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.18.0-blue.svg?style=flat-square" alt="Node.js version" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/typescript-5.7-blue.svg?style=flat-square" alt="TypeScript" /></a>
  <a href="https://github.com/QuantumKuba/dsh-webstack"><img src="https://img.shields.io/badge/cordis-ready-4A154B.svg?style=flat-square" alt="Cordis Ready" /></a>
  <a href="https://github.com/QuantumKuba/dsh-webstack"><img src="https://img.shields.io/badge/tests-35%20passing-success.svg?style=flat-square" alt="Tests" /></a>
  <a href="https://github.com/QuantumKuba/dsh-webstack"><img src="https://img.shields.io/badge/security-preflight%20SSRF%20hardened-brightgreen.svg?style=flat-square" alt="Security" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-informational.svg?style=flat-square" alt="License" /></a>
</p>

---

## Overview

**`dsh-webstack`** is a high-performance web capability bundle for **DeepSeek Harness**, integrating **SearXNG** for metasearch discovery and **Scrapling** for multi-tier, anti-bot resilient content retrieval.

Engineered specifically for local reasoning models (such as **Qwen 2.5/3.8 27B** and **DeepSeek R1/V3**) operating within bounded context windows (32k–90k tokens), `dsh-webstack` delivers web autonomy without tool bloat, context pollution, or security vulnerabilities.

```
                  ┌───────────────────────────────────────────────────────────┐
                  │                 DeepSeek Harness Agent                    │
                  │             Local LLM (Qwen 3.8 27B / R1)                 │
                  └─────────────────────────────┬─────────────────────────────┘
                                                │
                               Native Schema    │  web_search / web_fetch
                                                ▼
                  ┌───────────────────────────────────────────────────────────┐
                  │                  Cordis ctx.web Runtime                   │
                  └──────────────┬────────────────────────────┬───────────────┘
                                 │                            │
             Provider: searxng   │        Provider: scrapling │
                                 ▼                            ▼
                 ┌──────────────────────────┐ ┌───────────────────────────────┐
                 │  SearxngSearchProvider   │ │     ScraplingFetchProvider    │
                 │   • Clean JSON Mapping   │ │   • Pre-Flight DNS Validation │
                 │   • Engine Deduplication │ │   • Same-Origin Redirect Lock │
                 └────────────┬─────────────┘ └───────────────┬───────────────┘
                              │                               │
                              ▼                               ▼
                 ┌──────────────────────────┐ ┌───────────────────────────────┐
                 │  Local SearXNG Instance  │ │  Scrapling Multi-Tier Engine  │
                 │  Privacy-preserving meta │ │  T1: curl_cffi Impersonation  │
                 │  aggregation (P95 1.7s)  │ │  T2: Headless Playwright/DOM  │
                 └──────────────────────────┘ │  T3: Stealth WAF & Turnstile  │
                                              └───────────────┬───────────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────────────┐
                                              │  Markdown Economizer (GFM)    │
                                              │  73.1% token context savings  │
                                              └───────────────────────────────┘
```

---

## Architecture & Production Guarantees

### 1. Zero Model-Facing Tool Bloat
The model interacts exclusively with the native DeepSeek Harness `web_search` and `web_fetch` schema. Advanced scraping parameters, stealth flags, and DNS checks remain entirely encapsulated inside the provider layer.

### 2. Multi-Tier Retrieval Pipeline (`scrapling`)
Content fetching automatically scales across three performance tiers based on target complexity:

| Tier | Engine / Technology | Latency (Mean) | Primary Target |
| :--- | :--- | :---: | :--- |
| **Tier 1 (Default)** | `curl_cffi` (Chrome TLS fingerprint) | **531ms** | Documentation, GitHub, Wikipedia, blogs, REST endpoints |
| **Tier 2 (Dynamic)** | Playwright Headless Chrome | **2,088ms** | Client-rendered JavaScript SPAs (React, Vue, Next.js) |
| **Tier 3 (Stealth)** | `StealthyFetcher` Anti-Bot Engine | **1,669ms** | Cloudflare Turnstile, interstitials, anti-bot WAF challenges |

* **Turnstile Solver**: Automatic detection and click-coordinate humanization for interactive Cloudflare challenges.
* **Fingerprint Camouflage**: Chromium canvas noise injection, WebRTC IP leakage suppression, genuine WebGL contexts, Google Search referer spoofing, and tracker blocking (~3,500 domains).

### 3. Kernel-Grade SSRF & Safe-URL Shield
All fetch requests undergo pre-flight DNS address validation prior to connection dispatch:
* **Private Subnet Denial**: Immediately blocks loopback (`127.0.0.0/8`, `::1`), RFC 1918 subnets, link-local / cloud metadata endpoints (`169.254.169.254`), and carrier-grade NAT (`100.64.0.0/10`).
* **Split-Horizon Protection**: Hostnames resolving to mixed public/private addresses are rejected immediately.
* **Strict Same-Origin Redirects**: Redirects crossing origins or protocols are terminated with `WEB_REDIRECT_BLOCKED`.
* **Zero-DNS Latency Penalty**: Security checks complete in **< 0.2ms** before any TCP handshake or sidecar dispatch.

### 4. Context Optimization for Local LLMs
* **73.1% Token Reduction**: Raw HTML is converted to clean, semantic GitHub-Flavored Markdown via Harness's built-in Turndown pipeline.
* **3.72x Effective Capacity**: Enables local 27B models to intake nearly 4x more documentation without exceeding context bounds or suffering attention dilution.
* **Hard Output Bounds**: `fetchMaxOutputChars` capped at 50,000 characters to prevent context blowout.

### 5. Zero-Leak Process Supervisor
* **Dynamic Loopback Binding**: The Python micro-sidecar binds to an OS-allocated ephemeral port (`127.0.0.1:0`) and handshakes readiness via JSON stdout (`{"status": "ready", "port": ..., "pid": ...}`).
* **Fiber Teardown**: Hooks into Cordis lifecycle events to guarantee instantaneous termination (`1.5ms`) with zero orphan Python or Chromium processes.

---

## Performance & Benchmark Highlights

Empirically validated on Apple Silicon (`Darwin arm64`) against local **SearXNG**, **Scrapling 0.4.7**, and **Qwen 3.8 27B** via oMLX:

| Dimension | Measured Metric | Target & Significance |
| :--- | :---: | :--- |
| **SearXNG Search Latency** | **1,148ms** mean / **1,736ms** P95 | **100% success rate** across technical API, debugging, and general queries |
| **Fast HTTP Fetch (Tier 1)** | **531ms** mean / **687ms** P95 | High-throughput documentation retrieval with browser TLS impersonation |
| **Stealth Anti-Bot Fetch (Tier 3)** | **1,669ms** mean | Solves Cloudflare Turnstile & interstitial challenges autonomously |
| **Context Token Savings** | **73.1% reduction** (3.72x multiplier) | Compresses ~32.6k raw HTML tokens down to ~8.8k semantic GFM tokens |
| **SSRF Threat Prevention** | **100% intercepted** (8/8 attack vectors) | < 0.2ms abort decision; zero network requests dispatched to private nets |
| **Bridge Startup / Teardown** | **114.7ms** boot / **1.5ms** exit | Dynamic ephemeral port assignment; **0 orphan/zombie processes** |

> 📊 *For complete per-query distributions, latency variance, and test setups, refer to the [Benchmark Report](benchmark/BENCHMARK_REPORT.md).*

---

## Prerequisites & Installation

Follow this comprehensive guide to configure **SearXNG**, the **Python Scrapling environment**, and **DeepSeek Harness** from scratch.

---

### 1. SearXNG Setup (Official Docker Compose Guide)

`dsh-webstack` requires a running SearXNG instance with its JSON API enabled. Follow the official [SearXNG Container Deployment](https://docs.searxng.org/admin/installation-docker.html#installation-container) workflow:

#### Step 1: Create Directory & Download Official Compose Templates
```bash
# Create a dedicated directory for SearXNG and its configuration
mkdir -p ~/searxng/core-config
cd ~/searxng

# Fetch the official SearXNG docker-compose.yml and .env.example templates
curl -fsSL \
  -O https://raw.githubusercontent.com/searxng/searxng/master/container/docker-compose.yml \
  -O https://raw.githubusercontent.com/searxng/searxng/master/container/.env.example
```

#### Step 2: Configure `.env`
```bash
# Copy the example environment file
cp -i .env.example .env
```

Open `.env` in your editor and ensure `SEARXNG_HOST` is bound to localhost (or your desired interface):
```bash
# Listen to loopback only (safe for local harness usage)
SEARXNG_HOST=127.0.0.1
SEARXNG_PORT=8080
```

#### Step 3: Configure `core-config/settings.yml` & Generate Secret Key
SearXNG requires a random secret key and specific settings to serve local AI agent harnesses.

Create or edit `core-config/settings.yml`:
```yaml
use_default_settings: true

server:
  bind_address: "127.0.0.1"
  port: 8080
  # Generate with: openssl rand -hex 32
  secret_key: "GENERATE_A_RANDOM_SECRET_KEY_HERE"
  limiter: false           # REQUIRED: Disable rate limiter for local agent harnesses
  image_proxy: true

search:
  safe_search: 0
  max_page: 10
  formats:
    - html
    - json                 # REQUIRED: Enables the JSON API consumed by dsh-webstack

general:
  debug: false
  instance_name: "SearXNG (local)"

# Optional: Enable or disable specific engines
engines:
  - name: bing
    disabled: false
  - name: duckduckgo
    disabled: false
  - name: google
    disabled: false
  - name: github
    disabled: false
    categories: [general, it]
  - name: npm
    disabled: false
    categories: [general, it]
  - name: pypi
    disabled: false
    categories: [general, it]
```

> 🔑 **Quick secret key generation**:
> ```bash
> sed -i '' -e "s/GENERATE_A_RANDOM_SECRET_KEY_HERE/$(openssl rand -hex 32)/g" core-config/settings.yml
> ```

#### Step 4: Start Services with Docker Compose
The official compose file includes both `searxng-core` and `searxng-valkey` (Redis-compatible cache for rapid result caching):

```bash
# Start SearXNG and Valkey in detached mode
docker compose up -d
```

#### Step 5: Verify SearXNG is Operational
Test the JSON API endpoint using `curl`:
```bash
curl -s "http://127.0.0.1:8080/search?q=deepseek+harness&format=json" | grep -q "results" && echo "✅ SearXNG is ready!"
```

#### Useful SearXNG Management Commands
```bash
docker compose ps           # Check container status
docker compose logs -f core  # Tail SearXNG core logs
docker compose restart      # Restart services (e.g. after editing settings.yml)
docker compose down         # Stop and remove containers
```

---

### 2. Python & Scrapling Environment Setup

`dsh-webstack` communicates with Scrapling via an ephemeral Python micro-sidecar.

1. **Create and activate a virtual environment (recommended):**
   ```bash
   python3 -m venv ~/.venvs/scrapling
   source ~/.venvs/scrapling/bin/activate
   ```

2. **Install Scrapling with stealth support:**
   ```bash
   pip install "scrapling[stealth]"
   ```

3. **Install Chromium for Dynamic/Stealth tiers (Playwright):**
   ```bash
   playwright install chromium
   ```

4. **Verify Scrapling installation:**
   ```bash
   ~/.venvs/scrapling/bin/python3 -c "import scrapling; print(f'Scrapling {scrapling.__version__} OK')"
   ```

> 💡 **Tip**: You can point `dsh-webstack` to this Python interpreter using the `pythonBinary` configuration setting or by exporting `SCRAPLING_PYTHON="~/.venvs/scrapling/bin/python3"`.

### 3. DeepSeek Harness Integration

##### Method 1: Via Plugin Market / Package Manager
```bash
# In your DeepSeek Harness workspace:
pnpm add dsh-webstack
# or npm
npm install dsh-webstack
```

##### Method 2: Local Development Link
If you are developing or testing locally, link the repository inside your DeepSeek Harness profile (e.g., `~/.dsh/profiles/default/package.json`):

```json
{
  "dependencies": {
    "dsh-webstack": "link:/path/to/dsh-advanced-web-search"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-webstack"
      ]
    }
  }
}
```

---

## Configuration Reference

### Cordis Patch Layer (`cordis.patch.yml`)

The plugin includes an out-of-the-box patch layer. Apply it via your profile or load it directly into Cordis:

```yaml
# cordis.patch.yml

# 1. Route ctx.web to use dsh-webstack providers
- id: web
  config:
    searchProvider: searxng
    fetchProvider: scrapling

# 2. Configure model-facing bounds on tool-web (tuned for 27B local LLMs)
- id: tool-web
  config:
    fetch: true
    searchTimeoutMs: 30000
    searchMaxResults: 8
    searchMaxQueries: 4
    fetchMaxOutputChars: 50000

# 3. Mount and configure the dsh-webstack provider bundle
- insert:
    - id: dsh-webstack
      name: dsh-webstack
      config:
        searxng:
          baseURL: http://127.0.0.1:8080
          timeoutMs: 15000
        scrapling:
          pythonBinary: ~/.venvs/scrapling/bin/python3
          timeoutMs: 20000
          maxRedirects: 5
          maxResponseBytes: 5000000
          enableDynamicFallback: true
          enableStealthFallback: true
          stealthSolveCloudflare: true
          stealthHideCanvas: true
          stealthBlockWebRtc: true
          stealthAllowWebGl: true
          stealthGoogleSearch: true
          stealthBlockAds: true
          stealthRealChrome: true
          stealthTimeoutMs: 60000
```

---

### Detailed Options Catalog

#### SearXNG Search Options (`searxng`)

| Option | Type | Default | Environment Var | Description |
| :--- | :---: | :---: | :---: | :--- |
| `baseURL` | `string` | `http://127.0.0.1:8080` | `SEARXNG_URL` | Base endpoint of your SearXNG instance |
| `timeoutMs` | `number` | `15000` | — | Timeout for search queries in milliseconds |

#### Scrapling Fetch Options (`scrapling`)

| Option | Type | Default | Environment Var | Description |
| :--- | :---: | :---: | :---: | :--- |
| `pythonBinary` | `string` | `python3` | `SCRAPLING_PYTHON` | Path to the Python executable with Scrapling installed |
| `timeoutMs` | `number` | `20000` | — | HTTP fetch timeout in milliseconds |
| `maxRedirects` | `number` | `5` | — | Maximum same-origin redirects to traverse |
| `maxResponseBytes` | `number` | `5000000` | — | Maximum raw payload size before truncation (5MB default) |
| `enableDynamicFallback` | `boolean` | `true` | — | Enables Playwright Headless Chrome when static fetch fails or yields empty content |
| `enableStealthFallback` | `boolean` | `true` | — | Enables Tier 3 `StealthyFetcher` anti-bot bypass mode |
| `stealthSolveCloudflare` | `boolean` | `true` | — | Solves Cloudflare Turnstile / interstitial challenges automatically |
| `stealthHideCanvas` | `boolean` | `true` | — | Injects subtle noise into canvas data to defeat canvas fingerprinting |
| `stealthBlockWebRtc` | `boolean` | `true` | — | Restricts WebRTC to proxy UDP, preventing local IP leakage |
| `stealthAllowWebGl` | `boolean` | `true` | — | Keeps genuine WebGL rendering context active to prevent bot flags |
| `stealthGoogleSearch` | `boolean` | `true` | — | Camouflages requests with `https://www.google.com/` search referer |
| `stealthBlockAds` | `boolean` | `true` | — | Blocks ~3,500 ad and tracker domains to prevent telemetry bot detection |
| `stealthRealChrome` | `boolean` | `true` | — | Launches system-installed Google Chrome for authentic browser fingerprints |
| `stealthTimeoutMs` | `number` | `60000` | — | Extended timeout budget for interactive challenge solving |

#### Harness Tool Bounds (`tool-web`)

| Setting | Recommended Value | Impact on Local Reasoning LLMs |
| :--- | :---: | :--- |
| `fetchMaxOutputChars` | `50000` | Caps extracted page length; protects bounded 64k/90k context windows from saturation |
| `searchMaxResults` | `8` | Balances search diversity against context token consumption |
| `searchMaxQueries` | `4` | Prevents excessive parallel queries during multi-step reasoning |
| `searchTimeoutMs` | `30000` | Maximum wait budget allocated to the agent before declaring tool timeout |

---

## Standalone & Programmatic Usage

You can also use the providers directly in Node.js or TypeScript without running the full DeepSeek Harness runtime:

```typescript
import { SearxngSearchProvider } from "dsh-webstack/searxng";
import { ScraplingFetchProvider } from "dsh-webstack/scrapling";

// 1. Initialize SearXNG Search Provider
const searchProvider = new SearxngSearchProvider({
  baseURL: "http://127.0.0.1:8080",
  timeoutMs: 10000,
});

const searchResults = await searchProvider.search({
  query: "DeepSeek V3 tool calling API documentation",
});
console.log(`Found ${searchResults.sources.length} sources:`);
searchResults.sources.slice(0, 3).forEach((s) => console.log(`- [${s.title}](${s.url})`));

// 2. Initialize Scrapling Fetch Provider with Stealth Fallback
const fetchProvider = new ScraplingFetchProvider({
  pythonBinary: "/Users/kuba/.venvs/scrapling/bin/python3",
  enableStealthFallback: true,
  stealthSolveCloudflare: true,
});

const page = await fetchProvider.fetch({
  url: "https://news.ycombinator.com",
});

console.log(`HTTP ${page.status} (${page.body.contentType})`);
console.log(page.body.content.slice(0, 500));

// 3. Clean teardown when done
await fetchProvider.dispose();
```

---

## Troubleshooting & FAQ

<details>
<summary><strong>1. SearXNG returns <code>403 Forbidden</code> or "format json is not allowed"</strong></summary>

SearXNG instances disable JSON output by default for security. Open your `settings.yml` (located in your SearXNG config volume) and add `json` under `search.formats`:
```yaml
search:
  formats:
    - html
    - json
```
Restart SearXNG after saving changes.
</details>

<details>
<summary><strong>2. SearXNG returns <code>429 Too Many Requests</code></strong></summary>

SearXNG includes a built-in rate-limiter for public instances. When used as a private backend for local agents, disable it in `settings.yml`:
```yaml
server:
  limiter: false
```
</details>

<details>
<summary><strong>3. Scrapling reports "Python interpreter not found" or "No module named scrapling"</strong></summary>

Ensure your Python virtualenv has `scrapling` installed and point `dsh-webstack` to it:
* Set `pythonBinary: "/path/to/.venv/bin/python3"` in `cordis.patch.yml`, or
* Export `SCRAPLING_PYTHON="/path/to/.venv/bin/python3"` in your shell environment.
</details>

<details>
<summary><strong>4. Tier 2/Tier 3 fetch fails with "Browser executable not found"</strong></summary>

Dynamic and stealth tiers rely on Playwright Chromium. Ensure browser binaries are downloaded:
```bash
playwright install chromium
```
If using `stealthRealChrome: true`, ensure Google Chrome is installed on the host system.
</details>

<details>
<summary><strong>5. Private subnet / localhost URLs are blocked</strong></summary>

This is by design. `dsh-webstack` enforces strict enterprise SSRF security invariants. It rejects requests targeting loopback addresses (`127.0.0.1`), RFC 1918 private subnets (`10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`), and cloud metadata (`169.254.169.254`) with `WEB_BLOCKED_URL` in under 0.2ms.
</details>

---

## Verification & Test Suite

The repository maintains an automated test suite verifying search normalization, security filters, process hygiene, and live integration:

```bash
# Run the complete test suite (35 tests, 10 suites)
pnpm test

# Run isolated test suites
pnpm test:security      # SSRF validation, private IP blocking, redirect policies
pnpm test:searxng       # Query parameter encoding, response normalization
pnpm test:cancellation  # Signal cancellation, child process termination
pnpm test:integration   # Live HTTP fetch, redirect enforcement, Cordis seam

# Run the benchmark suite
pnpm run benchmark
```

---

## License

MIT © Kuba

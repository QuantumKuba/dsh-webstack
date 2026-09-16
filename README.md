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

## Quick Start

### 1. Install Plugin
```bash
# In your DeepSeek Harness workspace:
pnpm add dsh-webstack
# or via npm
npm install dsh-webstack
```

### 2. Configure SearXNG & Scrapling
* **SearXNG**: Deploy via Docker Compose with JSON enabled on `http://127.0.0.1:8080` (see [SearXNG Setup Guide](docs/searxng-setup.md)).
* **Scrapling**: Install into a virtual environment with stealth extras (see [Scrapling Setup Guide](docs/scrapling-setup.md)):
  ```bash
  pip install "scrapling[stealth]" && playwright install chromium
  ```

### 3. Mount Cordis Patch Layer
Apply `cordis.patch.yml` to your DeepSeek Harness profile to connect `ctx.web`:
```yaml
- id: web
  config:
    searchProvider: searxng
    fetchProvider: scrapling

- insert:
    - id: dsh-webstack
      name: dsh-webstack
      config:
        searxng:
          baseURL: http://127.0.0.1:8080
        scrapling:
          pythonBinary: python3
          enableDynamicFallback: true
          enableStealthFallback: true
```

---

## Documentation & Guides

Comprehensive guides and technical documentation are available in the [`docs/`](docs/) directory:

| Guide | Description |
| :--- | :--- |
| [**SearXNG Setup Guide**](docs/searxng-setup.md) | Official Docker Compose deployment, `settings.yml` tuning, secret key generation, and Valkey caching. |
| [**Scrapling Environment Setup**](docs/scrapling-setup.md) | Python 3.11+ virtual environment setup, Playwright Chromium installation, and sidecar verification. |
| [**Configuration Reference**](docs/configuration.md) | Complete Cordis patch layer, parameter catalog for SearXNG and Scrapling, and context bounds tuning. |
| [**Programmatic Usage Guide**](docs/programmatic-usage.md) | Standalone Node.js & TypeScript usage of `SearxngSearchProvider` and `ScraplingFetchProvider` without Harness. |
| [**Troubleshooting & FAQ**](docs/troubleshooting.md) | Solutions for 403 Forbidden, 429 rate limiting, missing Python paths, Playwright binaries, and SSRF blocks. |
| [**Benchmark Report**](benchmark/BENCHMARK_REPORT.md) | Empirical latency distributions, context token reduction stats, and SSRF security test telemetry. |

---

## Verification & Test Suite

The codebase maintains automated test coverage across search normalization, security filters, and live integration:

```bash
# Run the complete test suite (35 tests, 10 suites)
pnpm test

# Run focused test suites
pnpm test:security      # SSRF validation, private IP blocking, redirect policies
pnpm test:searxng       # Query parameter encoding, response normalization
pnpm test:cancellation  # Signal cancellation, child process termination
pnpm test:integration   # Live HTTP fetch, redirect enforcement, Cordis seam

# Run empirical benchmark suite
pnpm run benchmark
```

---

## License

MIT © Kuba

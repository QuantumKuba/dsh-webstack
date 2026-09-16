# Configuration Reference Guide

This document details all configuration options for **`dsh-webstack`**, including **SearXNG**, **Scrapling multi-tier fetching**, and model-facing bounds on DeepSeek Harness's `tool-web`.

---

## 1. Complete Patch Layer (`cordis.patch.yml`)

`dsh-webstack` ships with a complete Cordis configuration patch layer:

```yaml
# cordis.patch.yml

# 1. Direct ctx.web to use dsh-webstack providers
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
          pythonBinary: python3
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

## 2. SearXNG Configuration (`searxng`)

Controls how the search provider communicates with your local or remote SearXNG metasearch instance:

| Parameter | Type | Default | Environment Var | Description |
| :--- | :---: | :---: | :---: | :--- |
| `baseURL` | `string` | `http://127.0.0.1:8080` | `SEARXNG_URL` | Base URL of your SearXNG instance. Must include protocol and port. |
| `timeoutMs` | `number` | `15000` | — | HTTP request timeout in milliseconds for upstream search execution. |

---

## 3. Scrapling Fetch Configuration (`scrapling`)

Controls HTTP retrieval, Playwright headless execution, and stealth bypass mechanisms:

### Core Fetch Settings

| Parameter | Type | Default | Environment Var | Description |
| :--- | :---: | :---: | :---: | :--- |
| `pythonBinary` | `string` | `python3` | `SCRAPLING_PYTHON` | Absolute or relative path to the Python binary with Scrapling installed. |
| `timeoutMs` | `number` | `20000` | — | Default HTTP fetch timeout in milliseconds for Tier 1 requests. |
| `maxRedirects` | `number` | `5` | — | Maximum same-origin redirects to follow before terminating with error. |
| `maxResponseBytes` | `number` | `5000000` | — | Maximum response payload size in bytes (5 MB default). Content beyond this is safely truncated. |

### Progressive Fallback Toggles

| Parameter | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `enableDynamicFallback` | `boolean` | `true` | When `true`, automatically escalates to Tier 2 (Playwright Headless Chrome) if a static HTTP fetch returns empty DOM or client-side JavaScript shells. |
| `enableStealthFallback` | `boolean` | `true` | When `true`, automatically escalates to Tier 3 (`StealthyFetcher`) if anti-bot protections or Cloudflare Turnstile are encountered. |

### Tier 3 Stealth & Anti-Bot Tuning

| Parameter | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `stealthSolveCloudflare` | `boolean` | `true` | Detects Cloudflare Turnstile iframes and performs randomized, humanized coordinate clicks to solve challenges. |
| `stealthHideCanvas` | `boolean` | `true` | Injects randomized noise into canvas image data to prevent fingerprint hashing. |
| `stealthBlockWebRtc` | `boolean` | `true` | Forces WebRTC to proxy UDP, preventing real local IP and STUN leakage. |
| `stealthAllowWebGl` | `boolean` | `true` | Maintains authentic WebGL 2.0 rendering contexts to avoid automated bot classification. |
| `stealthGoogleSearch` | `boolean` | `true` | Adds `https://www.google.com/` search referer headers to mimic authentic organic traffic. |
| `stealthBlockAds` | `boolean` | `true` | Blocks ~3,500 tracking and advertising domains to prevent telemetry scripts from detecting automated sessions. |
| `stealthRealChrome` | `boolean` | `true` | Utilizes the system's Google Chrome installation instead of stock Chromium for genuine codec and font fingerprints. |
| `stealthTimeoutMs` | `number` | `60000` | Dedicated timeout window for interactive challenges (e.g. Turnstile solving). |

---

## 4. DeepSeek Harness Tool Bounds (`tool-web`)

These settings configure `dsh-tool-web` (the seam between the Cordis runtime and the LLM). They are critical when using local reasoning models (such as **Qwen 3.8 27B** or **DeepSeek R1/V3**):

| Setting | Default | Recommended | Rationale for Local Reasoning Models |
| :--- | :---: | :---: | :--- |
| `fetchMaxOutputChars` | `200000` | `50000` | Caps the extracted markdown characters passed to the model. Prevents large web pages from saturating 64k/90k context windows. |
| `searchMaxResults` | `5` | `8` | Controls the maximum number of search sources returned per query. 8 provides high recall without context bloat. |
| `searchMaxQueries` | `3` | `4` | Allows the model to issue up to 4 parallel search queries in multi-step planning loops. |
| `searchTimeoutMs` | `20000` | `30000` | Gives upstream SearXNG engines adequate time to respond during high network latency. |

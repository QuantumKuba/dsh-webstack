# Scrapling Environment & Dependencies Setup

This guide explains how to configure the **Python 3.11+** environment and **Scrapling** sidecar required by `dsh-webstack` for Tier 1, Tier 2, and Tier 3 web retrieval.

---

## 1. Overview

`dsh-webstack` integrates [Scrapling](https://github.com/D4Vinci/Scrapling) as an ephemeral micro-sidecar running over an OS-allocated local loopback port (`127.0.0.1:0`).

The sidecar provides:
* **Tier 1 (Fast HTTP)**: HTTP/TLS fingerprint impersonation via `curl_cffi` (~530ms latency).
* **Tier 2 (Dynamic DOM)**: Headless Playwright Chromium for client-side rendered Single-Page Applications (SPAs).
* **Tier 3 (Stealth Mode)**: Anti-bot bypass with automated Cloudflare Turnstile solving, canvas noise injection, WebRTC IP leakage shielding, and Google referer spoofing.

---

## 2. Prerequisites

* **Python**: `3.11` or higher.
* **Pip**: Updated to latest (`pip install --upgrade pip`).
* Optional: Google Chrome installed on the host system (for `stealthRealChrome: true`).

---

## 3. Step-by-Step Installation

### Step 1: Create a Dedicated Virtual Environment

To prevent library conflicts, isolate Scrapling in a dedicated virtual environment:

```bash
# Create virtual environment
python3 -m venv ~/.venvs/scrapling

# Activate virtual environment
source ~/.venvs/scrapling/bin/activate
```

### Step 2: Install Scrapling with Stealth Dependencies

Install Scrapling along with its stealth and browser automation extras:

```bash
pip install --upgrade pip
pip install "scrapling[stealth]"
```

### Step 3: Install Playwright Chromium

If you plan to use Tier 2 (Dynamic DOM) or Tier 3 (Stealth bypass) for JavaScript SPAs or Cloudflare Turnstile challenges, install the Playwright Chromium browser binary:

```bash
playwright install chromium
```

> 🐧 **Linux Users**: If you are running in a minimal Linux or container environment, also install browser OS dependencies:
> ```bash
> playwright install-deps chromium
> ```

---

## 4. Verification

Verify that Scrapling and its browser components are functioning correctly:

```bash
~/.venvs/scrapling/bin/python3 -c "import scrapling; print(f'✅ Scrapling version: {scrapling.__version__}')"
```

Verify Playwright browser availability:
```bash
~/.venvs/scrapling/bin/python3 -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); b = p.chromium.launch(headless=True); print('✅ Chromium launched successfully'); b.close(); p.stop()"
```

---

## 5. Wiring Scrapling to `dsh-webstack`

You can inform `dsh-webstack` where your Python binary is located through either configuration or environment variables:

### Option A: Via `cordis.patch.yml` (Recommended)
```yaml
- insert:
    - id: dsh-webstack
      name: dsh-webstack
      config:
        scrapling:
          pythonBinary: /Users/kuba/.venvs/scrapling/bin/python3
```

### Option B: Via Environment Variable
Export `SCRAPLING_PYTHON` in your shell profile (`~/.zshrc`, `~/.bashrc`, or systemd environment):
```bash
export SCRAPLING_PYTHON="/Users/kuba/.venvs/scrapling/bin/python3"
```

### Resolution Precedence
`dsh-webstack` resolves the Python binary in the following order:
1. `config.scrapling.pythonBinary` (from `cordis.patch.yml`)
2. `process.env.SCRAPLING_PYTHON`
3. Fallback to system `python3` (on `PATH`)

---

## 6. Manual Micro-Sidecar Diagnostics

The sidecar script is located at `python/scrapling_sidecar.py`. You can test it standalone to verify startup and dynamic port binding:

```bash
# In the dsh-webstack project directory:
~/.venvs/scrapling/bin/python3 python/scrapling_sidecar.py
```

Expected startup output on stdout:
```json
{"status": "ready", "port": 54321, "pid": 12345}
```
*(Press `Ctrl+C` to cleanly exit.)*

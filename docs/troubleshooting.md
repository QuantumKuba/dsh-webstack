# Troubleshooting & FAQ

This guide provides diagnostics and solutions for common operational issues encountered with **SearXNG**, **Scrapling**, and **dsh-webstack**.

---

## 1. SearXNG Issues

### Error: `403 Forbidden` / `"format json is not allowed"`
* **Cause**: SearXNG disables JSON API formatting by default for public web security.
* **Solution**: Edit your SearXNG `settings.yml` (located in `./core-config/settings.yml`) and ensure `json` is included under `search.formats`:
  ```yaml
  search:
    formats:
      - html
      - json
  ```
  Restart the container:
  ```bash
  docker compose restart
  ```

---

### Error: `429 Too Many Requests`
* **Cause**: SearXNG's default rate-limiter is triggering during rapid, multi-step search loops from local LLMs.
* **Solution**: In `settings.yml`, disable the limiter for private local access:
  ```yaml
  server:
    limiter: false
  ```
  Restart SearXNG with `docker compose restart`.

---

### Error: `WEB_PROVIDER_ERROR: SearXNG returned HTTP 500`
* **Cause**: None of the configured upstream search engines returned results, or SearXNG encountered an internal network issue.
* **Solution**:
  1. Inspect live container logs:
     ```bash
     docker compose logs -f core
     ```
  2. Verify your internet connection.
  3. Ensure active engines (Google, DuckDuckGo, Bing) are not being blocked by upstream captchas.

---

## 2. Scrapling & Sidecar Issues

### Error: `Python executable not found` or `No module named scrapling`
* **Cause**: `dsh-webstack` is invoking system `python3` instead of the virtual environment where Scrapling is installed.
* **Solution**:
  * Set `scrapling.pythonBinary` explicitly in `cordis.patch.yml`:
    ```yaml
    scrapling:
      pythonBinary: /path/to/.venv/bin/python3
    ```
  * Or export the environment variable in your terminal:
    ```bash
    export SCRAPLING_PYTHON="/path/to/.venv/bin/python3"
    ```

---

### Error: `BrowserType.launch: Executable doesn't exist at ...`
* **Cause**: Tier 2 (Dynamic Playwright) or Tier 3 (Stealth) was triggered, but the Playwright Chromium browser binary has not been installed.
* **Solution**: Run the following command inside your virtual environment:
  ```bash
  playwright install chromium
  ```
  On minimal Linux distributions, also install system dependencies:
  ```bash
  playwright install-deps chromium
  ```

---

### Error: `Timed out waiting for Scrapling sidecar to start`
* **Cause**: The Python sidecar process failed to launch or could not bind to an ephemeral port within `startupTimeoutMs` (default: 10,000ms).
* **Solution**:
  1. Run the sidecar manually to view Python traceback:
     ```bash
     /path/to/.venv/bin/python3 python/scrapling_sidecar.py
     ```
  2. Ensure you are using Python 3.11 or higher.

---

## 3. Security & URL Rejection Issues

### Why are `http://127.0.0.1:8000` or `http://192.168.1.1` blocked?
* **Cause**: `dsh-webstack` implements strict enterprise SSRF defenses. By design, it rejects all requests to:
  * Loopback addresses (`127.0.0.0/8`, `::1`)
  * RFC 1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
  * Cloud metadata endpoints (`169.254.169.254`)
  * Carrier-grade NAT (`100.64.0.0/10`)
* **Behavior**: Rejection occurs in `< 0.2ms` before socket connection, throwing `WEB_BLOCKED_URL`. This behavior is intentional to prevent model hallucinations from querying internal host services or local LLM inference ports.

---

### Error: `WEB_REDIRECT_BLOCKED`
* **Cause**: An HTTP redirect attempted to change origin (e.g., from `https://sub.example.com` to `https://evil.com` or from `http:` to `https:`).
* **Solution**: `dsh-webstack` enforces strict same-origin redirect policies to maintain security invariants. If cross-origin navigation is required, the LLM should issue a new explicit `web_fetch` call to the target URL.

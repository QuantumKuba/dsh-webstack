# SearXNG Setup Guide

This guide walks you through deploying and configuring a private **SearXNG** metasearch instance using the official Docker Compose deployment pattern, specifically optimized for **DeepSeek Harness** (`dsh-webstack`).

---

## 1. Prerequisites

* **Docker Engine** ($\ge 20.10$) and **Docker Compose** plugin ($\ge 2.0$).
* Outbound internet access for SearXNG to query upstream search engines (Bing, DuckDuckGo, Google, GitHub, etc.).

---

## 2. Quick Deployment (Docker Compose)

Follow the official [SearXNG Container Deployment](https://docs.searxng.org/admin/installation-docker.html#installation-container) workflow:

### Step 1: Create Directory & Fetch Official Templates

```bash
# Create directories for SearXNG and its configuration volume
mkdir -p ~/searxng/core-config
cd ~/searxng

# Download official compose template and environment defaults
curl -fsSL \
  -O https://raw.githubusercontent.com/searxng/searxng/master/container/docker-compose.yml \
  -O https://raw.githubusercontent.com/searxng/searxng/master/container/.env.example
```

### Step 2: Initialize Environment File (`.env`)

```bash
cp -i .env.example .env
```

Open `.env` and set `SEARXNG_HOST` to bind to loopback (`127.0.0.1`) so SearXNG is only accessible locally:

```bash
# Listen to loopback only (safe for local agent consumption)
SEARXNG_HOST=127.0.0.1
SEARXNG_PORT=8080
```

---

## 3. Configuration (`core-config/settings.yml`)

SearXNG requires a secret key and specific adjustments to serve programmatic AI agent harnesses.

Create or update `core-config/settings.yml`:

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

# Enable or customize search engines
engines:
  - name: bing
    engine: bing
    disabled: false
  - name: duckduckgo
    engine: duckduckgo
    disabled: false
  - name: google
    engine: google
    disabled: false
  - name: github
    engine: github
    disabled: false
    categories: [general, it]
  - name: npm
    engine: npm
    disabled: false
    categories: [general, it]
  - name: pypi
    engine: pypi
    disabled: false
    categories: [general, it]
  - name: brave
    engine: brave
    disabled: false
  - name: qwant
    engine: qwant
    disabled: false
```

### Generate Secret Key
You can replace the placeholder secret key automatically with `openssl`:
```bash
# On macOS:
sed -i '' -e "s/GENERATE_A_RANDOM_SECRET_KEY_HERE/$(openssl rand -hex 32)/g" core-config/settings.yml

# On Linux:
sed -i -e "s/GENERATE_A_RANDOM_SECRET_KEY_HERE/$(openssl rand -hex 32)/g" core-config/settings.yml
```

---

## 4. Starting the Service

The official template includes both `searxng-core` and `searxng-valkey` (a Redis-compatible in-memory store for result caching):

```bash
docker compose up -d
```

Check the status of the containers:
```bash
docker compose ps
```

Expected output:
```
NAME              IMAGE                            STATUS         PORTS
searxng-core      docker.io/searxng/searxng:...   Up             127.0.0.1:8080->8080/tcp
searxng-valkey    docker.io/valkey/valkey:...     Up             6379/tcp
```

---

## 5. Verification & Testing

Verify that the JSON search API returns valid results:

```bash
curl -s "http://127.0.0.1:8080/search?q=deepseek+harness&format=json" | grep -q "results" && echo "✅ SearXNG is online and returning JSON!"
```

To view a pretty-printed sample result:
```bash
curl -s "http://127.0.0.1:8080/search?q=deepseek&format=json" | jq '.results[0] | {title, url, engines}'
```

---

## 6. Container Lifecycle Management

```bash
# View live container logs
docker compose logs -f core

# Restart after modifying settings.yml
docker compose restart

# Pull updated container images
docker compose pull && docker compose up -d

# Stop and remove containers
docker compose down
```

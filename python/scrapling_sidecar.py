#!/usr/bin/env python3
"""
Scrapling Micro-Sidecar for DeepSeek Harness (ctx.web)
Binds to an ephemeral port on 127.0.0.1 (127.0.0.1:0) and announces readiness via stdout.
Provides high-performance Tier 1 (curl_cffi), Tier 2 (Dynamic Playwright Chrome),
and Tier 3 (Stealth) retrieval behind the Node.js SSRF gatekeeper.
"""

import sys
import os
import json
import signal
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# Import Scrapling fetchers
try:
    from scrapling.fetchers import Fetcher, DynamicFetcher, StealthyFetcher
    from curl_cffi.curl import CurlError
except ImportError as e:
    sys.stderr.write(f"Failed to import Scrapling dependencies: {e}\n")
    sys.exit(1)


class ScraplingRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        # Suppress default request logging to keep stdout/stderr clean for IPC
        pass

    def _send_json(self, status_code: int, data: dict):
        response_bytes = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_GET(self):
        if self.path == "/healthz":
            self._send_json(200, {"status": "ok", "pid": os.getpid()})
        else:
            self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        if self.path == "/shutdown":
            self._send_json(200, {"status": "shutting_down"})
            threading.Thread(target=self.server.shutdown).start()
            return

        if self.path == "/fetch":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body_bytes = self.rfile.read(content_length)
                request_data = json.loads(body_bytes.decode("utf-8"))
            except Exception as parse_err:
                self._send_json(400, {"error": f"Invalid JSON payload: {parse_err}"})
                return

            self.handle_fetch(request_data)
        else:
            self._send_json(404, {"error": "Not Found"})

    def handle_fetch(self, data: dict):
        url = data.get("url")
        if not url:
            self._send_json(400, {"error": "Missing 'url' parameter"})
            return

        mode = data.get("mode", "http")
        timeout_ms = data.get("timeout_ms", 30000)
        timeout_sec = float(timeout_ms) / 1000.0
        follow_redirects = data.get("follow_redirects", False)
        network_idle = data.get("network_idle", True)
        disable_resources = data.get("disable_resources", False)

        try:
            if mode == "http":
                # Tier 1: Cheap HTTP with browser impersonation
                res = Fetcher.get(
                    url,
                    timeout=timeout_sec,
                    follow_redirects=follow_redirects,
                    impersonate="chrome",
                )

                # Extract content
                html = str(res.html_content) if hasattr(res, "html_content") and res.html_content else ""
                text = str(res.text) if hasattr(res, "text") and res.text else ""

                headers_dict = dict(res.headers) if hasattr(res, "headers") and res.headers else {}
                # Normalize header keys to lowercase
                lower_headers = {str(k).lower(): str(v) for k, v in headers_dict.items()}

                self._send_json(
                    200,
                    {
                        "statusCode": int(res.status),
                        "url": str(res.url),
                        "headers": lower_headers,
                        "html": html,
                        "text": text,
                        "encoding": getattr(res, "encoding", "utf-8"),
                    },
                )

            elif mode == "dynamic":
                # Tier 2: Dynamic Playwright with Chrome
                timeout_playwright = int(timeout_ms)
                res = DynamicFetcher.fetch(
                    url,
                    headless=True,
                    timeout=timeout_playwright,
                    network_idle=network_idle,
                    real_chrome=True,
                    disable_resources=disable_resources,
                )

                html = str(res.html_content) if hasattr(res, "html_content") and res.html_content else ""
                text = str(res.text) if hasattr(res, "text") and res.text else ""
                headers_dict = dict(res.headers) if hasattr(res, "headers") and res.headers else {}
                lower_headers = {str(k).lower(): str(v) for k, v in headers_dict.items()}

                self._send_json(
                    200,
                    {
                        "statusCode": int(res.status),
                        "url": str(res.url),
                        "headers": lower_headers,
                        "html": html,
                        "text": text,
                        "encoding": "utf-8",
                    },
                )

            elif mode == "stealth":
                # Tier 3: Stealth browser
                timeout_playwright = int(timeout_ms)
                res = StealthyFetcher.fetch(
                    url,
                    headless=True,
                    timeout=timeout_playwright,
                    network_idle=network_idle,
                    real_chrome=True,
                    solve_cloudflare=True,
                )

                html = str(res.html_content) if hasattr(res, "html_content") and res.html_content else ""
                text = str(res.text) if hasattr(res, "text") and res.text else ""
                headers_dict = dict(res.headers) if hasattr(res, "headers") and res.headers else {}
                lower_headers = {str(k).lower(): str(v) for k, v in headers_dict.items()}

                self._send_json(
                    200,
                    {
                        "statusCode": int(res.status),
                        "url": str(res.url),
                        "headers": lower_headers,
                        "html": html,
                        "text": text,
                        "encoding": "utf-8",
                    },
                )
            else:
                self._send_json(400, {"error": f"Unsupported mode: {mode}"})

        except Exception as fetch_err:
            err_name = type(fetch_err).__name__
            err_msg = str(fetch_err)

            # Classify timeouts
            is_timeout = "timeout" in err_msg.lower() or "timed out" in err_msg.lower() or err_name == "TimeoutError"

            self._send_json(
                200,
                {
                    "error": err_msg,
                    "error_type": err_name,
                    "is_timeout": is_timeout,
                },
            )


def main():
    # Signal handlers for clean exit
    def sig_handler(signum, frame):
        sys.exit(0)

    signal.signal(signal.SIGTERM, sig_handler)
    signal.signal(signal.SIGINT, sig_handler)

    # Bind to ephemeral port on 127.0.0.1
    server = ThreadingHTTPServer(("127.0.0.1", 0), ScraplingRequestHandler)
    assigned_port = server.server_address[1]

    # Handshake to stdout
    handshake = {
        "status": "ready",
        "port": assigned_port,
        "pid": os.getpid(),
    }
    sys.stdout.write(json.dumps(handshake) + "\n")
    sys.stdout.flush()

    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

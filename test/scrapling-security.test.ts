import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { WebError } from "@deepseek-ai/dsh-web";
import {
  parseFetchUrl,
  validateFetchUrl,
  isPublicIpAddress,
  resolvePublicAddresses,
  isSameOrigin,
  resolveRedirect,
  WEB_FETCH_MAX_URL_LENGTH,
} from "../src/scrapling/security.js";

describe("Scrapling Safe-URL & SSRF Security Tests", () => {
  describe("URL Parsing & Validation", () => {
    it("accepts valid http and https URLs", () => {
      const u1 = validateFetchUrl("http://example.com/test");
      assert.equal(u1.protocol, "http:");
      assert.equal(u1.hostname, "example.com");

      const u2 = validateFetchUrl("https://example.com:8443/api?q=1");
      assert.equal(u2.protocol, "https:");
      assert.equal(u2.hostname, "example.com");
      assert.equal(u2.port, "8443");
    });

    it("rejects non-http/https schemes with WEB_INVALID_URL", () => {
      const forbidden = [
        "ftp://example.com",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "gopher://example.com",
        "ws://example.com",
      ];

      for (const url of forbidden) {
        assert.throws(
          () => validateFetchUrl(url),
          (err: any) => {
            assert.ok(err instanceof WebError);
            assert.equal(err.code, "WEB_INVALID_URL");
            assert.match(err.message, /unsupported URL scheme/i);
            return true;
          }
        );
      }
    });

    it("rejects credentials in URLs with WEB_BLOCKED_URL", () => {
      const urlsWithCreds = [
        "http://user:password@example.com",
        "https://admin@example.com/secret",
        "http://:password@example.com",
      ];

      for (const url of urlsWithCreds) {
        assert.throws(
          () => validateFetchUrl(url),
          (err: any) => {
            assert.ok(err instanceof WebError);
            assert.equal(err.code, "WEB_BLOCKED_URL");
            assert.match(err.message, /credentials/i);
            return true;
          }
        );
      }
    });

    it("rejects URLs exceeding WEB_FETCH_MAX_URL_LENGTH (2048 chars)", () => {
      const longUrl = "https://example.com/" + "a".repeat(2050);
      assert.throws(
        () => validateFetchUrl(longUrl),
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_INVALID_URL");
          assert.match(err.message, /exceeds the maximum length/i);
          return true;
        }
      );
    });
  });

  describe("Public IP & Subnet Classification", () => {
    it("classifies public unicast IP addresses as safe", () => {
      const publicIps = [
        "8.8.8.8",
        "1.1.1.1",
        "93.184.216.34",
        "2606:2800:220:1:248:1893:25c8:1946",
      ];

      for (const ip of publicIps) {
        assert.equal(isPublicIpAddress(ip), true, `Expected ${ip} to be public`);
      }
    });

    it("blocks loopback, private RFC1918, link-local, and cloud metadata IPs", () => {
      const blockedIps = [
        "127.0.0.1",
        "127.0.0.2",
        "127.1.2.3",
        "::1",
        "10.0.0.1",
        "10.254.0.1",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.1",
        "192.168.0.254",
        "169.254.169.254", // AWS/GCP/Azure instance metadata
        "169.254.1.1",
        "fe80::1",
        "100.64.0.1", // CGNAT RFC 6598
        "::ffff:127.0.0.1", // IPv4-mapped loopback
        "::ffff:10.0.0.1", // IPv4-mapped private
        "::ffff:169.254.169.254", // IPv4-mapped cloud metadata
      ];

      for (const ip of blockedIps) {
        assert.equal(isPublicIpAddress(ip), false, `Expected ${ip} to be blocked`);
      }
    });
  });

  describe("resolvePublicAddresses Pre-flight DNS & IP Pinning", () => {
    it("rejects loopback IP literals with WEB_BLOCKED_URL", async () => {
      await assert.rejects(
        async () => {
          await resolvePublicAddresses("127.0.0.1");
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_BLOCKED_URL");
          assert.match(err.message, /non-public IP address/i);
          return true;
        }
      );
    });

    it("rejects cloud metadata IP literals with WEB_BLOCKED_URL", async () => {
      await assert.rejects(
        async () => {
          await resolvePublicAddresses("169.254.169.254");
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_BLOCKED_URL");
          assert.match(err.message, /non-public IP address/i);
          return true;
        }
      );
    });

    it("rejects private RFC1918 literals with WEB_BLOCKED_URL", async () => {
      await assert.rejects(
        async () => {
          await resolvePublicAddresses("192.168.1.1");
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_BLOCKED_URL");
          assert.match(err.message, /non-public IP address/i);
          return true;
        }
      );
    });

    it("rejects hostname that resolves to private IP using mock resolver", async () => {
      const mockResolver: any = async () => [
        { address: "10.0.0.5", family: 4 },
      ];

      await assert.rejects(
        async () => {
          await resolvePublicAddresses("internal-corp.local", undefined, mockResolver);
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_BLOCKED_URL");
          assert.match(err.message, /non-public IP address/i);
          return true;
        }
      );
    });

    it("rejects hostname if ANY resolved address is private (split-horizon defense)", async () => {
      const mockResolver: any = async () => [
        { address: "93.184.216.34", family: 4 }, // public
        { address: "127.0.0.1", family: 4 }, // loopback poisoned
      ];

      await assert.rejects(
        async () => {
          await resolvePublicAddresses("evil-rebind.com", undefined, mockResolver);
        },
        (err: any) => {
          assert.ok(err instanceof WebError);
          assert.equal(err.code, "WEB_BLOCKED_URL");
          assert.match(err.message, /non-public IP address/i);
          return true;
        }
      );
    });

    it("accepts hostname when all resolved addresses are public", async () => {
      const mockResolver: any = async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ];

      const addrs = await resolvePublicAddresses("example.com", undefined, mockResolver);
      assert.equal(addrs.length, 2);
      assert.equal(addrs[0].address, "93.184.216.34");
    });
  });

  describe("Same-Origin Redirect Policy", () => {
    it("identifies matching origins correctly", () => {
      const o1 = new URL("https://example.com/path1");
      const o2 = new URL("https://example.com/path2?foo=bar");
      assert.equal(isSameOrigin(o1, o2), true);
    });

    it("identifies cross-origin differences correctly", () => {
      const base = new URL("https://example.com/page");

      // Scheme difference
      assert.equal(isSameOrigin(base, new URL("http://example.com/page")), false);
      // Hostname difference
      assert.equal(isSameOrigin(base, new URL("https://sub.example.com/page")), false);
      assert.equal(isSameOrigin(base, new URL("https://other.com/page")), false);
      // Port difference
      assert.equal(isSameOrigin(base, new URL("https://example.com:8443/page")), false);
    });

    it("resolves relative and absolute redirect locations", () => {
      const base = new URL("https://example.com/docs/intro");

      const r1 = resolveRedirect("/api/v1", base);
      assert.equal(r1.toString(), "https://example.com/api/v1");

      const r2 = resolveRedirect("../about", base);
      assert.equal(r2.toString(), "https://example.com/about");

      const r3 = resolveRedirect("https://example.com/absolute", base);
      assert.equal(r3.toString(), "https://example.com/absolute");
    });
  });
});

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { WebError } from "@deepseek-ai/dsh-web";

export const WEB_FETCH_MAX_URL_LENGTH = 2048;

/** RFC 6052 prefix lengths that may carry an IPv4 destination through NAT64. */
const RFC6052_PREFIX_LENGTHS = [32, 40, 48, 56, 64, 96];
const IPV4ONLY_DISCOVERY_HOST = "ipv4only.arpa";
const IPV4ONLY_SENTINELS = new Set(["192.0.0.170", "192.0.0.171"]);

export interface AddressEntry {
  readonly address: string;
  readonly family: number;
}

/**
 * Remove brackets from IPv6 hostnames if present.
 */
export function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Return whether an address is globally reachable public unicast.
 * Blocks private, loopback, link-local, carrier-grade NAT, and cloud metadata.
 */
export function isPublicIpAddress(input: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    parsed = ipaddr.parse(stripIpv6Brackets(input));
  } catch {
    return false;
  }

  if (parsed instanceof ipaddr.IPv4) {
    return parsed.range() === "unicast";
  }
  if (parsed.isIPv4MappedAddress()) {
    return parsed.toIPv4Address().range() === "unicast";
  }
  return parsed.range() === "unicast";
}

/**
 * Parse a request URL and enforce network-independent restrictions:
 * HTTP(S) only and no embedded credentials.
 */
export function parseFetchUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new WebError(`invalid URL: ${input}`, "WEB_INVALID_URL", { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebError(
      `unsupported URL scheme "${url.protocol}" (only http and https are allowed)`,
      "WEB_INVALID_URL"
    );
  }

  if (url.username.length > 0 || url.password.length > 0) {
    throw new WebError("credentials in URLs are not allowed", "WEB_BLOCKED_URL");
  }

  return url;
}

/**
 * Validate a request URL against provider policy:
 * bounded length (<= 2048) and valid HTTP(S) format without credentials.
 */
export function validateFetchUrl(input: string): URL {
  if (input.length > WEB_FETCH_MAX_URL_LENGTH) {
    throw new WebError(
      `URL exceeds the maximum length of ${WEB_FETCH_MAX_URL_LENGTH}`,
      "WEB_INVALID_URL"
    );
  }
  return parseFetchUrl(input);
}

/**
 * Resolve a hostname and reject the answer set if any destination is not public.
 */
export async function resolvePublicAddresses(
  hostname: string,
  signal?: AbortSignal,
  resolver: typeof lookup = lookup
): Promise<readonly AddressEntry[]> {
  const unbracketed = stripIpv6Brackets(hostname);
  const literalFamily = isIP(unbracketed);

  let resolved: { address: string; family: number }[];
  if (literalFamily === 0) {
    resolved = await raceWithSignal(
      resolver(unbracketed, { all: true, order: "verbatim" }),
      signal
    );
  } else {
    resolved = [{ address: unbracketed, family: literalFamily }];
  }

  if (resolved.length === 0) {
    throw new WebError(`hostname "${hostname}" resolved to no addresses`, "WEB_PROVIDER_ERROR");
  }

  const nat64Prefixes = resolved.some(
    (entry) => entry.family === 6 && isIP(entry.address) === 6
  )
    ? await discoverNat64Prefixes(signal, resolver)
    : [];

  const addresses: AddressEntry[] = [];
  for (const entry of resolved) {
    if (
      (entry.family !== 4 && entry.family !== 6) ||
      isIP(entry.address) !== entry.family
    ) {
      throw new WebError(
        `hostname "${hostname}" resolved to an invalid IP address`,
        "WEB_PROVIDER_ERROR"
      );
    }

    if (!isPublicIpAddress(entry.address)) {
      throw new WebError(
        `URL hostname "${hostname}" resolves to a non-public IP address`,
        "WEB_BLOCKED_URL"
      );
    }

    const translatedIpv4 = translatedIpv4Address(entry.address, nat64Prefixes);
    if (translatedIpv4 !== undefined && !isPublicIpAddress(translatedIpv4)) {
      throw new WebError(
        `URL hostname "${hostname}" resolves through NAT64 to a non-public IPv4 address`,
        "WEB_BLOCKED_URL"
      );
    }

    addresses.push({ address: entry.address, family: entry.family });
  }

  return addresses;
}

/**
 * Discover the active DNS64 prefix set using RFC 7050's reserved hostname.
 */
async function discoverNat64Prefixes(
  signal?: AbortSignal,
  resolver: typeof lookup = lookup
): Promise<{ bytes: number[]; length: number }[]> {
  let discovered: { address: string; family: number }[];
  try {
    discovered = await raceWithSignal(
      resolver(IPV4ONLY_DISCOVERY_HOST, { all: true, order: "verbatim" }),
      signal
    );
  } catch {
    // If NAT64 discovery fails, assume no prefixes
    return [];
  }

  const prefixes: { bytes: number[]; length: number }[] = [];
  const seen = new Set<string>();

  for (const entry of discovered) {
    if (entry.family !== 6 || isIP(entry.address) !== 6) continue;
    let bytes: number[];
    try {
      bytes = ipaddr.parse(entry.address).toByteArray();
    } catch {
      continue;
    }

    for (const length of RFC6052_PREFIX_LENGTHS) {
      const embedded = embeddedIpv4Address(bytes, length);
      if (embedded === undefined || !IPV4ONLY_SENTINELS.has(embedded)) continue;
      const prefixBytes = bytes.slice(0, length / 8);
      const key = `${String(length)}:${prefixBytes.join(".")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prefixes.push({ bytes: prefixBytes, length });
    }
  }

  return prefixes;
}

/**
 * Return the RFC 6052-embedded IPv4 address when an IPv6 address matches a discovered prefix.
 */
function translatedIpv4Address(
  input: string,
  prefixes: readonly { bytes: number[]; length: number }[]
): string | undefined {
  if (isIP(input) !== 6) return undefined;
  let bytes: number[];
  try {
    bytes = ipaddr.parse(input).toByteArray();
  } catch {
    return undefined;
  }

  for (const prefix of prefixes) {
    if (!prefix.bytes.every((byte, index) => bytes[index] === byte)) continue;
    const embedded = embeddedIpv4Address(bytes, prefix.length);
    if (embedded !== undefined) return embedded;
  }
}

/**
 * Extract one IPv4 address from an RFC 6052 IPv6 layout.
 */
function embeddedIpv4Address(bytes: number[], prefixLength: number): string | undefined {
  if (prefixLength === 96) return bytes.slice(12, 16).join(".");
  if (bytes[8] !== 0) return undefined;
  const prefixBytes = prefixLength / 8;
  const beforeReservedOctet = 8 - prefixBytes;
  return [
    ...bytes.slice(prefixBytes, prefixBytes + beforeReservedOctet),
    ...bytes.slice(9, 13 - beforeReservedOctet),
  ].join(".");
}

/**
 * Check if two URLs share the exact same origin (scheme, hostname, and port).
 */
export function isSameOrigin(a: URL, b: URL): boolean {
  return (
    a.protocol === b.protocol &&
    a.hostname === b.hostname &&
    a.port === b.port
  );
}

/**
 * Resolve a redirect location against the current URL.
 */
export function resolveRedirect(location: string, base: URL): URL {
  try {
    return new URL(location, base);
  } catch (error) {
    throw new WebError(`invalid redirect Location "${location}"`, "WEB_PROVIDER_ERROR", {
      cause: error,
    });
  }
}

/**
 * Race a promise with an AbortSignal.
 */
function raceWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  const abortError = () =>
    new WebError("web fetch aborted during hostname resolution", "WEB_ABORTED", {
      cause: signal.reason,
    });

  if (signal.aborted) return Promise.reject(abortError());

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", abort);
      });
  });
}

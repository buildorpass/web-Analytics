/**
 * Truncate IP before hashing to reduce re-identification risk.
 * IPv4: zero last octet. IPv6: keep first 48 bits.
 */
export function truncateIpForHash(ip: string): string {
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return parts.slice(0, 3).join(":") + "::";
  }
  const octets = ip.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  }
  return ip;
}

export function isPathExcluded(pathname: string, exclusions: string[]): boolean {
  return exclusions.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function sanitizeUtm(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  if (!trimmed || trimmed.length > 100) return null;
  // Allow only coarse campaign labels — no email-like or free-form PII patterns.
  if (!/^[a-zA-Z0-9._\- %]+$/i.test(trimmed)) return null;
  return trimmed;
}

export interface UtmParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

export function parseUtmParams(
  source?: string | null,
  medium?: string | null,
  campaign?: string | null
): UtmParams {
  return {
    utm_source: sanitizeUtm(source),
    utm_medium: sanitizeUtm(medium),
    utm_campaign: sanitizeUtm(campaign),
  };
}

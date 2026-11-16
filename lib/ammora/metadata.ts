import type { TokenMetadata } from "./types";

const ipfsGateway = (uri: string) => uri.replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/");

const pick = (o: Record<string, unknown>): TokenMetadata => {
  const s = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : undefined);
  const image = s("image") ?? s("imageUrl") ?? s("logo") ?? s("icon");
  return {
    name: s("name"),
    symbol: s("symbol"),
    description: s("description"),
    image: image ? (image.startsWith("ipfs://") ? ipfsGateway(image) : image) : undefined,
    website: s("website") ?? s("external_url"),
    twitter: s("twitter") ?? s("x"),
    telegram: s("telegram"),
  };
};

/**
 * Decode token metadata stored in the LaunchCreated metadataURI. Inline data: URIs are
 * decoded locally; remote http(s)/ipfs URIs are returned as a link only (fetched by callers
 * that choose to). Never throws; malformed metadata yields {}.
 */
export const parseInlineMetadata = (uri: string): TokenMetadata => {
  try {
    if (!uri) return {};
    if (uri.startsWith("data:")) {
      const comma = uri.indexOf(",");
      const header = uri.slice(5, comma);
      let body = uri.slice(comma + 1);
      if (header.includes("base64")) body = typeof atob === "function" ? atob(body) : Buffer.from(body, "base64").toString("utf8");
      else if (/%[0-9A-Fa-f]{2}/.test(body)) { try { body = decodeURIComponent(body); } catch { /* raw JSON */ } }
      return pick(JSON.parse(body));
    }
    if (uri.trim().startsWith("{")) return pick(JSON.parse(uri));
  } catch { /* fall through */ }
  return {};
};

export const isRemoteMetadata = (uri: string) => /^(https?:\/\/|ipfs:\/\/)/.test(uri);
export const resolveRemoteUri = (uri: string) => (uri.startsWith("ipfs://") ? ipfsGateway(uri) : uri);

export const parseRemoteMetadataJson = (json: unknown): TokenMetadata =>
  json && typeof json === "object" ? pick(json as Record<string, unknown>) : {};

/** Inline metadata document written by this app's Create flow. */
export const buildInlineMetadataURI = (m: TokenMetadata): string => {
  const doc: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (typeof v === "string" && v.trim()) doc[k] = v.trim();
  return `data:application/json;utf8,${JSON.stringify(doc)}`;
};

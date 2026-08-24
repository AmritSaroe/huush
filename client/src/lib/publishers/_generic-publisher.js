import { genericAdapter } from "../extractor/generic-adapter.js";

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function createGenericPublisherAdapter(id, hosts) {
  const acceptedHosts = new Set(hosts);
  return {
    id,
    matches(url) {
      const host = normalizedHost(url);
      return [...acceptedHosts].some((accepted) => host === accepted || host.endsWith(`.${accepted}`));
    },
    // The shared generic adapter supplies Readability/deep candidates. This hook
    // is intentionally empty until a publisher needs custom extraction rules.
    extractCandidates() {
      return [];
    },
    fallback: genericAdapter,
  };
}

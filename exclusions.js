"use strict";

// Shared by the MV3 background service worker and the extension settings page.
// Domains are compared by hostname, never by URL substring.
globalThis.RefreshExclusions = Object.freeze((() => {
  const MAX_DOMAINS = 100;
  const MAX_INPUT_LENGTH = 4096;
  const MAX_STORED_LENGTH = 4000;

  function normalizeDomain(input) {
    if (typeof input !== "string") return null;
    let value = input.trim();
    if (value.startsWith("*.")) value = value.slice(2);
    if (!value || /\s/.test(value) || value.startsWith("//")) return null;
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) && !/^https?:\/\//i.test(value)) return null;

    let url;
    try {
      url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
      return null;
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username || url.password) return null;

    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname || hostname.length > 253) return null;
    // URL() converts internationalized domains to ASCII (punycode).
    // Bracketed IPv6 literals are returned by URL.hostname as [::1].
    if (/^\[[0-9a-f:.]+\]$/.test(hostname)) return hostname;
    const labels = hostname.split(".");
    if (labels.some((label) => !label || label.length > 63 ||
        !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(label))) return null;
    return hostname;
  }

  function parseInput(input) {
    if (typeof input !== "string" || input.length > MAX_INPUT_LENGTH) {
      return { domains: [], error: "limit" };
    }
    const domains = [];
    const seen = new Set();
    for (const entry of input.split(/[,\r\n]+/).map((s) => s.trim()).filter(Boolean)) {
      const domain = normalizeDomain(entry);
      if (!domain) return { domains: [], error: "invalid", entry };
      if (!seen.has(domain)) {
        seen.add(domain);
        domains.push(domain);
      }
      if (domains.length > MAX_DOMAINS || domains.join("\n").length > MAX_STORED_LENGTH) {
        return { domains: [], error: "limit" };
      }
    }
    return { domains, error: null };
  }

  function sanitizeStored(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    const seen = new Set();
    for (const entry of value.slice(0, MAX_DOMAINS)) {
      const domain = normalizeDomain(entry);
      if (domain && !seen.has(domain)) {
        result.push(domain);
        seen.add(domain);
      }
    }
    return result;
  }

  function matchesHost(hostname, domains) {
    for (const domain of domains) {
      // Single-label hosts and IP addresses must match exactly; a rule such
      // as "com" must not accidentally exempt all .com websites.
      if (hostname === domain) return true;
      if (domain.includes(".") && !/^\d+\.\d+\.\d+\.\d+$/.test(domain) &&
          hostname.endsWith(`.${domain}`)) return true;
    }
    return false;
  }

  function matchesTab(tab, domains) {
    if (!domains.length) return false;
    // An in-flight navigation can point to an excluded site while tab.url
    // still holds the previous address. Treat either as an exclusion.
    for (const address of [tab.pendingUrl, tab.url]) {
      if (typeof address !== "string" || !/^https?:\/\//i.test(address)) continue;
      try {
        const hostname = new URL(address).hostname.toLowerCase().replace(/\.$/, "");
        if (matchesHost(hostname, domains)) return true;
      } catch { /* An invalid URL cannot be an excluded web hostname. */ }
    }
    return false;
  }

  return { parseInput, sanitizeStored, matchesTab };
})());

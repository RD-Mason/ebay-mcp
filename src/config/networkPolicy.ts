/** Exact eBay API hosts that may receive the seller's credentials. No suffix matching. */
const EBAY_API_HOSTS = new Set([
  'api.ebay.com',
  'api.sandbox.ebay.com',
  'apiz.ebay.com',
  'apiz.sandbox.ebay.com',
  'apim.ebay.com',
  'apim.sandbox.ebay.com',
  'tppz.ebay.com',
  'tppz.sandbox.ebay.com',
]);

/** Literal loopback names; wildcard bind addresses are deliberately excluded. */
export const isLoopbackHost = (hostname: string): boolean =>
  ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());

/** Validate an explicitly configured local development proxy before any token is acquired. */
export const validateLocalProxyUrl = (rawUrl: string): URL => {
  const proxy = new URL(rawUrl);
  if (
    !(['http:', 'https:'].includes(proxy.protocol) && isLoopbackHost(proxy.hostname)) ||
    proxy.username ||
    proxy.password ||
    proxy.search ||
    proxy.hash
  ) {
    throw new Error(
      'EBAY_MCP_API_BASE_URL must be an explicit loopback HTTP(S) proxy URL without credentials, query or fragment. Remote proxies are disabled.',
    );
  }
  return proxy;
};

/**
 * Refuse sending eBay credentials to an arbitrary absolute URL. A local proxy is
 * trusted only when explicitly configured, and only inside its configured path.
 */
export const assertEbayRequestUrl = (rawUrl: string, proxyBaseUrl?: string): void => {
  const target = new URL(rawUrl);
  if (target.username || target.password || target.hash) {
    throw new Error('eBay request URLs must not contain credentials or fragments.');
  }
  if (
    target.protocol === 'https:' &&
    EBAY_API_HOSTS.has(target.hostname) &&
    (target.port === '' || target.port === '443')
  ) {
    return;
  }
  if (proxyBaseUrl) {
    const proxy = validateLocalProxyUrl(proxyBaseUrl);
    const prefix = proxy.pathname.replace(/\/+$/, '');
    if (
      target.origin === proxy.origin &&
      (target.pathname === prefix || target.pathname.startsWith(`${prefix}/`))
    ) {
      return;
    }
  }
  throw new Error(
    'Refusing eBay request outside the approved HTTPS API hosts or configured loopback proxy.',
  );
};

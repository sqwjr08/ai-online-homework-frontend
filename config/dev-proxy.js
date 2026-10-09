export function createDevProxy(target = 'http://127.0.0.1:8000') {
  const parsed = new URL(target);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('API_PROXY_TARGET must be an HTTP(S) origin without credentials or a path');
  }
  const options = {
    target: parsed.origin,
    changeOrigin: true,
    followRedirects: false,
    configure(proxy) {
      proxy.on('proxyRes', upstream => {
        // A browser must not follow a redirect carrying the bearer token elsewhere.
        if (upstream.statusCode >= 300 && upstream.statusCode < 400) delete upstream.headers.location;
      });
      proxy.on('error', (_error, _request, response) => {
        if (response && !response.headersSent && typeof response.writeHead === 'function') {
          response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ detail: 'Development proxy cannot reach the API service' }));
        }
      });
    },
  };
  return {
    '^/api/v1(?:/|\\?|$)': { ...options },
    '^/uploads(?:/|\\?|$)': { ...options },
  };
}

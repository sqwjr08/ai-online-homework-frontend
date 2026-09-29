// Memory only: no credentials or user data are persisted by this layer.
export function createTokenStore() {
  let token = null;
  let version = 0;
  return {
    get: () => token,
    version: () => version,
    set(value) {
      if (typeof value !== 'string' || !value.trim() || /\s/.test(value)) {
        throw new TypeError('Access token must be a non-empty string without whitespace');
      }
      token = value;
      version += 1;
    },
    clear() {
      token = null;
      version += 1;
    },
  };
}

export const tokenStore = createTokenStore();

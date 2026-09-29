import { createApiClient } from './client.js';
import { tokenStore } from './token.js';

export { ApiError } from './errors.js';
export { tokenStore } from './token.js';

// Login, restoration and routing will be connected in node 16c.
export default createApiClient({ tokenStore });

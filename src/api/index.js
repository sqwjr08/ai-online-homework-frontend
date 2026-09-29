import { session } from '../auth/session.js';

export { ApiError } from './errors.js';
// Login/restore/logout must go through session so memory and storage stay in sync.
export default session.api;

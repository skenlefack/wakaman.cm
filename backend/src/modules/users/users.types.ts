/**
 * Users module — Domain types
 */

export const USER_CACHE_PREFIX = 'user:';
export const USER_CACHE_TTL_SECONDS = 300; // 5 minutes

export const USER_BLOCKED_PREFIX = 'blocked:';
export const USER_BLOCKED_TTL_SECONDS = 900; // 15 minutes (= access token lifetime)

/**
 * Merchants module — Domain types and constants
 */

export const MERCHANT_CACHE_PREFIX = 'merchant:';
export const MERCHANT_CACHE_TTL_SECONDS = 300; // 5 minutes

export type MerchantRole = 'OWNER' | 'MANAGER' | 'STAFF';

/**
 * Catalog module — Domain types and constants
 */

export const CATALOG_CACHE_PREFIX = 'catalog:';
export const CATALOG_CACHE_TTL_SECONDS = 120; // 2 minutes

// MVP limits — adjustable based on field feedback
export const MAX_PRODUCTS_PER_MERCHANT = 200;
export const MAX_CATEGORIES_PER_MERCHANT = 10;
export const MAX_OPTIONS_PER_PRODUCT = 5;
export const MAX_CHOICES_PER_OPTION = 10;

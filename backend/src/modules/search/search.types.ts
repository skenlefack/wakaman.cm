/**
 * Search module — Domain types and constants
 */

export const NEARBY_CACHE_PREFIX = 'nearby:';
export const NEARBY_CACHE_TTL_SECONDS = 60;
export const NEARBY_DEFAULT_RADIUS_METERS = 3000;
export const NEARBY_MAX_RADIUS_METERS = 20000;
export const NEARBY_DEFAULT_PAGE_SIZE = 20;
export const NEARBY_MAX_PAGE_SIZE = 50;

export const MEILISEARCH_PRODUCTS_INDEX = 'products';

export const DOUALA_TIMEZONE = 'Africa/Douala'; // UTC+1, no DST

export interface MeilisearchProductDocument {
  id: string;
  merchantId: string;
  merchantName: string;
  merchantCity: string;
  merchantType: string;
  merchantStatus: string;
  name: string;
  description: string;
  tags: string[];
  priceFcfa: number;
  discountPriceFcfa: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  isAvailable: boolean;
  isMerchantDeleted: boolean;
}

export interface NearbyMerchantResult {
  id: string;
  businessName: string;
  type: string;
  description: string | null;
  logoUrl: string | null;
  city: string;
  district: string | null;
  latitude: number;
  longitude: number;
  phonePrimary: string;
  averagePreparationMinutes: number;
  minimumOrderFcfa: number;
  averageRating: number;
  totalOrders: number;
  distanceMeters: number;
  isCurrentlyOpen: boolean;
}

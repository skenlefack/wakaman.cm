/**
 * Search module — Schemas (TypeBox)
 */

import { Type, Static } from '@sinclair/typebox';

// ============================================================
// NEARBY MERCHANTS (PostGIS)
// ============================================================

export const NearbyQuery = Type.Object({
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
  radius: Type.Optional(Type.Integer({ minimum: 100, maximum: 20000, default: 3000 })),
  type: Type.Optional(Type.Union([
    Type.Literal('RESTAURANT'), Type.Literal('SUPERMARKET'), Type.Literal('PHARMACY'),
    Type.Literal('GROCERY'), Type.Literal('BAKERY'), Type.Literal('TRADITIONAL_MARKET_VENDOR'),
    Type.Literal('OTHER'),
  ])),
  search: Type.Optional(Type.String({ minLength: 2 })),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
});

const NearbyMerchantItem = Type.Object({
  id: Type.String(),
  businessName: Type.String(),
  type: Type.String(),
  description: Type.Optional(Type.String()),
  logoUrl: Type.Optional(Type.String()),
  city: Type.String(),
  district: Type.Optional(Type.String()),
  latitude: Type.Number(),
  longitude: Type.Number(),
  phonePrimary: Type.String(),
  averagePreparationMinutes: Type.Integer(),
  minimumOrderFcfa: Type.Number(),
  averageRating: Type.Number(),
  totalOrders: Type.Integer(),
  distanceMeters: Type.Number(),
  isCurrentlyOpen: Type.Boolean(),
});

export const NearbyResponse = Type.Object({
  items: Type.Array(NearbyMerchantItem),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

// ============================================================
// PRODUCT SEARCH (Meilisearch)
// ============================================================

export const ProductSearchQuery = Type.Object({
  q: Type.String({ minLength: 2 }),
  lat: Type.Optional(Type.Number({ minimum: -90, maximum: 90 })),
  lng: Type.Optional(Type.Number({ minimum: -180, maximum: 180 })),
  radius: Type.Optional(Type.Integer({ minimum: 100, maximum: 20000, default: 3000 })),
  category: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })),
});

const ProductSearchItem = Type.Object({
  id: Type.String(),
  merchantId: Type.String(),
  merchantName: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  imageUrl: Type.Optional(Type.String()),
  priceFcfa: Type.Number(),
  discountPriceFcfa: Type.Optional(Type.Number()),
  categoryName: Type.Optional(Type.String()),
  tags: Type.Array(Type.String()),
});

export const ProductSearchResponse = Type.Object({
  items: Type.Array(ProductSearchItem),
  total: Type.Integer({ description: 'Estimated total from Meilisearch. When geo-filter is applied, actual results may be fewer (best-effort pagination).' }),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
  requestId: Type.String(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type NearbyQueryType = Static<typeof NearbyQuery>;
export type ProductSearchQueryType = Static<typeof ProductSearchQuery>;

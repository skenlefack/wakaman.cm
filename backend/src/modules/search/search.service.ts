/**
 * Search module — Service
 *
 * Sub-feature A: PostGIS geo search for nearby merchants
 * Sub-feature B: Meilisearch full-text product search
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { MeiliSearch } from 'meilisearch';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { NearbyQueryType, ProductSearchQueryType } from './search.schemas.js';
import type { NearbyMerchantResult, MeilisearchProductDocument } from './search.types.js';
import {
  NEARBY_CACHE_PREFIX, NEARBY_CACHE_TTL_SECONDS,
  NEARBY_DEFAULT_RADIUS_METERS, NEARBY_DEFAULT_PAGE_SIZE,
  MEILISEARCH_PRODUCTS_INDEX,
} from './search.types.js';

export class SearchService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly meilisearch: MeiliSearch,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  // ============================================================
  // SUB-FEATURE A — Nearby merchants (PostGIS)
  // ============================================================

  async nearbyMerchants(query: NearbyQueryType): Promise<{ items: NearbyMerchantResult[]; total: number; page: number; pageSize: number }> {
    const radius = query.radius ?? NEARBY_DEFAULT_RADIUS_METERS;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? NEARBY_DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const lng = query.lng;
    const lat = query.lat;

    // Cache key: rounded lat/lng to 3 decimals (~111m precision)
    const cacheKey = `${NEARBY_CACHE_PREFIX}${lat.toFixed(3)}_${lng.toFixed(3)}_${radius}_${query.type ?? ''}_${query.search ?? ''}_${page}_${pageSize}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Build dynamic WHERE fragments with Prisma.sql (safe tagged templates)
    const typeFilter = query.type
      ? Prisma.sql`AND m.type = ${query.type}`
      : Prisma.empty;

    const searchFilter = query.search
      ? Prisma.sql`AND m.business_name ILIKE ${'%' + query.search + '%'}`
      : Prisma.empty;

    // Count query
    const countResult = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM merchants m
      WHERE m.status = 'ACTIVE' AND m.deleted_at IS NULL
      AND ST_DWithin(m.location, ST_MakePoint(${lng}, ${lat})::geography, ${radius})
      ${typeFilter} ${searchFilter}
    `;
    const total = Number(countResult[0].count);

    // Main query with distance, ordered by proximity
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        m.id, m.business_name, m.type, m.description, m.logo_url,
        m.city, m.district, m.latitude, m.longitude, m.phone_primary,
        m.average_preparation_minutes, m.minimum_order_fcfa, m.average_rating, m.total_orders,
        ST_Distance(m.location, ST_MakePoint(${lng}, ${lat})::geography) as distance_meters
      FROM merchants m
      WHERE m.status = 'ACTIVE' AND m.deleted_at IS NULL
      AND ST_DWithin(m.location, ST_MakePoint(${lng}, ${lat})::geography, ${radius})
      ${typeFilter} ${searchFilter}
      ORDER BY distance_meters ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    // Fetch hours for all merchants in result to compute isCurrentlyOpen
    const merchantIds = rows.map((r: any) => r.id);
    const hours = merchantIds.length > 0
      ? await this.prisma.merchantHours.findMany({ where: { merchantId: { in: merchantIds } } })
      : [];

    const hoursByMerchant = new Map<string, typeof hours>();
    for (const h of hours) {
      const arr = hoursByMerchant.get(h.merchantId) ?? [];
      arr.push(h);
      hoursByMerchant.set(h.merchantId, arr);
    }

    const items: NearbyMerchantResult[] = rows.map((r: any) => ({
      id: r.id,
      businessName: r.business_name,
      type: r.type,
      description: r.description ?? null,
      logoUrl: r.logo_url ?? null,
      city: r.city,
      district: r.district ?? null,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      phonePrimary: r.phone_primary,
      averagePreparationMinutes: r.average_preparation_minutes,
      minimumOrderFcfa: Number(r.minimum_order_fcfa),
      averageRating: Number(r.average_rating),
      totalOrders: r.total_orders,
      distanceMeters: Math.round(Number(r.distance_meters)),
      isCurrentlyOpen: this.computeIsOpen(hoursByMerchant.get(r.id) ?? []),
    }));

    const result = { items, total, page, pageSize };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', NEARBY_CACHE_TTL_SECONDS);
    return result;
  }

  // ============================================================
  // SUB-FEATURE B — Product search (Meilisearch)
  //
  // Pagination: BEST-EFFORT when geo filter is applied.
  // Meilisearch returns `pageSize` results, then we post-filter by
  // merchant proximity. The returned count may be < pageSize.
  // Client should treat items.length < pageSize as "no more results".
  // This is documented and acceptable for MVP — Meilisearch native geo
  // (v1.1+ _geoRadius filter) will replace post-filtering later.
  // ============================================================

  async searchProducts(query: ProductSearchQueryType) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? NEARBY_DEFAULT_PAGE_SIZE;

    const filter: string[] = [
      `merchantStatus = ACTIVE`,
      `isAvailable = true`,
      `isMerchantDeleted = false`,
    ];

    if (query.category) {
      filter.push(`merchantType = ${query.category}`);
    }

    const index = this.meilisearch.index(MEILISEARCH_PRODUCTS_INDEX);
    const result = await index.search<MeilisearchProductDocument>(query.q, {
      filter: filter.join(' AND '),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    let hits = result.hits;

    // Post-filter by geo proximity if lat/lng provided (best-effort pagination)
    if (query.lat != null && query.lng != null) {
      const radius = query.radius ?? NEARBY_DEFAULT_RADIUS_METERS;
      const merchantIdsInRadius = await this.getMerchantIdsInRadius(query.lat, query.lng, radius);
      hits = hits.filter((h) => merchantIdsInRadius.has(h.merchantId));
    }

    return {
      items: hits.map((h) => ({
        id: h.id,
        merchantId: h.merchantId,
        merchantName: h.merchantName,
        name: h.name,
        description: h.description || undefined,
        imageUrl: h.imageUrl ?? undefined,
        priceFcfa: h.priceFcfa,
        discountPriceFcfa: h.discountPriceFcfa ?? undefined,
        categoryName: h.categoryName ?? undefined,
        tags: h.tags,
      })),
      total: result.estimatedTotalHits ?? result.hits.length,
      page,
      pageSize,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async getMerchantIdsInRadius(lat: number, lng: number, radius: number): Promise<Set<string>> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM merchants WHERE status = 'ACTIVE' AND deleted_at IS NULL AND ST_DWithin(location, ST_MakePoint(${lng}, ${lat})::geography, ${radius})`,
    );
    return new Set(rows.map((r) => r.id));
  }

  private computeIsOpen(hours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]): boolean {
    if (hours.length === 0) return false; // No hours defined = closed

    // Africa/Douala = UTC+1 always (no DST)
    const now = new Date();
    const utcHours = now.getUTCHours();
    const localHour = (utcHours + 1) % 24;
    const localMinutes = now.getUTCMinutes();
    const currentTime = `${String(localHour).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`;

    // dayOfWeek: 0=Sunday in Prisma schema
    const utcDay = now.getUTCDay();
    // If adding 1 hour crosses midnight, adjust day
    const localDay = utcHours === 23 ? (utcDay + 1) % 7 : utcDay;

    const todayHours = hours.find((h) => h.dayOfWeek === localDay);
    if (!todayHours || todayHours.isClosed) return false;

    return currentTime >= todayHours.openTime && currentTime < todayHours.closeTime;
  }
}

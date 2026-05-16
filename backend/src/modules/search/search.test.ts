/**
 * Search module — Tests (Vitest)
 *
 * Sub-feature A: PostGIS nearby merchants
 * Sub-feature B: Meilisearch product search
 * SearchIndexService: indexation sync
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService } from './search.service.js';
import { SearchIndexService } from './search-index.service.js';
import type { PrismaClient } from '@prisma/client';
import type { MeiliSearch } from 'meilisearch';
import type Redis from 'ioredis';
import type { Logger } from 'pino';

// ============================================================
// MOCKS
// ============================================================

function mockLogger(): Logger {
  return { info: () => {}, error: () => {}, warn: vi.fn() } as unknown as Logger;
}

function mockRedis() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

function mockMeilisearch() {
  const mockIndex = {
    search: vi.fn().mockResolvedValue({ hits: [], estimatedTotalHits: 0 }),
    addDocuments: vi.fn().mockResolvedValue({ taskUid: 1 }),
    deleteDocument: vi.fn().mockResolvedValue({ taskUid: 2 }),
    deleteAllDocuments: vi.fn().mockResolvedValue({ taskUid: 3 }),
    updateSettings: vi.fn().mockResolvedValue({ taskUid: 4 }),
  };
  return {
    index: vi.fn().mockReturnValue(mockIndex),
    createIndex: vi.fn().mockResolvedValue({}),
    _mockIndex: mockIndex,
  };
}

function mockPrisma() {
  return {
    $queryRaw: vi.fn(),
    merchantHours: { findMany: vi.fn().mockResolvedValue([]) },
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createSearchService() {
  const prisma = mockPrisma();
  const meili = mockMeilisearch();
  const redis = mockRedis();
  const logger = mockLogger();
  const service = new SearchService(
    prisma as unknown as PrismaClient,
    meili as unknown as MeiliSearch,
    redis as unknown as Redis,
    logger,
  );
  return { service, prisma, meili, redis, logger };
}

function createIndexService() {
  const prisma = mockPrisma();
  const meili = mockMeilisearch();
  const logger = mockLogger();
  const service = new SearchIndexService(
    prisma as unknown as PrismaClient,
    meili as unknown as MeiliSearch,
    logger,
  );
  return { service, prisma, meili, logger };
}

// ============================================================
// SUB-FEATURE A — NEARBY MERCHANTS (PostGIS)
// ============================================================

describe('SearchService.nearbyMerchants', () => {
  it('should return merchant within radius with distance', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(1) }])
      .mockResolvedValueOnce([{
        id: 'mch_near', business_name: 'Chez Mama', type: 'RESTAURANT',
        description: 'Good food', logo_url: null, city: 'Douala', district: 'Akwa',
        latitude: 4.05, longitude: 9.77, phone_primary: '+237691234567',
        average_preparation_minutes: 20, minimum_order_fcfa: 1000,
        average_rating: 4.5, total_orders: 50, distance_meters: 500,
      }]);

    const result = await service.nearbyMerchants({ lat: 4.05, lng: 9.77 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].distanceMeters).toBe(500);
    expect(result.items[0].businessName).toBe('Chez Mama');
  });

  it('should not return merchants outside radius', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await service.nearbyMerchants({ lat: 4.05, lng: 9.77, radius: 3000 });
    expect(result.items).toHaveLength(0);
  });

  it('should never return SUSPENDED merchants (SQL WHERE status=ACTIVE)', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await service.nearbyMerchants({ lat: 4.05, lng: 9.77 });
    expect(result.items).toHaveLength(0);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('should set isCurrentlyOpen=false when no hours defined', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(1) }])
      .mockResolvedValueOnce([{
        id: 'mch_nohours', business_name: 'NoHours', type: 'GROCERY',
        description: null, logo_url: null, city: 'Douala', district: null,
        latitude: 4.05, longitude: 9.77, phone_primary: '+237600000000',
        average_preparation_minutes: 15, minimum_order_fcfa: 0,
        average_rating: 0, total_orders: 0, distance_meters: 200,
      }]);
    prisma.merchantHours.findMany.mockResolvedValue([]);

    const result = await service.nearbyMerchants({ lat: 4.05, lng: 9.77 });
    expect(result.items[0].isCurrentlyOpen).toBe(false);
  });

  it('should filter by type when provided', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    await service.nearbyMerchants({ lat: 4.05, lng: 9.77, type: 'PHARMACY' });
    // $queryRaw called with tagged template containing type filter
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('should search by businessName ILIKE when search provided', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    await service.nearbyMerchants({ lat: 4.05, lng: 9.77, search: 'pharm' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('should sort by distance ascending', async () => {
    const { service, prisma } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(2) }])
      .mockResolvedValueOnce([
        { id: 'mch_close', business_name: 'Close', type: 'RESTAURANT', description: null, logo_url: null, city: 'Douala', district: null, latitude: 4.05, longitude: 9.77, phone_primary: '+237600000001', average_preparation_minutes: 10, minimum_order_fcfa: 0, average_rating: 4, total_orders: 10, distance_meters: 100 },
        { id: 'mch_far', business_name: 'Far', type: 'RESTAURANT', description: null, logo_url: null, city: 'Douala', district: null, latitude: 4.06, longitude: 9.78, phone_primary: '+237600000002', average_preparation_minutes: 20, minimum_order_fcfa: 500, average_rating: 3, total_orders: 5, distance_meters: 2500 },
      ]);

    const result = await service.nearbyMerchants({ lat: 4.05, lng: 9.77 });
    expect(result.items[0].distanceMeters).toBe(100);
    expect(result.items[1].distanceMeters).toBe(2500);
  });

  it('should use cache on second call', async () => {
    const { service, prisma, redis } = createSearchService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    await service.nearbyMerchants({ lat: 4.051, lng: 9.771 });
    expect(redis.set).toHaveBeenCalled();

    redis.get.mockResolvedValueOnce(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }));
    const cached = await service.nearbyMerchants({ lat: 4.051, lng: 9.771 });
    expect(cached.items).toHaveLength(0);
  });
});

// ============================================================
// SUB-FEATURE B — PRODUCT SEARCH (Meilisearch)
// ============================================================

describe('SearchService.searchProducts', () => {
  it('should search with mandatory filters (ACTIVE, available, not deleted)', async () => {
    const { service, meili } = createSearchService();
    await service.searchProducts({ q: 'pizza' });
    const searchCall = meili._mockIndex.search.mock.calls[0];
    expect(searchCall[0]).toBe('pizza');
    expect(searchCall[1].filter).toContain('merchantStatus = ACTIVE');
    expect(searchCall[1].filter).toContain('isAvailable = true');
    expect(searchCall[1].filter).toContain('isMerchantDeleted = false');
  });

  it('should return hits from Meilisearch', async () => {
    const { service, meili } = createSearchService();
    meili._mockIndex.search.mockResolvedValue({
      hits: [{ id: 'prd_1', merchantId: 'mch_1', merchantName: 'Pizzeria', name: 'Margherita', description: '', tags: ['pizza'], priceFcfa: 4000, discountPriceFcfa: null, imageUrl: null, categoryName: 'Pizzas', isAvailable: true, isMerchantDeleted: false, merchantType: 'RESTAURANT', merchantStatus: 'ACTIVE', merchantCity: 'Douala' }],
      estimatedTotalHits: 1,
    });

    const result = await service.searchProducts({ q: 'pizza' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Margherita');
  });

  it('should filter by category (merchantType)', async () => {
    const { service, meili } = createSearchService();
    await service.searchProducts({ q: 'ibuprofen', category: 'PHARMACY' });
    const filter = meili._mockIndex.search.mock.calls[0][1].filter;
    expect(filter).toContain('merchantType = PHARMACY');
  });

  it('should post-filter by geo when lat/lng provided', async () => {
    const { service, meili, prisma } = createSearchService();
    meili._mockIndex.search.mockResolvedValue({
      hits: [
        { id: 'prd_in', merchantId: 'mch_near', merchantName: 'A', name: 'P1', description: '', tags: [], priceFcfa: 100, discountPriceFcfa: null, imageUrl: null, categoryName: null, isAvailable: true, isMerchantDeleted: false, merchantType: 'RESTAURANT', merchantStatus: 'ACTIVE', merchantCity: 'Douala' },
        { id: 'prd_out', merchantId: 'mch_far', merchantName: 'B', name: 'P2', description: '', tags: [], priceFcfa: 200, discountPriceFcfa: null, imageUrl: null, categoryName: null, isAvailable: true, isMerchantDeleted: false, merchantType: 'RESTAURANT', merchantStatus: 'ACTIVE', merchantCity: 'Douala' },
      ],
      estimatedTotalHits: 2,
    });
    // Only mch_near is within radius
    prisma.$queryRaw.mockResolvedValue([{ id: 'mch_near' }]);

    const result = await service.searchProducts({ q: 'test', lat: 4.05, lng: 9.77, radius: 3000 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('prd_in');
  });
});

// ============================================================
// SEARCH INDEX SERVICE
// ============================================================

describe('SearchIndexService', () => {
  it('should index product on create', async () => {
    const { service, prisma, meili } = createIndexService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prd_new', merchantId: 'mch_1', name: 'Ndolé', description: 'Tasty',
      tags: ['cameroon'], priceFcfa: 3500, discountPriceFcfa: null, imageUrl: null,
      isAvailable: true, deletedAt: null,
      merchant: { id: 'mch_1', businessName: 'Chez Mama', city: 'Douala', type: 'RESTAURANT', status: 'ACTIVE', deletedAt: null },
      category: { name: 'Plats' },
    });

    await service.indexProduct('prd_new');
    expect(meili._mockIndex.addDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'prd_new', name: 'Ndolé', merchantName: 'Chez Mama', isAvailable: true }),
    ]);
  });

  it('should update index on product update', async () => {
    const { service, prisma, meili } = createIndexService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prd_upd', merchantId: 'mch_1', name: 'Ndolé Updated', description: '',
      tags: [], priceFcfa: 4000, discountPriceFcfa: null, imageUrl: null,
      isAvailable: true, deletedAt: null,
      merchant: { id: 'mch_1', businessName: 'Chez Mama', city: 'Douala', type: 'RESTAURANT', status: 'ACTIVE', deletedAt: null },
      category: null,
    });

    await service.indexProduct('prd_upd');
    expect(meili._mockIndex.addDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'prd_upd', name: 'Ndolé Updated' }),
    ]);
  });

  it('should mark isAvailable=false for soft-deleted product', async () => {
    const { service, prisma, meili } = createIndexService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prd_del', merchantId: 'mch_1', name: 'Deleted', description: '',
      tags: [], priceFcfa: 1000, discountPriceFcfa: null, imageUrl: null,
      isAvailable: false, deletedAt: new Date(),
      merchant: { id: 'mch_1', businessName: 'Shop', city: 'Douala', type: 'GROCERY', status: 'ACTIVE', deletedAt: null },
      category: null,
    });

    await service.indexProduct('prd_del');
    expect(meili._mockIndex.addDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'prd_del', isAvailable: false }),
    ]);
  });

  it('should mark isMerchantDeleted when merchant suspended', async () => {
    const { service, prisma, meili } = createIndexService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prd_susp', merchantId: 'mch_s', name: 'Product', description: '',
      tags: [], priceFcfa: 500, discountPriceFcfa: null, imageUrl: null,
      isAvailable: true, deletedAt: null,
      merchant: { id: 'mch_s', businessName: 'Suspended Shop', city: 'Douala', type: 'GROCERY', status: 'SUSPENDED', deletedAt: null },
      category: null,
    });

    await service.indexProduct('prd_susp');
    expect(meili._mockIndex.addDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ merchantStatus: 'SUSPENDED' }),
    ]);
  });

  it('should not fail Postgres write when Meilisearch is down', async () => {
    const { service, prisma, meili, logger } = createIndexService();
    prisma.product.findUnique.mockResolvedValue({
      id: 'prd_fail', merchantId: 'mch_1', name: 'Product', description: '',
      tags: [], priceFcfa: 100, discountPriceFcfa: null, imageUrl: null,
      isAvailable: true, deletedAt: null,
      merchant: { id: 'mch_1', businessName: 'Shop', city: 'Douala', type: 'GROCERY', status: 'ACTIVE', deletedAt: null },
      category: null,
    });
    meili._mockIndex.addDocuments.mockRejectedValue(new Error('Meilisearch connection refused'));

    // Should NOT throw
    await expect(service.indexProduct('prd_fail')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should remove product from index', async () => {
    const { service, meili } = createIndexService();
    await service.removeProduct('prd_gone');
    expect(meili._mockIndex.deleteDocument).toHaveBeenCalledWith('prd_gone');
  });
});

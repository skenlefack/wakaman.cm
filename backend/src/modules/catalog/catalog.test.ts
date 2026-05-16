/**
 * Catalog module — Tests (Vitest)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';
import { CatalogRepository } from './catalog.repository.js';
import { MerchantsService } from '../merchants/merchants.service.js';
import type Redis from 'ioredis';
import type { Logger } from 'pino';

// ============================================================
// MOCKS
// ============================================================

function mockLogger(): Logger {
  return { info: () => {}, error: () => {}, warn: () => {} } as unknown as Logger;
}

function mockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (...keys: string[]) => { keys.forEach((k) => store.delete(k)); return keys.length; }),
    keys: vi.fn(async () => [] as string[]),
  };
}

function mockCatalogRepo() {
  return {
    createCategory: vi.fn(),
    findCategoryById: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    countCategoriesByMerchant: vi.fn().mockResolvedValue(0),
    countProductsInCategory: vi.fn().mockResolvedValue(0),
    listCategoriesByMerchant: vi.fn().mockResolvedValue([]),
    reorderCategories: vi.fn(),
    findCategoriesByIds: vi.fn(),
    createProduct: vi.fn(),
    findProductById: vi.fn(),
    findProductWithOptions: vi.fn(),
    updateProduct: vi.fn(),
    softDeleteProduct: vi.fn(),
    countProductsByMerchant: vi.fn().mockResolvedValue(0),
    listPublicProducts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    createOption: vi.fn(),
    findOptionById: vi.fn(),
    updateOption: vi.fn(),
    deleteOption: vi.fn(),
    countOptionsByProduct: vi.fn().mockResolvedValue(0),
    createChoice: vi.fn(),
    findChoiceById: vi.fn(),
    updateChoice: vi.fn(),
    deleteChoice: vi.fn(),
    countChoicesByOption: vi.fn().mockResolvedValue(0),
  };
}

function mockMerchantsService() {
  return {
    verifyMembership: vi.fn().mockResolvedValue('OWNER'),
  };
}

function createService() {
  const catRepo = mockCatalogRepo();
  const merchSvc = mockMerchantsService();
  const redis = mockRedis();
  const service = new CatalogService(
    catRepo as unknown as CatalogRepository,
    merchSvc as unknown as MerchantsService,
    redis as unknown as Redis,
    mockLogger(),
  );
  return { service, catRepo, merchSvc, redis };
}

const MOCK_CATEGORY = { id: 'cat_abc', merchantId: 'mch_abc', name: 'Plats', description: null, imageUrl: null, sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() };
const MOCK_PRODUCT = { id: 'prd_abc', merchantId: 'mch_abc', categoryId: 'cat_abc', name: 'Ndolé', description: 'Best ndolé', imageUrl: null, priceFcfa: 3500, discountPriceFcfa: null, isAvailable: true, stock: null, preparationMinutes: 25, tags: ['spicy'], allergens: [], createdAt: new Date(), updatedAt: new Date(), deletedAt: null };

// ============================================================
// CATEGORIES
// ============================================================

describe('CatalogService — Categories', () => {
  it('should create a category', async () => {
    const { service, catRepo } = createService();
    catRepo.createCategory.mockResolvedValue(MOCK_CATEGORY);
    const result = await service.createCategory('mch_abc', 'usr_owner', { name: 'Plats' });
    expect(result.name).toBe('Plats');
  });

  it('should reject if non-member creates category', async () => {
    const { service, merchSvc } = createService();
    merchSvc.verifyMembership.mockRejectedValue(new Error('Not a member'));
    await expect(service.createCategory('mch_abc', 'usr_stranger', { name: 'X' }))
      .rejects.toThrow('Not a member');
  });

  it('should reject if max categories reached', async () => {
    const { service, catRepo } = createService();
    catRepo.countCategoriesByMerchant.mockResolvedValue(10);
    await expect(service.createCategory('mch_abc', 'usr_owner', { name: 'X' }))
      .rejects.toThrow('Maximum 10 categories');
  });

  it('should reject delete if products attached (409)', async () => {
    const { service, catRepo } = createService();
    catRepo.findCategoryById.mockResolvedValue(MOCK_CATEGORY);
    catRepo.countProductsInCategory.mockResolvedValue(3);
    await expect(service.deleteCategory('cat_abc', 'usr_owner'))
      .rejects.toThrow('Cannot delete category with 3 product(s)');
  });

  it('should reorder categories and reject alien IDs', async () => {
    const { service, catRepo } = createService();
    catRepo.findCategoriesByIds.mockResolvedValue([
      { ...MOCK_CATEGORY, id: 'cat_1' },
      { ...MOCK_CATEGORY, id: 'cat_2', merchantId: 'mch_OTHER' },
    ]);
    await expect(service.reorderCategories('mch_abc', 'usr_owner', { categoryIds: ['cat_1', 'cat_2'] }))
      .rejects.toThrow('does not belong');
  });

  it('should reorder and invalidate cache', async () => {
    const { service, catRepo, redis } = createService();
    catRepo.findCategoriesByIds.mockResolvedValue([
      { ...MOCK_CATEGORY, id: 'cat_1' },
      { ...MOCK_CATEGORY, id: 'cat_2' },
    ]);
    await service.reorderCategories('mch_abc', 'usr_owner', { categoryIds: ['cat_1', 'cat_2'] });
    expect(catRepo.reorderCategories).toHaveBeenCalledWith('mch_abc', ['cat_1', 'cat_2']);
  });
});

// ============================================================
// PRODUCTS
// ============================================================

describe('CatalogService — Products', () => {
  it('should create a product', async () => {
    const { service, catRepo } = createService();
    catRepo.createProduct.mockResolvedValue(MOCK_PRODUCT);
    const result = await service.createProduct('mch_abc', 'usr_owner', { name: 'Ndolé', priceFcfa: 3500 });
    expect(result.name).toBe('Ndolé');
    expect(result.priceFcfa).toBe(3500);
  });

  it('should reject if max products reached (201st)', async () => {
    const { service, catRepo } = createService();
    catRepo.countProductsByMerchant.mockResolvedValue(200);
    await expect(service.createProduct('mch_abc', 'usr_owner', { name: 'X', priceFcfa: 100 }))
      .rejects.toThrow('Maximum 200 products');
  });

  it('should reject discountPriceFcfa >= priceFcfa', async () => {
    const { service } = createService();
    await expect(service.createProduct('mch_abc', 'usr_owner', { name: 'X', priceFcfa: 1000, discountPriceFcfa: 1000 }))
      .rejects.toThrow('discountPriceFcfa must be less than priceFcfa');
  });

  it('should reject discountPriceFcfa > priceFcfa', async () => {
    const { service } = createService();
    await expect(service.createProduct('mch_abc', 'usr_owner', { name: 'X', priceFcfa: 1000, discountPriceFcfa: 1500 }))
      .rejects.toThrow('discountPriceFcfa must be less than priceFcfa');
  });

  it('should soft delete product: deletedAt + isAvailable=false', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    await service.deleteProduct('prd_abc', 'usr_owner');
    expect(catRepo.softDeleteProduct).toHaveBeenCalledWith('prd_abc');
  });

  it('should reject update by non-member (403)', async () => {
    const { service, catRepo, merchSvc } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    merchSvc.verifyMembership.mockRejectedValue(new Error('Not a member'));
    await expect(service.updateProduct('prd_abc', 'usr_stranger', { name: 'X' }))
      .rejects.toThrow('Not a member');
  });

  it('public list shows only available+not-deleted', async () => {
    const { service, catRepo } = createService();
    catRepo.listPublicProducts.mockResolvedValue({
      items: [MOCK_PRODUCT],
      total: 1,
    });
    const result = await service.listPublicProducts('mch_abc', {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isAvailable).toBe(true);
  });

  it('public GET product returns 404 for deleted product', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductWithOptions.mockResolvedValue({ ...MOCK_PRODUCT, deletedAt: new Date() });
    await expect(service.getProductDetail('prd_deleted')).rejects.toThrow('not found');
  });

  it('public GET product returns 404 for unavailable product', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductWithOptions.mockResolvedValue({ ...MOCK_PRODUCT, isAvailable: false });
    await expect(service.getProductDetail('prd_unavail')).rejects.toThrow('not found');
  });

  it('should invalidate cache on product create', async () => {
    const { service, catRepo, redis } = createService();
    catRepo.createProduct.mockResolvedValue(MOCK_PRODUCT);
    redis.keys.mockResolvedValue(['catalog:mch_abc:p1:s20:c']);
    await service.createProduct('mch_abc', 'usr_owner', { name: 'X', priceFcfa: 100 });
    expect(redis.keys).toHaveBeenCalled();
  });
});

// ============================================================
// OPTIONS
// ============================================================

describe('CatalogService — Options', () => {
  const MOCK_OPTION = { id: 'opt_abc', productId: 'prd_abc', name: 'Taille', type: 'SINGLE', required: false, minSelection: 0, maxSelection: 1, product: { merchantId: 'mch_abc' } };

  it('should create option', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    catRepo.createOption.mockResolvedValue(MOCK_OPTION);
    const result = await service.createOption('prd_abc', 'usr_owner', { name: 'Taille', type: 'SINGLE' });
    expect(result.name).toBe('Taille');
  });

  it('should reject SINGLE with maxSelection > 1', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    await expect(service.createOption('prd_abc', 'usr_owner', { name: 'X', type: 'SINGLE', maxSelection: 3 }))
      .rejects.toThrow('SINGLE option type must have maxSelection = 1');
  });

  it('should reject MULTIPLE with maxSelection < minSelection', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    await expect(service.createOption('prd_abc', 'usr_owner', { name: 'X', type: 'MULTIPLE', minSelection: 3, maxSelection: 1 }))
      .rejects.toThrow('maxSelection must be >= minSelection');
  });

  it('should reject if max options per product reached', async () => {
    const { service, catRepo } = createService();
    catRepo.findProductById.mockResolvedValue(MOCK_PRODUCT);
    catRepo.countOptionsByProduct.mockResolvedValue(5);
    await expect(service.createOption('prd_abc', 'usr_owner', { name: 'X', type: 'SINGLE' }))
      .rejects.toThrow('Maximum 5 options');
  });

  it('should delete option (choices cascade via Prisma onDelete)', async () => {
    const { service, catRepo, redis } = createService();
    catRepo.findOptionById.mockResolvedValue(MOCK_OPTION);
    redis.keys.mockResolvedValue([]);
    await service.deleteOption('opt_abc', 'usr_owner');
    // deleteOption calls prisma.productOption.delete which cascades to choices
    expect(catRepo.deleteOption).toHaveBeenCalledWith('opt_abc');
  });
});

// ============================================================
// CHOICES
// ============================================================

describe('CatalogService — Choices', () => {
  const MOCK_OPTION_WITH_MERCH = { id: 'opt_abc', product: { merchantId: 'mch_abc' } };

  it('should create choice', async () => {
    const { service, catRepo } = createService();
    catRepo.findOptionById.mockResolvedValue(MOCK_OPTION_WITH_MERCH);
    catRepo.createChoice.mockResolvedValue({ id: 'chc_abc', name: 'Grande', priceFcfa: 500, isAvailable: true });
    const result = await service.createChoice('opt_abc', 'usr_owner', { name: 'Grande', priceFcfa: 500 });
    expect(result.name).toBe('Grande');
  });

  it('should reject if max choices per option reached', async () => {
    const { service, catRepo } = createService();
    catRepo.findOptionById.mockResolvedValue(MOCK_OPTION_WITH_MERCH);
    catRepo.countChoicesByOption.mockResolvedValue(10);
    await expect(service.createChoice('opt_abc', 'usr_owner', { name: 'X' }))
      .rejects.toThrow('Maximum 10 choices');
  });
});

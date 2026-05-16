/**
 * Catalog module — Service (business logic)
 *
 * Feature 2/3: Categories, Products, Options, Choices.
 * Redis cache on GET /merchants/:id/products (TTL 2 min).
 */

import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { CatalogRepository } from './catalog.repository.js';
import type { MerchantsService } from '../merchants/merchants.service.js';
import type {
  CreateCategoryBodyType, UpdateCategoryBodyType, ReorderCategoriesBodyType,
  CreateProductBodyType, UpdateProductBodyType, ToggleAvailabilityBodyType, ProductsQueryType,
  CreateOptionBodyType, UpdateOptionBodyType, CreateChoiceBodyType, UpdateChoiceBodyType,
} from './catalog.schemas.js';
import {
  CATALOG_CACHE_PREFIX, CATALOG_CACHE_TTL_SECONDS,
  MAX_PRODUCTS_PER_MERCHANT, MAX_CATEGORIES_PER_MERCHANT,
  MAX_OPTIONS_PER_PRODUCT, MAX_CHOICES_PER_OPTION,
} from './catalog.types.js';

export class CatalogService {
  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly merchantsService: MerchantsService,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  // ============================================================
  // CATEGORIES — PUBLIC
  // ============================================================

  async listCategories(merchantId: string) {
    const cats = await this.catalogRepository.listCategoriesByMerchant(merchantId);
    return { categories: cats.map((c) => this.serializeCategory(c)) };
  }

  // ============================================================
  // CATEGORIES — MEMBER
  // ============================================================

  async createCategory(merchantId: string, userId: string, data: CreateCategoryBodyType) {
    await this.merchantsService.verifyMembership(userId, merchantId);
    const count = await this.catalogRepository.countCategoriesByMerchant(merchantId);
    if (count >= MAX_CATEGORIES_PER_MERCHANT) {
      throw new ValidationError(`Maximum ${MAX_CATEGORIES_PER_MERCHANT} categories per merchant`);
    }
    const cat = await this.catalogRepository.createCategory(merchantId, data);
    await this.invalidateCache(merchantId);
    return this.serializeCategory(cat);
  }

  async updateCategory(categoryId: string, userId: string, data: UpdateCategoryBodyType) {
    const cat = await this.catalogRepository.findCategoryById(categoryId);
    if (!cat) throw new NotFoundError('Category', categoryId);
    await this.merchantsService.verifyMembership(userId, cat.merchantId);
    const updated = await this.catalogRepository.updateCategory(categoryId, data);
    await this.invalidateCache(cat.merchantId);
    return this.serializeCategory(updated);
  }

  async deleteCategory(categoryId: string, userId: string) {
    const cat = await this.catalogRepository.findCategoryById(categoryId);
    if (!cat) throw new NotFoundError('Category', categoryId);
    await this.merchantsService.verifyMembership(userId, cat.merchantId);

    const productCount = await this.catalogRepository.countProductsInCategory(categoryId);
    if (productCount > 0) {
      throw new ConflictError(`Cannot delete category with ${productCount} product(s) attached. Move or delete products first.`);
    }

    await this.catalogRepository.deleteCategory(categoryId);
    await this.invalidateCache(cat.merchantId);
  }

  async reorderCategories(merchantId: string, userId: string, data: ReorderCategoriesBodyType) {
    await this.merchantsService.verifyMembership(userId, merchantId);

    const categories = await this.catalogRepository.findCategoriesByIds(data.categoryIds);
    if (categories.length !== data.categoryIds.length) {
      throw new ValidationError('Some category IDs are invalid or not found');
    }
    const alien = categories.find((c) => c.merchantId !== merchantId);
    if (alien) {
      throw new ForbiddenError('Category does not belong to this merchant');
    }

    await this.catalogRepository.reorderCategories(merchantId, data.categoryIds);
    await this.invalidateCache(merchantId);
  }

  // ============================================================
  // PRODUCTS — PUBLIC
  // ============================================================

  async listPublicProducts(merchantId: string, query: ProductsQueryType) {
    const cacheKey = `${CATALOG_CACHE_PREFIX}${merchantId}:p${query.page ?? 1}:s${query.pageSize ?? 20}:c${query.categoryId ?? ''}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { items, total } = await this.catalogRepository.listPublicProducts(merchantId, query);
    const result = {
      items: items.map((p) => this.serializeProduct(p)),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CATALOG_CACHE_TTL_SECONDS);
    return result;
  }

  async getProductDetail(productId: string) {
    const product = await this.catalogRepository.findProductWithOptions(productId);
    if (!product || product.deletedAt || !product.isAvailable) {
      throw new NotFoundError('Product', productId);
    }
    return this.serializeProductDetail(product);
  }

  // ============================================================
  // PRODUCTS — MEMBER
  // ============================================================

  async createProduct(merchantId: string, userId: string, data: CreateProductBodyType) {
    await this.merchantsService.verifyMembership(userId, merchantId);

    const count = await this.catalogRepository.countProductsByMerchant(merchantId);
    if (count >= MAX_PRODUCTS_PER_MERCHANT) {
      throw new ValidationError(`Maximum ${MAX_PRODUCTS_PER_MERCHANT} products per merchant`);
    }

    if (data.discountPriceFcfa != null && data.discountPriceFcfa >= data.priceFcfa) {
      throw new ValidationError('discountPriceFcfa must be less than priceFcfa');
    }

    const product = await this.catalogRepository.createProduct(merchantId, data);
    await this.invalidateCache(merchantId);
    return this.serializeProduct(product);
  }

  async updateProduct(productId: string, userId: string, data: UpdateProductBodyType) {
    const product = await this.assertOwnedProduct(productId, userId);

    if (data.discountPriceFcfa !== undefined && data.discountPriceFcfa !== null) {
      const price = data.priceFcfa ?? Number((product as any).priceFcfa);
      if (data.discountPriceFcfa >= price) {
        throw new ValidationError('discountPriceFcfa must be less than priceFcfa');
      }
    }

    const updated = await this.catalogRepository.updateProduct(productId, data);
    await this.invalidateCache((product as any).merchantId);
    return this.serializeProduct(updated);
  }

  async deleteProduct(productId: string, userId: string) {
    const product = await this.assertOwnedProduct(productId, userId);
    await this.catalogRepository.softDeleteProduct(productId);
    await this.invalidateCache((product as any).merchantId);
  }

  async toggleAvailability(productId: string, userId: string, data: ToggleAvailabilityBodyType) {
    const product = await this.assertOwnedProduct(productId, userId);
    const updated = await this.catalogRepository.updateProduct(productId, { isAvailable: data.isAvailable });
    await this.invalidateCache((product as any).merchantId);
    return this.serializeProduct(updated);
  }

  // ============================================================
  // OPTIONS — MEMBER
  // ============================================================

  async createOption(productId: string, userId: string, data: CreateOptionBodyType) {
    const product = await this.assertOwnedProduct(productId, userId);

    const count = await this.catalogRepository.countOptionsByProduct(productId);
    if (count >= MAX_OPTIONS_PER_PRODUCT) {
      throw new ValidationError(`Maximum ${MAX_OPTIONS_PER_PRODUCT} options per product`);
    }

    this.validateOptionSelections(data.type, data.minSelection, data.maxSelection);

    const option = await this.catalogRepository.createOption(productId, data);
    await this.invalidateCache((product as any).merchantId);
    return option;
  }

  async updateOption(optionId: string, userId: string, data: UpdateOptionBodyType) {
    const option = await this.assertOwnedOption(optionId, userId);

    const type = data.type ?? option.type;
    const min = data.minSelection ?? option.minSelection;
    const max = data.maxSelection ?? option.maxSelection;
    this.validateOptionSelections(type, min, max);

    const updated = await this.catalogRepository.updateOption(optionId, data);
    await this.invalidateCache(option.product.merchantId);
    return updated;
  }

  async deleteOption(optionId: string, userId: string) {
    const option = await this.assertOwnedOption(optionId, userId);
    // Prisma onDelete: Cascade on ProductOptionChoice → choices deleted automatically
    await this.catalogRepository.deleteOption(optionId);
    await this.invalidateCache(option.product.merchantId);
  }

  // ============================================================
  // CHOICES — MEMBER
  // ============================================================

  async createChoice(optionId: string, userId: string, data: CreateChoiceBodyType) {
    const option = await this.assertOwnedOption(optionId, userId);

    const count = await this.catalogRepository.countChoicesByOption(optionId);
    if (count >= MAX_CHOICES_PER_OPTION) {
      throw new ValidationError(`Maximum ${MAX_CHOICES_PER_OPTION} choices per option`);
    }

    const choice = await this.catalogRepository.createChoice(optionId, data);
    await this.invalidateCache(option.product.merchantId);
    return choice;
  }

  async updateChoice(choiceId: string, userId: string, data: UpdateChoiceBodyType) {
    const choice = await this.assertOwnedChoice(choiceId, userId);
    const updated = await this.catalogRepository.updateChoice(choiceId, data);
    await this.invalidateCache(choice.productOption.product.merchantId);
    return updated;
  }

  async deleteChoice(choiceId: string, userId: string) {
    const choice = await this.assertOwnedChoice(choiceId, userId);
    await this.catalogRepository.deleteChoice(choiceId);
    await this.invalidateCache(choice.productOption.product.merchantId);
  }

  // ============================================================
  // OWNERSHIP ASSERTIONS (fetch + membership check, factorized)
  // ============================================================

  private async assertOwnedProduct(productId: string, userId: string) {
    const product = await this.catalogRepository.findProductById(productId);
    if (!product || (product as any).deletedAt) throw new NotFoundError('Product', productId);
    await this.merchantsService.verifyMembership(userId, (product as any).merchantId);
    return product;
  }

  private async assertOwnedOption(optionId: string, userId: string) {
    const option = await this.catalogRepository.findOptionById(optionId);
    if (!option) throw new NotFoundError('Option', optionId);
    await this.merchantsService.verifyMembership(userId, option.product.merchantId);
    return option;
  }

  private async assertOwnedChoice(choiceId: string, userId: string) {
    const choice = await this.catalogRepository.findChoiceById(choiceId);
    if (!choice) throw new NotFoundError('Choice', choiceId);
    await this.merchantsService.verifyMembership(userId, choice.productOption.product.merchantId);
    return choice;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private validateOptionSelections(type: string, min?: number, max?: number) {
    const minSel = min ?? 0;
    const maxSel = max ?? 1;
    if (type === 'SINGLE' && maxSel > 1) {
      throw new ValidationError('SINGLE option type must have maxSelection = 1');
    }
    if (type === 'MULTIPLE' && maxSel < minSel) {
      throw new ValidationError('maxSelection must be >= minSelection for MULTIPLE option');
    }
  }

  private async invalidateCache(merchantId: string): Promise<void> {
    // Delete all catalog cache keys for this merchant (pattern delete)
    const keys = await this.redis.keys(`${CATALOG_CACHE_PREFIX}${merchantId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private serializeCategory(c: Record<string, unknown>) {
    return {
      id: c.id, merchantId: c.merchantId, name: c.name,
      description: c.description ?? undefined, imageUrl: c.imageUrl ?? undefined,
      sortOrder: c.sortOrder, isActive: c.isActive,
      createdAt: (c.createdAt as Date).toISOString(),
    };
  }

  private serializeProduct(p: Record<string, unknown>) {
    return {
      id: p.id, merchantId: p.merchantId, categoryId: p.categoryId ?? undefined,
      name: p.name, description: p.description ?? undefined,
      imageUrl: p.imageUrl ?? undefined,
      priceFcfa: Number(p.priceFcfa), discountPriceFcfa: p.discountPriceFcfa ? Number(p.discountPriceFcfa) : undefined,
      isAvailable: p.isAvailable, stock: p.stock ?? undefined,
      preparationMinutes: p.preparationMinutes ?? undefined,
      tags: p.tags as string[], allergens: p.allergens as string[],
      createdAt: (p.createdAt as Date).toISOString(),
    };
  }

  private serializeProductDetail(p: any) {
    return {
      ...this.serializeProduct(p),
      options: (p.options ?? []).map((o: any) => ({
        id: o.id, name: o.name, type: o.type, required: o.required,
        minSelection: o.minSelection, maxSelection: o.maxSelection,
        choices: (o.choices ?? []).map((c: any) => ({
          id: c.id, name: c.name, priceFcfa: Number(c.priceFcfa), isAvailable: c.isAvailable,
        })),
      })),
    };
  }
}

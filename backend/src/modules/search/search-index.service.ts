/**
 * Search Index Service — Meilisearch synchronization
 *
 * Responsible for keeping the Meilisearch 'products' index in sync
 * with PostgreSQL. Fail-open: Meilisearch errors do NOT fail Postgres writes.
 */

import type { PrismaClient } from '@prisma/client';
import type { MeiliSearch, Index } from 'meilisearch';
import type { Logger } from 'pino';
import { MEILISEARCH_PRODUCTS_INDEX } from './search.types.js';
import type { MeilisearchProductDocument } from './search.types.js';

export class SearchIndexService {
  private index: Index;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly meilisearch: MeiliSearch,
    private readonly logger: Logger,
  ) {
    this.index = this.meilisearch.index(MEILISEARCH_PRODUCTS_INDEX);
  }

  // ============================================================
  // INDEX CONFIGURATION (called once at startup or reindex)
  // ============================================================

  async configureIndex(): Promise<void> {
    try {
      await this.meilisearch.createIndex(MEILISEARCH_PRODUCTS_INDEX, { primaryKey: 'id' });
    } catch {
      // Index may already exist — that's fine
    }

    await this.index.updateSettings({
      searchableAttributes: ['name', 'description', 'tags', 'merchantName', 'categoryName'],
      filterableAttributes: ['merchantType', 'merchantStatus', 'isAvailable', 'isMerchantDeleted', 'merchantId'],
      sortableAttributes: ['priceFcfa'],
    });

    this.logger.info('Meilisearch products index configured');
  }

  // ============================================================
  // SINGLE PRODUCT INDEX/REMOVE
  // ============================================================

  async indexProduct(productId: string): Promise<void> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          merchant: { select: { id: true, businessName: true, city: true, type: true, status: true, deletedAt: true } },
          category: { select: { name: true } },
        },
      });

      if (!product) return;

      const doc: MeilisearchProductDocument = {
        id: product.id,
        merchantId: product.merchantId,
        merchantName: product.merchant.businessName,
        merchantCity: product.merchant.city,
        merchantType: product.merchant.type,
        merchantStatus: product.merchant.status,
        name: product.name,
        description: product.description ?? '',
        tags: product.tags,
        priceFcfa: Number(product.priceFcfa),
        discountPriceFcfa: product.discountPriceFcfa ? Number(product.discountPriceFcfa) : null,
        imageUrl: product.imageUrl,
        categoryName: product.category?.name ?? null,
        isAvailable: product.isAvailable && !product.deletedAt,
        isMerchantDeleted: !!product.merchant.deletedAt,
      };

      await this.index.addDocuments([doc]);
    } catch (error) {
      this.logger.warn({ err: error, productId }, 'Failed to index product in Meilisearch — fail-open');
    }
  }

  async removeProduct(productId: string): Promise<void> {
    try {
      await this.index.deleteDocument(productId);
    } catch (error) {
      this.logger.warn({ err: error, productId }, 'Failed to remove product from Meilisearch — fail-open');
    }
  }

  // ============================================================
  // BULK: REINDEX ALL PRODUCTS FOR A MERCHANT
  // ============================================================

  async reindexMerchantProducts(merchantId: string): Promise<void> {
    try {
      const products = await this.prisma.product.findMany({
        where: { merchantId },
        include: {
          merchant: { select: { id: true, businessName: true, city: true, type: true, status: true, deletedAt: true } },
          category: { select: { name: true } },
        },
      });

      const docs: MeilisearchProductDocument[] = products.map((p) => ({
        id: p.id,
        merchantId: p.merchantId,
        merchantName: p.merchant.businessName,
        merchantCity: p.merchant.city,
        merchantType: p.merchant.type,
        merchantStatus: p.merchant.status,
        name: p.name,
        description: p.description ?? '',
        tags: p.tags,
        priceFcfa: Number(p.priceFcfa),
        discountPriceFcfa: p.discountPriceFcfa ? Number(p.discountPriceFcfa) : null,
        imageUrl: p.imageUrl,
        categoryName: p.category?.name ?? null,
        isAvailable: p.isAvailable && !p.deletedAt,
        isMerchantDeleted: !!p.merchant.deletedAt,
      }));

      if (docs.length > 0) {
        await this.index.addDocuments(docs);
      }
    } catch (error) {
      this.logger.warn({ err: error, merchantId }, 'Failed to reindex merchant products — fail-open');
    }
  }

  // ============================================================
  // FULL REINDEX (for npm run reindex command)
  // ============================================================

  async fullReindex(): Promise<number> {
    await this.index.deleteAllDocuments();
    await this.configureIndex();

    const products = await this.prisma.product.findMany({
      include: {
        merchant: { select: { id: true, businessName: true, city: true, type: true, status: true, deletedAt: true } },
        category: { select: { name: true } },
      },
    });

    const docs: MeilisearchProductDocument[] = products.map((p) => ({
      id: p.id,
      merchantId: p.merchantId,
      merchantName: p.merchant.businessName,
      merchantCity: p.merchant.city,
      merchantType: p.merchant.type,
      merchantStatus: p.merchant.status,
      name: p.name,
      description: p.description ?? '',
      tags: p.tags,
      priceFcfa: Number(p.priceFcfa),
      discountPriceFcfa: p.discountPriceFcfa ? Number(p.discountPriceFcfa) : null,
      imageUrl: p.imageUrl,
      categoryName: p.category?.name ?? null,
      isAvailable: p.isAvailable && !p.deletedAt,
      isMerchantDeleted: !!p.merchant.deletedAt,
    }));

    if (docs.length > 0) {
      await this.index.addDocuments(docs, { primaryKey: 'id' });
    }

    this.logger.info({ count: docs.length }, 'Full reindex completed');
    return docs.length;
  }
}

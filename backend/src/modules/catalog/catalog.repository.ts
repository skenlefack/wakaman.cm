/**
 * Catalog module — Repository (Prisma)
 */

import type { PrismaClient, Category, Product, ProductOption, ProductOptionChoice } from '@prisma/client';
import type { CreateProductBodyType, UpdateProductBodyType, ProductsQueryType } from './catalog.schemas.js';

const PRODUCT_SELECT = {
  id: true, merchantId: true, categoryId: true, name: true, description: true,
  imageUrl: true, priceFcfa: true, discountPriceFcfa: true, isAvailable: true,
  stock: true, preparationMinutes: true, tags: true, allergens: true,
  createdAt: true, updatedAt: true, deletedAt: true,
} as const;

export class CatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ============================================================
  // CATEGORIES
  // ============================================================

  async createCategory(merchantId: string, data: { name: string; description?: string; imageUrl?: string }): Promise<Category> {
    const maxSort = await this.prisma.category.aggregate({ where: { merchantId }, _max: { sortOrder: true } });
    return this.prisma.category.create({
      data: { merchantId, name: data.name, description: data.description, imageUrl: data.imageUrl, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
    });
  }

  async findCategoryById(id: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { id } });
  }

  async updateCategory(id: string, data: Record<string, unknown>): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  async deleteCategory(id: string): Promise<void> {
    await this.prisma.category.delete({ where: { id } });
  }

  async countCategoriesByMerchant(merchantId: string): Promise<number> {
    return this.prisma.category.count({ where: { merchantId } });
  }

  async countProductsInCategory(categoryId: string): Promise<number> {
    return this.prisma.product.count({ where: { categoryId, deletedAt: null } });
  }

  async listCategoriesByMerchant(merchantId: string): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { merchantId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  async reorderCategories(merchantId: string, categoryIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      categoryIds.map((id, index) =>
        this.prisma.category.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );
  }

  async findCategoriesByIds(ids: string[]): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { id: { in: ids } } });
  }

  // ============================================================
  // PRODUCTS
  // ============================================================

  async createProduct(merchantId: string, data: CreateProductBodyType): Promise<Product> {
    return this.prisma.product.create({
      data: {
        merchantId,
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        imageUrl: data.imageUrl,
        priceFcfa: data.priceFcfa,
        discountPriceFcfa: data.discountPriceFcfa,
        stock: data.stock,
        preparationMinutes: data.preparationMinutes,
        tags: data.tags ?? [],
        allergens: data.allergens ?? [],
      },
      select: PRODUCT_SELECT,
    }) as unknown as Product;
  }

  async findProductById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id }, select: PRODUCT_SELECT }) as unknown as Promise<Product | null>;
  }

  async findProductWithOptions(id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      select: {
        ...PRODUCT_SELECT,
        options: { include: { choices: true } },
      },
    });
  }

  async updateProduct(id: string, data: UpdateProductBodyType): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data: data as any, select: PRODUCT_SELECT }) as unknown as Product;
  }

  async softDeleteProduct(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isAvailable: false } });
  }

  async countProductsByMerchant(merchantId: string): Promise<number> {
    return this.prisma.product.count({ where: { merchantId, deletedAt: null } });
  }

  async listPublicProducts(merchantId: string, query: ProductsQueryType): Promise<{ items: Product[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Record<string, unknown> = { merchantId, isAvailable: true, deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, select: PRODUCT_SELECT, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items as unknown as Product[], total };
  }

  // ============================================================
  // OPTIONS
  // ============================================================

  async createOption(productId: string, data: { name: string; type: string; required?: boolean; minSelection?: number; maxSelection?: number }): Promise<ProductOption> {
    return this.prisma.productOption.create({
      data: { productId, name: data.name, type: data.type, required: data.required ?? false, minSelection: data.minSelection ?? 0, maxSelection: data.maxSelection ?? 1 },
    });
  }

  async findOptionById(id: string): Promise<(ProductOption & { product: { merchantId: string } }) | null> {
    return this.prisma.productOption.findUnique({ where: { id }, include: { product: { select: { merchantId: true } } } }) as any;
  }

  async updateOption(id: string, data: Record<string, unknown>): Promise<ProductOption> {
    return this.prisma.productOption.update({ where: { id }, data });
  }

  async deleteOption(id: string): Promise<void> {
    await this.prisma.productOption.delete({ where: { id } }); // cascade deletes choices
  }

  async countOptionsByProduct(productId: string): Promise<number> {
    return this.prisma.productOption.count({ where: { productId } });
  }

  // ============================================================
  // CHOICES
  // ============================================================

  async createChoice(productOptionId: string, data: { name: string; priceFcfa?: number; isAvailable?: boolean }): Promise<ProductOptionChoice> {
    return this.prisma.productOptionChoice.create({
      data: { productOptionId, name: data.name, priceFcfa: data.priceFcfa ?? 0, isAvailable: data.isAvailable ?? true },
    });
  }

  async findChoiceById(id: string): Promise<(ProductOptionChoice & { productOption: { product: { merchantId: string } } }) | null> {
    return this.prisma.productOptionChoice.findUnique({
      where: { id },
      include: { productOption: { include: { product: { select: { merchantId: true } } } } },
    }) as any;
  }

  async updateChoice(id: string, data: Record<string, unknown>): Promise<ProductOptionChoice> {
    return this.prisma.productOptionChoice.update({ where: { id }, data });
  }

  async deleteChoice(id: string): Promise<void> {
    await this.prisma.productOptionChoice.delete({ where: { id } });
  }

  async countChoicesByOption(optionId: string): Promise<number> {
    return this.prisma.productOptionChoice.count({ where: { productOptionId: optionId } });
  }
}

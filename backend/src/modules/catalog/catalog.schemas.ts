/**
 * Catalog module — Schemas (TypeBox)
 *
 * Feature 2/3: Categories, Products, Options, Choices.
 */

import { Type, Static } from '@sinclair/typebox';

// ============================================================
// PARAMS
// ============================================================

export const MerchantIdParams = Type.Object({
  merchantId: Type.String({ pattern: '^mch_[a-f0-9]{32}$' }),
});

export const ProductIdParams = Type.Object({
  id: Type.String({ pattern: '^prd_[a-f0-9]{32}$' }),
});

export const CategoryIdParams = Type.Object({
  id: Type.String({ pattern: '^cat_[a-f0-9]{32}$' }),
});

export const OptionIdParams = Type.Object({
  id: Type.String({ pattern: '^opt_[a-f0-9]{32}$' }),
});

export const ChoiceIdParams = Type.Object({
  id: Type.String({ pattern: '^chc_[a-f0-9]{32}$' }),
});

// ============================================================
// CATEGORY
// ============================================================

export const CreateCategoryBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  imageUrl: Type.Optional(Type.String({ format: 'uri' })),
});

export const UpdateCategoryBody = Type.Partial(CreateCategoryBody);

export const ReorderCategoriesBody = Type.Object({
  categoryIds: Type.Array(Type.String(), { minItems: 1, maxItems: 10 }),
});

export const CategoryResponse = Type.Object({
  id: Type.String(),
  merchantId: Type.String(),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  imageUrl: Type.Optional(Type.String()),
  sortOrder: Type.Integer(),
  isActive: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
});

export const CategoriesListResponse = Type.Object({
  categories: Type.Array(CategoryResponse),
});

// ============================================================
// PRODUCT
// ============================================================

export const CreateProductBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  imageUrl: Type.Optional(Type.String({ format: 'uri' })),
  categoryId: Type.Optional(Type.String()),
  priceFcfa: Type.Number({ minimum: 0, maximum: 999999999999 }),
  discountPriceFcfa: Type.Optional(Type.Number({ minimum: 0, maximum: 999999999999 })),
  stock: Type.Optional(Type.Integer({ minimum: 0 })),
  preparationMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 180 })),
  tags: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
  allergens: Type.Optional(Type.Array(Type.String(), { maxItems: 20 })),
});

export const UpdateProductBody = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ maxLength: 2000 }),
    imageUrl: Type.String({ format: 'uri' }),
    categoryId: Type.Union([Type.String(), Type.Null()]),
    priceFcfa: Type.Number({ minimum: 0, maximum: 999999999999 }),
    discountPriceFcfa: Type.Union([Type.Number({ minimum: 0, maximum: 999999999999 }), Type.Null()]),
    isAvailable: Type.Boolean(),
    stock: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    preparationMinutes: Type.Union([Type.Integer({ minimum: 1, maximum: 180 }), Type.Null()]),
    tags: Type.Array(Type.String(), { maxItems: 20 }),
    allergens: Type.Array(Type.String(), { maxItems: 20 }),
  }),
);

export const ToggleAvailabilityBody = Type.Object({
  isAvailable: Type.Boolean(),
});

export const ProductsQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  categoryId: Type.Optional(Type.String()),
});

const ChoiceResponse = Type.Object({
  id: Type.String(),
  name: Type.String(),
  priceFcfa: Type.Number(),
  isAvailable: Type.Boolean(),
});

const OptionResponse = Type.Object({
  id: Type.String(),
  name: Type.String(),
  type: Type.String(),
  required: Type.Boolean(),
  minSelection: Type.Integer(),
  maxSelection: Type.Integer(),
  choices: Type.Array(ChoiceResponse),
});

export const ProductResponse = Type.Object({
  id: Type.String(),
  merchantId: Type.String(),
  categoryId: Type.Optional(Type.String()),
  name: Type.String(),
  description: Type.Optional(Type.String()),
  imageUrl: Type.Optional(Type.String()),
  priceFcfa: Type.Number(),
  discountPriceFcfa: Type.Optional(Type.Number()),
  isAvailable: Type.Boolean(),
  stock: Type.Optional(Type.Integer()),
  preparationMinutes: Type.Optional(Type.Integer()),
  tags: Type.Array(Type.String()),
  allergens: Type.Array(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
});

export const ProductDetailResponse = Type.Intersect([
  ProductResponse,
  Type.Object({ options: Type.Array(OptionResponse) }),
]);

export const ProductsListResponse = Type.Object({
  items: Type.Array(ProductResponse),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

// ============================================================
// OPTIONS & CHOICES
// ============================================================

export const CreateOptionBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  type: Type.Union([Type.Literal('SINGLE'), Type.Literal('MULTIPLE')]),
  required: Type.Optional(Type.Boolean()),
  minSelection: Type.Optional(Type.Integer({ minimum: 0 })),
  maxSelection: Type.Optional(Type.Integer({ minimum: 1 })),
});

export const UpdateOptionBody = Type.Partial(CreateOptionBody);

export const CreateChoiceBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  priceFcfa: Type.Optional(Type.Number({ minimum: 0, maximum: 999999999999 })),
  isAvailable: Type.Optional(Type.Boolean()),
});

export const UpdateChoiceBody = Type.Partial(CreateChoiceBody);

// ============================================================
// SHARED
// ============================================================

export const MessageResponse = Type.Object({ message: Type.String() });
export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
  requestId: Type.String(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type CreateCategoryBodyType = Static<typeof CreateCategoryBody>;
export type UpdateCategoryBodyType = Static<typeof UpdateCategoryBody>;
export type ReorderCategoriesBodyType = Static<typeof ReorderCategoriesBody>;
export type CreateProductBodyType = Static<typeof CreateProductBody>;
export type UpdateProductBodyType = Static<typeof UpdateProductBody>;
export type ToggleAvailabilityBodyType = Static<typeof ToggleAvailabilityBody>;
export type ProductsQueryType = Static<typeof ProductsQuery>;
export type CreateOptionBodyType = Static<typeof CreateOptionBody>;
export type UpdateOptionBodyType = Static<typeof UpdateOptionBody>;
export type CreateChoiceBodyType = Static<typeof CreateChoiceBody>;
export type UpdateChoiceBodyType = Static<typeof UpdateChoiceBody>;

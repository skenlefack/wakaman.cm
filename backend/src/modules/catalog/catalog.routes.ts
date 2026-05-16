/**
 * Catalog module — Routes Fastify
 *
 * Feature 2/3: Categories, Products, Options, Choices.
 * Membership verification done inside service (not preHandler)
 * because resources don't always have merchantId in URL params.
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import * as handlers from './catalog.handlers.js';
import * as schemas from './catalog.schemas.js';

const catalogRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ============================================================
  // PUBLIC — Categories
  // ============================================================

  fastify.get('/merchants/:merchantId/categories', {
    schema: {
      tags: ['Catalog'],
      summary: 'List categories for a merchant (public)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.CategoriesListResponse },
    },
    handler: handlers.listCategories,
  });

  // ============================================================
  // PUBLIC — Products
  // ============================================================

  fastify.get('/merchants/:merchantId/products', {
    schema: {
      tags: ['Catalog'],
      summary: 'List available products for a merchant (public, cached 2min)',
      params: schemas.MerchantIdParams,
      querystring: schemas.ProductsQuery,
      response: { 200: schemas.ProductsListResponse },
    },
    handler: handlers.listPublicProducts,
  });

  fastify.get('/products/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Get product detail with options and choices (public)',
      params: schemas.ProductIdParams,
      response: { 200: schemas.ProductDetailResponse, 404: schemas.ErrorResponse },
    },
    handler: handlers.getProductDetail,
  });

  // ============================================================
  // MEMBER — Categories
  // ============================================================

  fastify.post('/merchants/:merchantId/categories', {
    schema: {
      tags: ['Catalog'],
      summary: 'Create a category (merchant member)',
      params: schemas.MerchantIdParams,
      body: schemas.CreateCategoryBody,
      response: { 201: schemas.CategoryResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.createCategory,
  });

  fastify.patch('/categories/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Update a category (merchant member)',
      params: schemas.CategoryIdParams,
      body: schemas.UpdateCategoryBody,
      response: { 200: schemas.CategoryResponse, 403: schemas.ErrorResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateCategory,
  });

  fastify.delete('/categories/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Delete a category (merchant member, fails if products attached)',
      params: schemas.CategoryIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse, 409: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteCategory,
  });

  fastify.post('/merchants/:merchantId/categories/reorder', {
    schema: {
      tags: ['Catalog'],
      summary: 'Reorder categories (merchant member)',
      params: schemas.MerchantIdParams,
      body: schemas.ReorderCategoriesBody,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.reorderCategories,
  });

  // ============================================================
  // MEMBER — Products
  // ============================================================

  fastify.post('/merchants/:merchantId/products', {
    schema: {
      tags: ['Catalog'],
      summary: 'Create a product (merchant member)',
      params: schemas.MerchantIdParams,
      body: schemas.CreateProductBody,
      response: { 201: schemas.ProductResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.createProduct,
  });

  fastify.patch('/products/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Update a product (merchant member)',
      params: schemas.ProductIdParams,
      body: schemas.UpdateProductBody,
      response: { 200: schemas.ProductResponse, 403: schemas.ErrorResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateProduct,
  });

  fastify.delete('/products/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Soft delete a product (merchant member)',
      params: schemas.ProductIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteProduct,
  });

  fastify.post('/products/:id/availability', {
    schema: {
      tags: ['Catalog'],
      summary: 'Toggle product availability (quick stock toggle)',
      params: schemas.ProductIdParams,
      body: schemas.ToggleAvailabilityBody,
      response: { 200: schemas.ProductResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.toggleAvailability,
  });

  // ============================================================
  // MEMBER — Options
  // ============================================================

  fastify.post('/products/:id/options', {
    schema: {
      tags: ['Catalog'],
      summary: 'Add option to product (merchant member)',
      params: schemas.ProductIdParams,
      body: schemas.CreateOptionBody,
      response: { 201: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.createOption,
  });

  fastify.patch('/options/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Update option (merchant member)',
      params: schemas.OptionIdParams,
      body: schemas.UpdateOptionBody,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateOption,
  });

  fastify.delete('/options/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Delete option + choices (merchant member)',
      params: schemas.OptionIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteOption,
  });

  // ============================================================
  // MEMBER — Choices
  // ============================================================

  fastify.post('/options/:id/choices', {
    schema: {
      tags: ['Catalog'],
      summary: 'Add choice to option (merchant member)',
      params: schemas.OptionIdParams,
      body: schemas.CreateChoiceBody,
      response: { 201: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.createChoice,
  });

  fastify.patch('/choices/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Update choice (merchant member)',
      params: schemas.ChoiceIdParams,
      body: schemas.UpdateChoiceBody,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateChoice,
  });

  fastify.delete('/choices/:id', {
    schema: {
      tags: ['Catalog'],
      summary: 'Delete choice (merchant member)',
      params: schemas.ChoiceIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteChoice,
  });
};

export default catalogRoutes;

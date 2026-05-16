/**
 * Catalog module — Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CatalogService } from './catalog.service.js';
import type {
  CreateCategoryBodyType, UpdateCategoryBodyType, ReorderCategoriesBodyType,
  CreateProductBodyType, UpdateProductBodyType, ToggleAvailabilityBodyType, ProductsQueryType,
  CreateOptionBodyType, UpdateOptionBodyType, CreateChoiceBodyType, UpdateChoiceBodyType,
} from './catalog.schemas.js';

interface JwtPayload { sub: string }
const uid = (r: FastifyRequest) => (r.user as JwtPayload).sub;

// ============================================================
// CATEGORIES
// ============================================================

export async function listCategories(request: FastifyRequest<{ Params: { merchantId: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.listCategories(request.params.merchantId));
}

export async function createCategory(request: FastifyRequest<{ Params: { merchantId: string }; Body: CreateCategoryBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.code(201).send(await svc.createCategory(request.params.merchantId, uid(request), request.body));
}

export async function updateCategory(request: FastifyRequest<{ Params: { id: string }; Body: UpdateCategoryBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.updateCategory(request.params.id, uid(request), request.body));
}

export async function deleteCategory(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  await svc.deleteCategory(request.params.id, uid(request));
  return reply.send({ message: 'Category deleted' });
}

export async function reorderCategories(request: FastifyRequest<{ Params: { merchantId: string }; Body: ReorderCategoriesBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  await svc.reorderCategories(request.params.merchantId, uid(request), request.body);
  return reply.send({ message: 'Categories reordered' });
}

// ============================================================
// PRODUCTS
// ============================================================

export async function listPublicProducts(request: FastifyRequest<{ Params: { merchantId: string }; Querystring: ProductsQueryType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.listPublicProducts(request.params.merchantId, request.query));
}

export async function getProductDetail(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.getProductDetail(request.params.id));
}

export async function createProduct(request: FastifyRequest<{ Params: { merchantId: string }; Body: CreateProductBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.code(201).send(await svc.createProduct(request.params.merchantId, uid(request), request.body));
}

export async function updateProduct(request: FastifyRequest<{ Params: { id: string }; Body: UpdateProductBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.updateProduct(request.params.id, uid(request), request.body));
}

export async function deleteProduct(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  await svc.deleteProduct(request.params.id, uid(request));
  return reply.send({ message: 'Product deleted' });
}

export async function toggleAvailability(request: FastifyRequest<{ Params: { id: string }; Body: ToggleAvailabilityBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.toggleAvailability(request.params.id, uid(request), request.body));
}

// ============================================================
// OPTIONS
// ============================================================

export async function createOption(request: FastifyRequest<{ Params: { id: string }; Body: CreateOptionBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.code(201).send(await svc.createOption(request.params.id, uid(request), request.body));
}

export async function updateOption(request: FastifyRequest<{ Params: { id: string }; Body: UpdateOptionBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.updateOption(request.params.id, uid(request), request.body));
}

export async function deleteOption(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  await svc.deleteOption(request.params.id, uid(request));
  return reply.send({ message: 'Option deleted' });
}

// ============================================================
// CHOICES
// ============================================================

export async function createChoice(request: FastifyRequest<{ Params: { id: string }; Body: CreateChoiceBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.code(201).send(await svc.createChoice(request.params.id, uid(request), request.body));
}

export async function updateChoice(request: FastifyRequest<{ Params: { id: string }; Body: UpdateChoiceBodyType }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  return reply.send(await svc.updateChoice(request.params.id, uid(request), request.body));
}

export async function deleteChoice(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<CatalogService>('catalogService');
  await svc.deleteChoice(request.params.id, uid(request));
  return reply.send({ message: 'Choice deleted' });
}

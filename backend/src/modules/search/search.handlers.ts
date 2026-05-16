/**
 * Search module — Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NearbyQueryType, ProductSearchQueryType } from './search.schemas.js';
import type { SearchService } from './search.service.js';

export async function nearbyMerchants(
  request: FastifyRequest<{ Querystring: NearbyQueryType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<SearchService>('searchService');
  return reply.send(await svc.nearbyMerchants(request.query));
}

export async function searchProducts(
  request: FastifyRequest<{ Querystring: ProductSearchQueryType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<SearchService>('searchService');
  return reply.send(await svc.searchProducts(request.query));
}

/**
 * Search module — Routes Fastify
 *
 * Feature 3/3: Geo search (PostGIS) + product search (Meilisearch)
 * All public, no auth required.
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import * as handlers from './search.handlers.js';
import * as schemas from './search.schemas.js';

const searchRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/merchants/nearby', {
    schema: {
      tags: ['Search'],
      summary: 'Find nearby merchants (PostGIS)',
      description: 'Returns ACTIVE merchants within radius, sorted by distance. Includes isCurrentlyOpen.',
      querystring: schemas.NearbyQuery,
      response: { 200: schemas.NearbyResponse },
    },
    handler: handlers.nearbyMerchants,
  });

  fastify.get('/products/search', {
    schema: {
      tags: ['Search'],
      summary: 'Search products (Meilisearch)',
      description: 'Full-text search across products. Optional geo-filter if lat/lng provided.',
      querystring: schemas.ProductSearchQuery,
      response: { 200: schemas.ProductSearchResponse },
    },
    handler: handlers.searchProducts,
  });
};

export default searchRoutes;

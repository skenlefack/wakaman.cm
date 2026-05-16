/**
 * Full reindex script — rebuilds the Meilisearch products index from PostgreSQL.
 *
 * Usage: npm run reindex
 *
 * When to use:
 * - First deploy to production
 * - After detecting a desync between Postgres and Meilisearch
 * - After changing the index schema (searchable/filterable attributes)
 */

import { PrismaClient } from '@prisma/client';
import { MeiliSearch } from 'meilisearch';
import pino from 'pino';
import { SearchIndexService } from '../modules/search/search-index.service.js';

const logger = pino({ level: 'info' });

async function main() {
  const prisma = new PrismaClient();
  const meilisearch = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST ?? 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY,
  });

  const indexService = new SearchIndexService(prisma, meilisearch, logger);

  logger.info('Starting full reindex...');
  const count = await indexService.fullReindex();
  logger.info({ count }, 'Reindex complete');

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Reindex failed:', err);
  process.exit(1);
});

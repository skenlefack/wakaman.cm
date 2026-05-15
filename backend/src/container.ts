/**
 * Wakaman Backend — Dependency Injection Container (Awilix)
 *
 * Toutes les classes et instances partagées sont enregistrées ici.
 *
 * Lifetimes :
 * - asValue        : singleton (instance déjà créée)
 * - asClass.singleton() : 1 instance pour toute l'app
 * - asClass.scoped()    : 1 instance par requête HTTP (recommandé pour services)
 * - asClass.transient() : nouvelle instance à chaque resolve
 */

import { createContainer, asClass, asValue, AwilixContainer } from 'awilix';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import pino from 'pino';

// ============================================================
// CRÉATION DES INSTANCES SINGLETON
// ============================================================

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
});

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

// ============================================================
// CONTAINER
// ============================================================

export interface AppContainer {
  prisma: PrismaClient;
  redis: Redis;
  logger: pino.Logger;

  // Services à enregistrer ici au fur et à mesure :
  // usersService: UsersService;
  // usersRepository: UsersRepository;
  // ordersService: OrdersService;
  // ordersRepository: OrdersRepository;
  // paymentsService: PaymentsService;
  // mtnMomoProvider: MtnMomoProvider;
  // orangeMoneyProvider: OrangeMoneyProvider;
  // matchingService: MatchingService;
  // notificationsService: NotificationsService;
  // ...
}

export const container: AwilixContainer<AppContainer> = createContainer<AppContainer>({
  injectionMode: 'CLASSIC', // Injection par nom de paramètre
});

container.register({
  // Infrastructure (singletons)
  prisma: asValue(prisma),
  redis: asValue(redis),
  logger: asValue(logger),

  // Services : à ajouter au fur et à mesure que tu crées les modules
  // Exemple :
  // usersService: asClass(UsersService).scoped(),
  // usersRepository: asClass(UsersRepository).scoped(),
});

// ============================================================
// CLEAN SHUTDOWN
// ============================================================

container.cradle; // Force la création précoce pour détecter les erreurs DI

export async function disposeContainer() {
  await container.dispose();
  await prisma.$disconnect();
  redis.disconnect();
}

// Augmenter le type FastifyRequest pour avoir accès au container
declare module 'fastify' {
  interface FastifyRequest {
    container: AwilixContainer<AppContainer>;
  }
}

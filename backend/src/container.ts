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

import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { TokenService } from './modules/auth/token.service.js';
import type { JwtSign } from './modules/auth/token.service.js';
import { TwilioProvider } from './providers/sms/twilio.provider.js';
import { FakeSmsProvider } from './providers/sms/fake-sms.provider.js';
import type { SmsProvider } from './providers/sms/sms.provider.js';
import { UsersRepository } from './modules/users/users.repository.js';
import { UsersService } from './modules/users/users.service.js';

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

  // Auth module
  jwtSign: JwtSign;
  smsProvider: SmsProvider;
  authRepository: AuthRepository;
  tokenService: TokenService;
  authService: AuthService;

  // Users module
  usersRepository: UsersRepository;
  usersService: UsersService;

  // TODO: register as modules are implemented
  // ordersService: OrdersService;
  // ...
}

export const container: AwilixContainer<AppContainer> = createContainer<AppContainer>({
  injectionMode: 'CLASSIC', // Injection par nom de paramètre
});

// Select SMS provider based on environment
const smsProvider: SmsProvider = process.env.NODE_ENV === 'production'
  ? new TwilioProvider(logger)
  : new FakeSmsProvider(logger);

container.register({
  // Infrastructure (singletons)
  prisma: asValue(prisma),
  redis: asValue(redis),
  logger: asValue(logger),

  // Providers (singletons)
  smsProvider: asValue(smsProvider),

  // Auth module (scoped per request)
  // NOTE: jwtSign is registered later in server.ts after @fastify/jwt plugin loads
  authRepository: asClass(AuthRepository).scoped(),
  tokenService: asClass(TokenService).scoped(),
  authService: asClass(AuthService).scoped(),

  // Users module (scoped per request)
  usersRepository: asClass(UsersRepository).scoped(),
  usersService: asClass(UsersService).scoped(),
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
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

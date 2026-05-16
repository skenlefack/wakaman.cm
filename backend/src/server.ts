/**
 * Wakaman Backend — Server bootstrap
 * Fastify Pur Discipliné — Production-ready setup
 */

import Fastify, { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import autoload from '@fastify/autoload';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { asValue } from 'awilix';
import { container } from './container.js';
import { AppError } from './lib/errors.js';
import { registerSwagger } from './plugins/swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// LOGGER CONFIGURATION
// ============================================================

const loggerConfig = {
  development: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        colorize: true,
      },
    },
  },
  production: {
    level: 'info',
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
  },
  test: false,
};

// ============================================================
// BUILD FASTIFY INSTANCE
// ============================================================

export async function build(): Promise<FastifyInstance> {
  const env = (process.env.NODE_ENV ?? 'development') as keyof typeof loggerConfig;

  const fastify = Fastify({
    logger: loggerConfig[env] ?? true,
    trustProxy: true,            // Important derrière Cloudflare/GCP LB
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 1024 * 1024 * 10, // 10 MB max
  }).withTypeProvider<TypeBoxTypeProvider>();

  // ============================================================
  // DECORATORS GLOBAUX
  // ============================================================

  // Attacher le container DI à chaque requête (scoped)
  fastify.decorateRequest('container', null);
  fastify.addHook('onRequest', async (request) => {
    request.container = container.createScope();
  });

  fastify.addHook('onResponse', async (request) => {
    if (request.container) {
      await request.container.dispose();
    }
  });

  // ============================================================
  // PLUGINS DE SÉCURITÉ ET PERFORMANCE
  // ============================================================

  await fastify.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false, // API only, pas besoin
  });

  await fastify.register(import('@fastify/cors'), {
    origin: (origin, cb) => {
      const allowedOrigins = process.env.CORS_ORIGINS?.split(',') ?? [];
      if (!origin || allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  await fastify.register(import('@fastify/compress'), {
    global: true,
    threshold: 1024, // Compresser uniquement > 1KB
    encodings: ['br', 'gzip'],
  });

  await fastify.register(import('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute',
    redis: container.resolve('redis'),
  });

  await fastify.register(import('@fastify/cookie'), {
    secret: process.env.COOKIE_SECRET!,
  });

  await fastify.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: process.env.JWT_ACCESS_EXPIRES ?? '15m' },
  });

  // Expose jwt.sign to DI container so TokenService can generate tokens
  container.register({
    jwtSign: asValue(fastify.jwt.sign.bind(fastify.jwt)),
  });

  await fastify.register(import('@fastify/under-pressure'), {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1000000000,
    healthCheck: async () => true,
    healthCheckInterval: 5000,
    exposeStatusRoute: '/health',
  });

  await fastify.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB
    },
  });

  await fastify.register(import('@fastify/websocket'));

  // ============================================================
  // SWAGGER / OPENAPI DOCUMENTATION
  // ============================================================

  await registerSwagger(fastify);

  // ============================================================
  // AUTH HOOK (decorator pour les routes protégées)
  // ============================================================

  const redis = container.resolve('redis');

  fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid token' });
    }

    // Check Redis blocklist for suspended/banned users
    const user = request.user as { sub: string } | undefined;
    if (user) {
      try {
        const blocked = await redis.get(`blocked:${user.sub}`);
        if (blocked) {
          return reply.code(403).send({ error: 'FORBIDDEN', message: 'Account suspended' });
        }
      } catch {
        // Redis unavailable — fail-open (15 min max exposure, refresh blocks anyway)
        request.log.warn({ userId: user.sub }, 'Redis blocklist check failed — fail-open');
      }
    }
  });

  fastify.decorate('requireAdmin', async (request: any, reply: any) => {
    const user = request.user as { sub: string; type: string } | undefined;
    if (!user || user.type !== 'ADMIN') {
      reply.code(403).send({ error: 'FORBIDDEN', message: 'Admin access required' });
    }
  });

  // ============================================================
  // GLOBAL ERROR HANDLER
  // ============================================================

  fastify.setErrorHandler((error, request, reply) => {
    // Erreurs métier (AppError)
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
        requestId: request.id,
      });
    }

    // Erreurs de validation Fastify
    if (error.validation) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.validation,
        requestId: request.id,
      });
    }

    // Erreur inconnue : log + 500
    request.log.error({ err: error }, 'Unhandled error');
    return reply.code(500).send({
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: request.id,
    });
  });

  // ============================================================
  // AUTOLOAD ROUTES (modules métier)
  // ============================================================

  await fastify.register(autoload, {
    dir: join(__dirname, 'modules'),
    matchFilter: (path) => path.endsWith('.routes.ts') || path.endsWith('.routes.js'),
    options: { prefix: '/api/v1' },
  });

  // ============================================================
  // ROOT ROUTES
  // ============================================================

  fastify.get('/', async () => ({
    name: 'Wakaman API',
    version: '0.1.0',
    status: 'operational',
    docs: '/docs',
  }));

  return fastify;
}

// ============================================================
// START SERVER
// ============================================================

async function start() {
  try {
    const fastify = await build();
    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? '0.0.0.0';

    await fastify.listen({ port, host });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      fastify.log.info(`Received ${signal}, shutting down gracefully...`);
      await fastify.close();
      await container.dispose();
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Démarrer si exécuté directement (pas en import)
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

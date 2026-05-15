# Wakaman Backend — Conventions Fastify Pur

## Stack

- **Framework** : Fastify 5.x (PAS NestJS, PAS Express)
- **Langage** : TypeScript 5.5+ (mode strict, `noImplicitAny`, `strictNullChecks`)
- **Runtime** : Node.js 22 LTS
- **ORM** : Prisma 5+
- **BDD** : PostgreSQL 16 + PostGIS 3.4+
- **Cache** : Redis 7 (via `ioredis`)
- **Queue** : RabbitMQ (via `amqplib`)
- **Validation** : JSON Schema + TypeBox (natif Fastify, PAS class-validator)
- **DI Container** : Awilix 10+ (PAS de DI manuelle, PAS de @Injectable())
- **Tests** : Vitest + Supertest (PAS Jest)

## Philosophie

**Fastify Pur Discipliné** : pas d'abstractions imposées par un framework lourd, mais conventions strictes pour permettre à Claude Code de générer du code cohérent.

## Structure d'un module métier

Chaque module suit ce pattern STRICT :

```
src/modules/<feature>/
├── <feature>.routes.ts              # Définition des routes Fastify (FastifyPluginAsync)
├── <feature>.handlers.ts            # Handlers (logique HTTP)
├── <feature>.service.ts             # Logique métier pure
├── <feature>.repository.ts          # Accès données (Prisma)
├── <feature>.schemas.ts             # JSON Schemas TypeBox
├── <feature>.types.ts               # Types TypeScript
├── <feature>.errors.ts              # Erreurs domaine spécifiques
└── <feature>.test.ts                # Tests Vitest
```

## Convention de DI avec Awilix

Tous les services s'enregistrent dans `src/container.ts` avec scope approprié :

```typescript
// src/container.ts
import { createContainer, asClass, asValue, Lifetime } from 'awilix';
import { UsersService } from './modules/users/users.service';
import { UsersRepository } from './modules/users/users.repository';

export const container = createContainer({ injectionMode: 'CLASSIC' });

container.register({
  // Singletons
  prisma: asValue(prismaClient),
  redis: asValue(redisClient),
  
  // Per-request scope (services)
  usersService: asClass(UsersService).scoped(),
  usersRepository: asClass(UsersRepository).scoped(),
  // ... autres modules
});
```

Les services sont injectés via constructeur :

```typescript
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly redis: Redis,
  ) {}
  
  async findById(id: string) {
    const cached = await this.redis.get(`user:${id}`);
    if (cached) return JSON.parse(cached);
    
    const user = await this.usersRepository.findById(id);
    await this.redis.setex(`user:${id}`, 300, JSON.stringify(user));
    return user;
  }
}
```

## Pattern Routes Fastify

```typescript
// users.routes.ts
import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import * as handlers from './users.handlers';
import * as schemas from './users.schemas';

const usersRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get('/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID',
      params: schemas.UserIdParams,
      response: { 200: schemas.UserResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.getUser,
  });
  
  // ... autres routes
};

export default usersRoutes;
```

## Pattern Handlers

Les handlers sont des fonctions pures qui :
1. Extraient les données de la requête
2. Appellent les services (via DI)
3. Renvoient la réponse

```typescript
// users.handlers.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { container } from '../../container';

export async function getUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const usersService = container.resolve('usersService');
  const user = await usersService.findById(request.params.id);
  return user;
}
```

## Validation avec TypeBox

Toujours utiliser TypeBox pour les schemas (types TypeScript inférés automatiquement) :

```typescript
// users.schemas.ts
import { Type, Static } from '@sinclair/typebox';

export const UserIdParams = Type.Object({
  id: Type.String({ pattern: '^usr_[a-f0-9]{32}$' }),
});

export const UserResponse = Type.Object({
  id: Type.String(),
  phone: Type.String(),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  type: Type.Union([
    Type.Literal('CLIENT'),
    Type.Literal('COURIER'),
    Type.Literal('MERCHANT'),
  ]),
  createdAt: Type.String({ format: 'date-time' }),
});

export type UserResponseType = Static<typeof UserResponse>;
```

## Gestion d'erreurs centralisée

Erreurs métier custom étendant `AppError` :

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', 404, `${resource} ${id} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: unknown) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}
```

Handler global dans `server.ts` :

```typescript
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      details: error.details,
    });
  }
  // Erreur inconnue : log + 500
  request.log.error(error);
  return reply.code(500).send({ error: 'INTERNAL_ERROR' });
});
```

## Plugins Fastify utilisés

Tous chargés depuis `src/plugins/` :

```typescript
// plugins disponibles
@fastify/cors            // CORS
@fastify/helmet          // Headers sécurité
@fastify/jwt             // JWT auth
@fastify/cookie          // Cookies signés
@fastify/rate-limit      // Rate limiting (Redis-backed)
@fastify/compress        // Compression Brotli/Gzip
@fastify/multipart       // Upload fichiers
@fastify/websocket       // WebSocket pour tracking
@fastify/swagger         // OpenAPI generation
@fastify/swagger-ui      // Swagger UI interactive
@fastify/under-pressure  // Health & circuit breaker
```

## Conventions de code

- **Imports** : path absolus depuis `src/` via `@/`
- **Async/await** : partout, JAMAIS de callbacks
- **Pas de `any`** : utiliser `unknown` + narrowing
- **Pas de `console.*`** : utiliser `request.log` ou `fastify.log`
- **Logger Pino** : structuré JSON en prod, pretty en dev
- **Correlation IDs** : générés automatiquement par middleware

## Performance — règles d'or

1. **Toujours utiliser les `select` Prisma** pour éviter d'over-fetcher
2. **Cache Redis** sur les catalogues marchands (TTL 5 min)
3. **Pagination obligatoire** sur tous les `findMany` (default 20, max 100)
4. **Indexer** les colonnes des `WHERE`, `JOIN`, `ORDER BY`
5. **Connection pooling** Prisma : `connection_limit=20` en prod
6. **Compression Brotli** activée sur toutes les réponses > 1KB
7. **HTTP/2** activé (via Cloudflare en prod)

## Tests avec Vitest

```typescript
// users.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../../test/helper';

describe('Users module', () => {
  let app;
  
  beforeAll(async () => {
    app = await build();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  it('should return user by id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/usr_test123',
      headers: { authorization: 'Bearer valid-token' },
    });
    
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: 'usr_test123',
      phone: expect.stringMatching(/^\+237/),
    });
  });
});
```

## Sécurité — non-négociable

- JWT signés avec rotation des secrets (env vars)
- Rate limiting strict sur `/auth/*` (5 req/min/IP)
- CSRF protection sur les routes mutations (cookies)
- Validation INPUT systématique (JSON Schema)
- Sanitization OUTPUT (jamais de leak de données sensibles)
- Audit log sur actions financières
- Secrets dans `.env` (jamais committed) → Secret Manager GCP en prod

## Pour Claude Code — workflow recommandé

Quand tu génères un nouveau module, suis CET ordre :

1. `<feature>.schemas.ts` — Définir les types d'abord (contrats clairs)
2. `<feature>.types.ts` — Types métier (Domain models)
3. `<feature>.repository.ts` — Accès BDD via Prisma
4. `<feature>.service.ts` — Logique métier
5. `<feature>.handlers.ts` — HTTP layer
6. `<feature>.routes.ts` — Définition des routes
7. `<feature>.test.ts` — Tests Vitest
8. Enregistrer dans `container.ts`
9. Enregistrer la route dans `server.ts`

**Ne JAMAIS commencer par les routes**. Toujours partir des types et contrats.

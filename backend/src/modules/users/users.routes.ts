/**
 * Users module — Routes Fastify
 *
 * Endpoints:
 * - GET    /users          : Liste paginée (admin)
 * - GET    /users/:id      : Détail utilisateur
 * - POST   /users          : Créer un utilisateur
 * - PATCH  /users/:id      : Mettre à jour
 * - DELETE /users/:id      : Soft delete
 * - GET    /users/me       : Mon profil (utilisateur connecté)
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import * as handlers from './users.handlers.js';
import * as schemas from './users.schemas.js';

const usersRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ============================================================
  // GET /users/me — Mon profil
  // ============================================================
  fastify.get('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Get current user profile',
      response: {
        200: schemas.UserResponse,
        401: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.getCurrentUser,
  });

  // ============================================================
  // GET /users/:id — Détail
  // ============================================================
  fastify.get('/users/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID',
      params: schemas.UserIdParams,
      response: {
        200: schemas.UserResponse,
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.getUserById,
  });

  // ============================================================
  // GET /users — Liste (admin only)
  // ============================================================
  fastify.get('/users', {
    schema: {
      tags: ['Users'],
      summary: 'List users (admin only)',
      querystring: schemas.ListUsersQuery,
      response: {
        200: schemas.UsersListResponse,
        403: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate], // TODO: ajouter check admin role
    handler: handlers.listUsers,
  });

  // ============================================================
  // POST /users — Créer
  // ============================================================
  fastify.post('/users', {
    schema: {
      tags: ['Users'],
      summary: 'Create a new user',
      body: schemas.CreateUserBody,
      response: {
        201: schemas.UserResponse,
        400: schemas.ErrorResponse,
        409: schemas.ErrorResponse,
      },
    },
    handler: handlers.createUser,
  });

  // ============================================================
  // PATCH /users/:id — Mettre à jour
  // ============================================================
  fastify.patch('/users/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Update user',
      params: schemas.UserIdParams,
      body: schemas.UpdateUserBody,
      response: {
        200: schemas.UserResponse,
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateUser,
  });

  // ============================================================
  // DELETE /users/:id — Soft delete
  // ============================================================
  fastify.delete('/users/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Soft delete user',
      params: schemas.UserIdParams,
      response: {
        204: Type.Null(),
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteUser,
  });
};

export default usersRoutes;

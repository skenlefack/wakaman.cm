/**
 * Users module — Routes Fastify
 *
 * Profile management for authenticated users + admin operations.
 * Auth routes (signup, login, refresh, etc.) are in the auth module.
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import * as handlers from './users.handlers.js';
import * as schemas from './users.schemas.js';

const usersRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ============================================================
  // GET /users/me — My profile (cached in Redis)
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
    handler: handlers.getMyProfile,
  });

  // ============================================================
  // PATCH /users/me — Update my profile
  // ============================================================
  fastify.patch('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Update current user profile',
      body: schemas.UpdateMyProfileBody,
      response: {
        200: schemas.UserResponse,
        401: schemas.ErrorResponse,
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.updateMyProfile,
  });

  // ============================================================
  // DELETE /users/me — Soft delete my account
  // ============================================================
  fastify.delete('/users/me', {
    schema: {
      tags: ['Users'],
      summary: 'Delete my account (soft delete)',
      description: 'Sets status to DELETED, sets deletedAt, revokes all sessions. Irreversible from user side.',
      response: {
        200: schemas.MessageResponse,
        401: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.deleteMyAccount,
  });

  // ============================================================
  // GET /users/:id — Admin: get user by ID
  // ============================================================
  fastify.get('/users/:id', {
    schema: {
      tags: ['Users'],
      summary: 'Get user by ID (admin only)',
      params: schemas.UserIdParams,
      response: {
        200: schemas.UserResponse,
        403: schemas.ErrorResponse,
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.getUserById,
  });

  // ============================================================
  // GET /users — Admin: list users
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
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.listUsers,
  });

  // ============================================================
  // PATCH /users/:id/status — Admin: change user status
  // ============================================================
  fastify.patch('/users/:id/status', {
    schema: {
      tags: ['Users'],
      summary: 'Change user status (admin only)',
      description: 'Suspend, ban, or reactivate a user. Admin cannot change own status.',
      params: schemas.UserIdParams,
      body: schemas.UpdateUserStatusBody,
      response: {
        200: schemas.UserResponse,
        400: schemas.ErrorResponse,
        403: schemas.ErrorResponse,
        404: schemas.ErrorResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.updateUserStatus,
  });
};

export default usersRoutes;

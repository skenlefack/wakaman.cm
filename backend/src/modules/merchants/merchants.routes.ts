/**
 * Merchants module — Routes Fastify
 *
 * Feature 1/3: Merchant CRUD, team management, hours.
 * Public, owner/team, and admin routes.
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as handlers from './merchants.handlers.js';
import * as schemas from './merchants.schemas.js';
import type { MerchantsService } from './merchants.service.js';

// ============================================================
// MEMBERSHIP PRE-HANDLERS
// ============================================================

async function requireMerchantMember(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  const userId = (request.user as { sub: string }).sub;
  await svc.verifyMembership(userId, request.params.id);
}

async function requireMerchantOwner(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  const userId = (request.user as { sub: string }).sub;
  const role = await svc.verifyMembership(userId, request.params.id);
  if (role !== 'OWNER') {
    return reply.code(403).send({ error: 'FORBIDDEN', message: 'Owner access required' });
  }
}

const merchantsRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // ============================================================
  // PUBLIC — No auth required
  // ============================================================

  fastify.get('/merchants', {
    schema: {
      tags: ['Merchants'],
      summary: 'List active merchants (public)',
      querystring: schemas.ListMerchantsQuery,
      response: { 200: schemas.MerchantsListResponse },
    },
    handler: handlers.listPublic,
  });

  fastify.get('/merchants/:id', {
    schema: {
      tags: ['Merchants'],
      summary: 'Get merchant detail (public, ACTIVE only)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.MerchantPublicResponse, 404: schemas.ErrorResponse },
    },
    handler: handlers.getPublicById,
  });

  fastify.get('/merchants/:id/hours', {
    schema: {
      tags: ['Merchants'],
      summary: 'Get merchant opening hours',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.HoursResponse, 404: schemas.ErrorResponse },
    },
    handler: handlers.getHours,
  });

  // ============================================================
  // OWNER/TEAM — Auth + membership required
  // ============================================================

  fastify.post('/merchants', {
    schema: {
      tags: ['Merchants'],
      summary: 'Create a merchant (creator becomes OWNER)',
      body: schemas.CreateMerchantBody,
      response: { 201: schemas.MerchantPublicResponse, 401: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.create,
  });

  fastify.patch('/merchants/:id', {
    schema: {
      tags: ['Merchants'],
      summary: 'Update merchant info (member)',
      params: schemas.MerchantIdParams,
      body: schemas.UpdateMerchantBody,
      response: { 200: schemas.MerchantPublicResponse, 403: schemas.ErrorResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantMember as any],
    handler: handlers.update,
  });

  fastify.put('/merchants/:id/hours', {
    schema: {
      tags: ['Merchants'],
      summary: 'Replace all opening hours (7 days)',
      params: schemas.MerchantIdParams,
      body: schemas.UpdateHoursBody,
      response: { 200: schemas.HoursResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantMember as any],
    handler: handlers.updateHours,
  });

  fastify.post('/merchants/:id/pause', {
    schema: {
      tags: ['Merchants'],
      summary: 'Pause merchant (close temporarily)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantMember as any],
    handler: handlers.pause,
  });

  fastify.post('/merchants/:id/resume', {
    schema: {
      tags: ['Merchants'],
      summary: 'Resume merchant (reopen from pause)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantMember as any],
    handler: handlers.resume,
  });

  fastify.get('/merchants/:id/team', {
    schema: {
      tags: ['Merchants'],
      summary: 'List team members',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.TeamListResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantMember as any],
    handler: handlers.getTeam,
  });

  fastify.post('/merchants/:id/team', {
    schema: {
      tags: ['Merchants'],
      summary: 'Add team member (OWNER only)',
      params: schemas.MerchantIdParams,
      body: schemas.AddTeamMemberBody,
      response: { 201: schemas.TeamMemberResponse, 403: schemas.ErrorResponse, 404: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantOwner as any],
    handler: handlers.addTeamMember,
  });

  fastify.delete('/merchants/:id/team/:userId', {
    schema: {
      tags: ['Merchants'],
      summary: 'Remove team member (OWNER only)',
      params: schemas.TeamMemberParams,
      response: { 200: schemas.MessageResponse, 403: schemas.ErrorResponse, 400: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, requireMerchantOwner as any],
    handler: handlers.removeTeamMember,
  });

  // ============================================================
  // ADMIN — Auth + requireAdmin
  // ============================================================

  fastify.post('/merchants/:id/approve', {
    schema: {
      tags: ['Merchants'],
      summary: 'Approve merchant (admin)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.MerchantPublicResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.approve,
  });

  fastify.post('/merchants/:id/suspend', {
    schema: {
      tags: ['Merchants'],
      summary: 'Suspend merchant (admin)',
      params: schemas.MerchantIdParams,
      response: { 200: schemas.MerchantPublicResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.suspend,
  });

  fastify.get('/admin/merchants', {
    schema: {
      tags: ['Merchants'],
      summary: 'List all merchants (admin, all statuses)',
      querystring: schemas.AdminListMerchantsQuery,
      response: { 200: schemas.MerchantsListResponse, 403: schemas.ErrorResponse },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate, fastify.requireAdmin],
    handler: handlers.listAdmin,
  });
};

export default merchantsRoutes;

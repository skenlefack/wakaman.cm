/**
 * Merchants module — Handlers
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  CreateMerchantBodyType,
  UpdateMerchantBodyType,
  UpdateHoursBodyType,
  AddTeamMemberBodyType,
  ListMerchantsQueryType,
  AdminListMerchantsQueryType,
} from './merchants.schemas.js';
import type { MerchantsService } from './merchants.service.js';

interface JwtPayload { sub: string; type: string }

// ============================================================
// PUBLIC
// ============================================================

export async function listPublic(
  request: FastifyRequest<{ Querystring: ListMerchantsQueryType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.listPublic(request.query));
}

export async function getPublicById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.getPublicById(request.params.id));
}

export async function getHours(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.getHours(request.params.id));
}

// ============================================================
// OWNER/TEAM
// ============================================================

export async function create(
  request: FastifyRequest<{ Body: CreateMerchantBodyType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  const { sub } = request.user as JwtPayload;
  const result = await svc.create(request.body, sub);
  return reply.code(201).send(result);
}

export async function update(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateMerchantBodyType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.update(request.params.id, request.body));
}

export async function updateHours(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateHoursBodyType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.updateHours(request.params.id, request.body));
}

export async function pause(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  await svc.pause(request.params.id);
  return reply.send({ message: 'Merchant paused' });
}

export async function resume(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  await svc.resume(request.params.id);
  return reply.send({ message: 'Merchant resumed' });
}

export async function getTeam(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.getTeam(request.params.id));
}

export async function addTeamMember(
  request: FastifyRequest<{ Params: { id: string }; Body: AddTeamMemberBodyType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  const result = await svc.addTeamMember(request.params.id, request.body);
  return reply.code(201).send(result);
}

export async function removeTeamMember(
  request: FastifyRequest<{ Params: { id: string; userId: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  const { sub } = request.user as JwtPayload;
  await svc.removeTeamMember(request.params.id, request.params.userId, sub);
  return reply.send({ message: 'Member removed' });
}

// ============================================================
// ADMIN
// ============================================================

export async function approve(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.approve(request.params.id));
}

export async function suspend(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.suspend(request.params.id));
}

export async function listAdmin(
  request: FastifyRequest<{ Querystring: AdminListMerchantsQueryType }>,
  reply: FastifyReply,
) {
  const svc = request.container.resolve<MerchantsService>('merchantsService');
  return reply.send(await svc.listAdmin(request.query));
}

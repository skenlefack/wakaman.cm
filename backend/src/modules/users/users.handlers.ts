/**
 * Users module — Handlers
 *
 * Pure async functions: extract request data, call service, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  UpdateMyProfileBodyType,
  UpdateUserStatusBodyType,
  ListUsersQueryType,
} from './users.schemas.js';
import type { UsersService } from './users.service.js';

interface JwtPayload {
  sub: string;
  type: string;
}

export async function getMyProfile(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const { sub } = request.user as JwtPayload;
  const result = await usersService.getMyProfile(sub);
  return reply.code(200).send(result);
}

export async function updateMyProfile(
  request: FastifyRequest<{ Body: UpdateMyProfileBodyType }>,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const { sub } = request.user as JwtPayload;
  const result = await usersService.updateMyProfile(sub, request.body);
  return reply.code(200).send(result);
}

export async function deleteMyAccount(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const { sub } = request.user as JwtPayload;
  await usersService.deleteMyAccount(sub);
  return reply.code(200).send({ message: 'Account deleted' });
}

export async function getUserById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const result = await usersService.getUserById(request.params.id);
  return reply.code(200).send(result);
}

export async function listUsers(
  request: FastifyRequest<{ Querystring: ListUsersQueryType }>,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const result = await usersService.listUsers(request.query);
  return reply.code(200).send(result);
}

export async function updateUserStatus(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateUserStatusBodyType }>,
  reply: FastifyReply,
) {
  const usersService = request.container.resolve<UsersService>('usersService');
  const { sub } = request.user as JwtPayload;
  const result = await usersService.updateUserStatus(
    request.params.id,
    sub,
    request.body.status,
    request.body.reason,
  );
  return reply.code(200).send(result);
}

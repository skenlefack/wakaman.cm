/**
 * Auth module — Handlers
 *
 * Pure async functions: extract request data, call service, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type {
  SignupBodyType,
  VerifyOtpBodyType,
  LoginBodyType,
  VerifyLoginOtpBodyType,
  RefreshBodyType,
} from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import type { TokenService } from './token.service.js';

export async function signup(
  request: FastifyRequest<{ Body: SignupBodyType }>,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const result = await authService.signup(request.body);
  return reply.code(200).send(result);
}

export async function verifyOtp(
  request: FastifyRequest<{ Body: VerifyOtpBodyType }>,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const result = await authService.verifySignupOtp(request.body, {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.code(201).send(result);
}

export async function login(
  request: FastifyRequest<{ Body: LoginBodyType }>,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const result = await authService.login(request.body);
  return reply.code(200).send(result);
}

export async function verifyLoginOtp(
  request: FastifyRequest<{ Body: VerifyLoginOtpBodyType }>,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const result = await authService.verifyLoginOtp(request.body, {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.code(200).send(result);
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshBodyType }>,
  reply: FastifyReply,
) {
  const tokenService = request.container.resolve<TokenService>('tokenService');
  const result = await tokenService.refresh(request.body.refreshToken);
  return reply.code(200).send(result);
}

export async function logout(
  request: FastifyRequest<{ Body: RefreshBodyType }>,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  await authService.logout(request.body.refreshToken);
  return reply.code(200).send({ message: 'Logged out successfully' });
}

export async function logoutAll(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const userId = (request.user as { sub: string }).sub;
  const count = await authService.logoutAll(userId);
  return reply.code(200).send({ message: `${count} session(s) revoked` });
}

export async function getSessions(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const authService = request.container.resolve<AuthService>('authService');
  const userId = (request.user as { sub: string }).sub;

  // Extract current session's refresh token hash from authorization header context
  // We pass undefined — the "current" flag requires the refresh token which we don't have here.
  // A future improvement could store the session ID in the JWT payload.
  const sessions = await authService.getActiveSessions(userId);
  return reply.code(200).send({ sessions });
}

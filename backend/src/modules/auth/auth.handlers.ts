/**
 * Auth module — Handlers
 *
 * Pure async functions: extract request data, call service, return response.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SignupBodyType, VerifyOtpBodyType } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';

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

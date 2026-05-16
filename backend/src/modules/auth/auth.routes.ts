/**
 * Auth module — Routes Fastify
 *
 * Feature 1: Signup by OTP SMS
 * Feature 2: Login by OTP SMS
 * Feature 3: Refresh, logout, session management
 */

import { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import * as handlers from './auth.handlers.js';
import * as schemas from './auth.schemas.js';

const authRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  // Rate limit strict on auth routes (5 req/min/IP as per CLAUDE.md)
  const authRateLimit = {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  };

  // ============================================================
  // POST /auth/signup — Send OTP
  // ============================================================
  fastify.post('/auth/signup', {
    ...authRateLimit,
    schema: {
      tags: ['Auth'],
      summary: 'Request signup OTP via SMS',
      description: 'Sends a 6-digit verification code to the provided phone number. Code expires in 5 minutes.',
      body: schemas.SignupBody,
      response: {
        200: schemas.SignupResponse,
        409: schemas.ErrorResponse,
        429: schemas.ErrorResponse,
      },
    },
    handler: handlers.signup,
  });

  // ============================================================
  // POST /auth/verify-otp — Verify OTP & create user
  // ============================================================
  fastify.post('/auth/verify-otp', {
    ...authRateLimit,
    schema: {
      tags: ['Auth'],
      summary: 'Verify OTP and complete signup',
      description: 'Verifies the OTP code and creates the user account. Max 3 attempts per code.',
      body: schemas.VerifyOtpBody,
      response: {
        201: schemas.VerifyOtpResponse,
        400: schemas.ErrorResponse,
        409: schemas.ErrorResponse,
        429: schemas.ErrorResponse,
      },
    },
    handler: handlers.verifyOtp,
  });

  // ============================================================
  // POST /auth/login — Send login OTP
  // ============================================================
  fastify.post('/auth/login', {
    ...authRateLimit,
    schema: {
      tags: ['Auth'],
      summary: 'Request login OTP via SMS',
      description: 'Sends a 6-digit login code to a registered phone number. Code expires in 5 minutes.',
      body: schemas.LoginBody,
      response: {
        200: schemas.LoginResponse,
        401: schemas.ErrorResponse,
        403: schemas.ErrorResponse,
        429: schemas.ErrorResponse,
      },
    },
    handler: handlers.login,
  });

  // ============================================================
  // POST /auth/verify-login-otp — Verify login OTP & create session
  // ============================================================
  fastify.post('/auth/verify-login-otp', {
    ...authRateLimit,
    schema: {
      tags: ['Auth'],
      summary: 'Verify login OTP and get tokens',
      description: 'Verifies the login OTP code and returns JWT tokens. Max 3 attempts per code.',
      body: schemas.VerifyLoginOtpBody,
      response: {
        200: schemas.VerifyLoginOtpResponse,
        400: schemas.ErrorResponse,
        401: schemas.ErrorResponse,
        403: schemas.ErrorResponse,
        429: schemas.ErrorResponse,
      },
    },
    handler: handlers.verifyLoginOtp,
  });

  // ============================================================
  // POST /auth/refresh — Rotate tokens (NOT authenticated — access may be expired)
  // ============================================================
  fastify.post('/auth/refresh', {
    ...authRateLimit,
    schema: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Exchanges a valid refresh token for a new token pair. The old refresh token is revoked (rotation).',
      body: schemas.RefreshBody,
      response: {
        200: schemas.RefreshResponse,
        401: schemas.ErrorResponse,
        403: schemas.ErrorResponse,
        429: schemas.ErrorResponse,
      },
    },
    handler: handlers.refresh,
  });

  // ============================================================
  // POST /auth/logout — Revoke current session (authenticated)
  // ============================================================
  fastify.post('/auth/logout', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout current session',
      description: 'Revokes the session associated with the provided refresh token. Idempotent.',
      body: schemas.RefreshBody,
      response: {
        200: schemas.MessageResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.logout,
  });

  // ============================================================
  // POST /auth/logout-all — Revoke all sessions (authenticated)
  // ============================================================
  fastify.post('/auth/logout-all', {
    schema: {
      tags: ['Auth'],
      summary: 'Logout all sessions',
      description: 'Revokes all active sessions for the authenticated user.',
      response: {
        200: schemas.MessageResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.logoutAll,
  });

  // ============================================================
  // GET /auth/sessions — List active sessions (authenticated)
  // ============================================================
  fastify.get('/auth/sessions', {
    schema: {
      tags: ['Auth'],
      summary: 'List active sessions',
      description: 'Returns all active (non-revoked, non-expired) sessions for the authenticated user.',
      response: {
        200: schemas.SessionsListResponse,
      },
      security: [{ bearerAuth: [] }],
    },
    preHandler: [fastify.authenticate],
    handler: handlers.getSessions,
  });
};

export default authRoutes;

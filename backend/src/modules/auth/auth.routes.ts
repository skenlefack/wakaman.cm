/**
 * Auth module — Routes Fastify
 *
 * Feature 1/3: Signup by OTP SMS
 * - POST /auth/signup      — Send OTP to phone
 * - POST /auth/verify-otp  — Verify OTP and create user
 *
 * Feature 2/3 (TODO): Login + refresh tokens
 * Feature 3/3 (TODO): Logout + session management
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
};

export default authRoutes;

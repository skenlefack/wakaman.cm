/**
 * Auth module — Schemas (TypeBox)
 *
 * Contrats d'API pour signup et OTP verification.
 * verify-otp returns JWT tokens (auto-login after signup).
 */

import { Type, Static } from '@sinclair/typebox';

// ============================================================
// ENUMS (subset pour auth)
// ============================================================

export const SignupUserType = Type.Union([
  Type.Literal('CLIENT'),
  Type.Literal('COURIER'),
  Type.Literal('MERCHANT'),
]);

// ============================================================
// BODY DTOs
// ============================================================

export const SignupBody = Type.Object({
  phone: Type.String({
    pattern: '^\\+237[0-9]{9}$',
    description: 'Phone number in E.164 format (+237XXXXXXXXX)',
  }),
  type: SignupUserType,
});

export const VerifyOtpBody = Type.Object({
  phone: Type.String({
    pattern: '^\\+237[0-9]{9}$',
    description: 'Phone number in E.164 format (+237XXXXXXXXX)',
  }),
  code: Type.String({
    minLength: 6,
    maxLength: 6,
    pattern: '^[0-9]{6}$',
    description: 'OTP code (6 digits)',
  }),
  type: SignupUserType,
});

// ============================================================
// RESPONSES
// ============================================================

export const SignupResponse = Type.Object({
  message: Type.String(),
  expiresInSeconds: Type.Integer(),
});

export const VerifyOtpResponse = Type.Object({
  user: Type.Object({
    id: Type.String(),
    phone: Type.String(),
    type: SignupUserType,
    status: Type.String(),
    phoneVerifiedAt: Type.String({ format: 'date-time' }),
    createdAt: Type.String({ format: 'date-time' }),
  }),
  accessToken: Type.String({ description: 'JWT access token (15min)' }),
  refreshToken: Type.String({ description: 'Refresh token (7 days)' }),
});

export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
  requestId: Type.String(),
});

// ============================================================
// INFERRED TYPES
// ============================================================

export type SignupBodyType = Static<typeof SignupBody>;
export type VerifyOtpBodyType = Static<typeof VerifyOtpBody>;
export type SignupResponseType = Static<typeof SignupResponse>;
export type VerifyOtpResponseType = Static<typeof VerifyOtpResponse>;

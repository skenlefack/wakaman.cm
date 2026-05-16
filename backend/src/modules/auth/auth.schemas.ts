/**
 * Auth module — Schemas (TypeBox)
 *
 * Contrats d'API pour signup, login, refresh, logout et sessions.
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

export const LoginBody = Type.Object({
  phone: Type.String({
    pattern: '^\\+237[0-9]{9}$',
    description: 'Phone number in E.164 format (+237XXXXXXXXX)',
  }),
});

export const VerifyLoginOtpBody = Type.Object({
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
});

// ============================================================
// RESPONSES
// ============================================================

export const UserType = Type.Union([
  Type.Literal('CLIENT'),
  Type.Literal('COURIER'),
  Type.Literal('MERCHANT'),
  Type.Literal('ADMIN'),
  Type.Literal('SUPPORT'),
]);

const AuthUserResponse = Type.Object({
  id: Type.String(),
  phone: Type.String(),
  type: UserType,
  status: Type.String(),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  phoneVerifiedAt: Type.String({ format: 'date-time' }),
  createdAt: Type.String({ format: 'date-time' }),
});

export const OtpSentResponse = Type.Object({
  message: Type.String(),
  expiresInSeconds: Type.Integer(),
});

export const SignupResponse = OtpSentResponse;

export const LoginResponse = OtpSentResponse;

export const AuthTokensResponse = Type.Object({
  user: AuthUserResponse,
  accessToken: Type.String({ description: 'JWT access token (15min)' }),
  refreshToken: Type.String({ description: 'Refresh token (7 days)' }),
});

export const VerifyOtpResponse = AuthTokensResponse;

export const VerifyLoginOtpResponse = AuthTokensResponse;

export const RefreshBody = Type.Object({
  refreshToken: Type.String({ minLength: 1, description: 'Refresh token received at login/signup' }),
});

export const RefreshResponse = Type.Object({
  accessToken: Type.String({ description: 'New JWT access token (15min)' }),
  refreshToken: Type.String({ description: 'New refresh token (7 days) — old one is revoked' }),
});

export const MessageResponse = Type.Object({
  message: Type.String(),
});

export const SessionResponse = Type.Object({
  id: Type.String(),
  deviceType: Type.Optional(Type.String()),
  deviceName: Type.Optional(Type.String()),
  appVersion: Type.Optional(Type.String()),
  ipAddress: Type.Optional(Type.String()),
  userAgent: Type.Optional(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
  current: Type.Boolean({ description: 'True if this is the session making the request' }),
});

export const SessionsListResponse = Type.Object({
  sessions: Type.Array(SessionResponse),
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
export type LoginBodyType = Static<typeof LoginBody>;
export type VerifyLoginOtpBodyType = Static<typeof VerifyLoginOtpBody>;
export type AuthTokensResponseType = Static<typeof AuthTokensResponse>;
export type RefreshBodyType = Static<typeof RefreshBody>;
export type RefreshResponseType = Static<typeof RefreshResponse>;

/**
 * Users module — Schemas (TypeBox)
 *
 * Définition des contrats d'API du module Users.
 * TypeBox génère automatiquement les types TypeScript ET les JSON Schemas
 * pour la validation Fastify.
 */

import { Type, Static } from '@sinclair/typebox';

// ============================================================
// ENUMS
// ============================================================

export const UserType = Type.Union([
  Type.Literal('CLIENT'),
  Type.Literal('COURIER'),
  Type.Literal('MERCHANT'),
  Type.Literal('ADMIN'),
  Type.Literal('SUPPORT'),
]);

export const UserStatus = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('ACTIVE'),
  Type.Literal('SUSPENDED'),
  Type.Literal('BANNED'),
  Type.Literal('DELETED'),
]);

export const Language = Type.Union([Type.Literal('FR'), Type.Literal('EN')]);

// ============================================================
// PARAMS
// ============================================================

export const UserIdParams = Type.Object({
  id: Type.String({
    pattern: '^usr_[a-f0-9]{32}$',
    description: 'User ID (format: usr_xxx)',
  }),
});

// ============================================================
// BODY DTOs
// ============================================================

export const CreateUserBody = Type.Object({
  phone: Type.String({
    pattern: '^\\+237[0-9]{9}$',
    description: 'Phone number in E.164 format (+237XXXXXXXXX)',
  }),
  type: UserType,
  firstName: Type.Optional(Type.String({ minLength: 2, maxLength: 50 })),
  lastName: Type.Optional(Type.String({ minLength: 2, maxLength: 50 })),
  email: Type.Optional(Type.String({ format: 'email' })),
  language: Type.Optional(Language),
});

export const UpdateUserBody = Type.Partial(
  Type.Object({
    firstName: Type.String({ minLength: 2, maxLength: 50 }),
    lastName: Type.String({ minLength: 2, maxLength: 50 }),
    email: Type.String({ format: 'email' }),
    language: Language,
    avatarUrl: Type.String({ format: 'uri' }),
  }),
);

// ============================================================
// RESPONSE
// ============================================================

export const UserResponse = Type.Object({
  id: Type.String(),
  phone: Type.String(),
  email: Type.Optional(Type.String()),
  type: UserType,
  status: UserStatus,
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  avatarUrl: Type.Optional(Type.String()),
  language: Language,
  phoneVerifiedAt: Type.Optional(Type.String({ format: 'date-time' })),
  emailVerifiedAt: Type.Optional(Type.String({ format: 'date-time' })),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

export const UsersListResponse = Type.Object({
  items: Type.Array(UserResponse),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

export const ErrorResponse = Type.Object({
  error: Type.String(),
  message: Type.String(),
  details: Type.Optional(Type.Unknown()),
  requestId: Type.String(),
});

// ============================================================
// QUERY (pagination, filtres)
// ============================================================

export const ListUsersQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  type: Type.Optional(UserType),
  status: Type.Optional(UserStatus),
  search: Type.Optional(Type.String({ minLength: 2 })),
});

// ============================================================
// TYPES INFERED (utilisables dans le code TypeScript)
// ============================================================

export type UserResponseType = Static<typeof UserResponse>;
export type CreateUserBodyType = Static<typeof CreateUserBody>;
export type UpdateUserBodyType = Static<typeof UpdateUserBody>;
export type ListUsersQueryType = Static<typeof ListUsersQuery>;

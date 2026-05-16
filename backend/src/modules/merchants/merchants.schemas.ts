/**
 * Merchants module — Schemas (TypeBox)
 *
 * Feature 1/3: Merchant CRUD, team management, hours.
 */

import { Type, Static } from '@sinclair/typebox';

// ============================================================
// ENUMS
// ============================================================

export const MerchantType = Type.Union([
  Type.Literal('RESTAURANT'),
  Type.Literal('SUPERMARKET'),
  Type.Literal('PHARMACY'),
  Type.Literal('GROCERY'),
  Type.Literal('BAKERY'),
  Type.Literal('TRADITIONAL_MARKET_VENDOR'),
  Type.Literal('OTHER'),
]);

export const MerchantStatus = Type.Union([
  Type.Literal('PENDING'),
  Type.Literal('ACTIVE'),
  Type.Literal('PAUSED'),
  Type.Literal('SUSPENDED'),
  Type.Literal('CLOSED'),
]);

export const MerchantRole = Type.Union([
  Type.Literal('OWNER'),
  Type.Literal('MANAGER'),
  Type.Literal('STAFF'),
]);

// ============================================================
// PARAMS
// ============================================================

export const MerchantIdParams = Type.Object({
  id: Type.String({ pattern: '^mch_[a-f0-9]{32}$' }),
});

export const TeamMemberParams = Type.Object({
  id: Type.String({ pattern: '^mch_[a-f0-9]{32}$' }),
  userId: Type.String({ pattern: '^usr_[a-f0-9]{32}$' }),
});

// ============================================================
// BODY DTOs
// ============================================================

export const CreateMerchantBody = Type.Object({
  businessName: Type.String({ minLength: 2, maxLength: 100 }),
  type: MerchantType,
  description: Type.Optional(Type.String({ maxLength: 1000 })),
  logoUrl: Type.Optional(Type.String({ format: 'uri' })),
  coverUrl: Type.Optional(Type.String({ format: 'uri' })),
  addressLabel: Type.String({ minLength: 2 }),
  city: Type.String({ minLength: 2 }),
  district: Type.Optional(Type.String()),
  landmark: Type.Optional(Type.String()),
  latitude: Type.Number({ minimum: -90, maximum: 90 }),
  longitude: Type.Number({ minimum: -180, maximum: 180 }),
  phonePrimary: Type.String({ pattern: '^\\+237[0-9]{9}$' }),
  phoneSecondary: Type.Optional(Type.String({ pattern: '^\\+237[0-9]{9}$' })),
  email: Type.Optional(Type.String({ format: 'email' })),
  minimumOrderFcfa: Type.Optional(Type.Number({ minimum: 0 })),
  averagePreparationMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 180 })),
  acceptsCash: Type.Optional(Type.Boolean()),
  acceptsMomo: Type.Optional(Type.Boolean()),
});

export const UpdateMerchantBody = Type.Partial(
  Type.Object({
    businessName: Type.String({ minLength: 2, maxLength: 100 }),
    description: Type.String({ maxLength: 1000 }),
    logoUrl: Type.String({ format: 'uri' }),
    coverUrl: Type.String({ format: 'uri' }),
    addressLabel: Type.String({ minLength: 2 }),
    city: Type.String({ minLength: 2 }),
    district: Type.String(),
    landmark: Type.String(),
    latitude: Type.Number({ minimum: -90, maximum: 90 }),
    longitude: Type.Number({ minimum: -180, maximum: 180 }),
    phonePrimary: Type.String({ pattern: '^\\+237[0-9]{9}$' }),
    phoneSecondary: Type.String({ pattern: '^\\+237[0-9]{9}$' }),
    email: Type.String({ format: 'email' }),
    minimumOrderFcfa: Type.Number({ minimum: 0 }),
    averagePreparationMinutes: Type.Integer({ minimum: 1, maximum: 180 }),
    acceptsCash: Type.Boolean(),
    acceptsMomo: Type.Boolean(),
  }),
);

const HoursEntry = Type.Object({
  dayOfWeek: Type.Integer({ minimum: 0, maximum: 6 }),
  openTime: Type.String({ pattern: '^[0-2][0-9]:[0-5][0-9]$' }),
  closeTime: Type.String({ pattern: '^[0-2][0-9]:[0-5][0-9]$' }),
  isClosed: Type.Optional(Type.Boolean()),
});

export const UpdateHoursBody = Type.Object({
  hours: Type.Array(HoursEntry, { minItems: 7, maxItems: 7 }),
});

export const AddTeamMemberBody = Type.Object({
  phone: Type.String({ pattern: '^\\+237[0-9]{9}$' }),
  role: Type.Union([Type.Literal('MANAGER'), Type.Literal('STAFF')]),
});

// ============================================================
// QUERY
// ============================================================

export const ListMerchantsQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  city: Type.Optional(Type.String({ minLength: 2 })),
  type: Type.Optional(MerchantType),
  search: Type.Optional(Type.String({ minLength: 2 })),
});

export const AdminListMerchantsQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  city: Type.Optional(Type.String({ minLength: 2 })),
  type: Type.Optional(MerchantType),
  status: Type.Optional(MerchantStatus),
  search: Type.Optional(Type.String({ minLength: 2 })),
});

// ============================================================
// RESPONSES
// ============================================================

export const MerchantPublicResponse = Type.Object({
  id: Type.String(),
  businessName: Type.String(),
  type: MerchantType,
  status: MerchantStatus,
  description: Type.Optional(Type.String()),
  logoUrl: Type.Optional(Type.String()),
  coverUrl: Type.Optional(Type.String()),
  addressLabel: Type.String(),
  city: Type.String(),
  district: Type.Optional(Type.String()),
  landmark: Type.Optional(Type.String()),
  latitude: Type.Number(),
  longitude: Type.Number(),
  phonePrimary: Type.String(),
  email: Type.Optional(Type.String()),
  averagePreparationMinutes: Type.Integer(),
  minimumOrderFcfa: Type.Number(),
  acceptsCash: Type.Boolean(),
  acceptsMomo: Type.Boolean(),
  averageRating: Type.Number(),
  totalOrders: Type.Integer(),
  createdAt: Type.String({ format: 'date-time' }),
});

export const MerchantOwnerResponse = Type.Intersect([
  MerchantPublicResponse,
  Type.Object({
    legalName: Type.Optional(Type.String()),
    registrationNumber: Type.Optional(Type.String()),
    taxId: Type.Optional(Type.String()),
    phoneSecondary: Type.Optional(Type.String()),
    commissionRate: Type.Number(),
    totalRevenueFcfa: Type.Number(),
    momoNumber: Type.Optional(Type.String()),
    momoOperator: Type.Optional(Type.String()),
    updatedAt: Type.String({ format: 'date-time' }),
  }),
]);

export const MerchantsListResponse = Type.Object({
  items: Type.Array(MerchantPublicResponse),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

export const HoursResponse = Type.Object({
  hours: Type.Array(Type.Object({
    dayOfWeek: Type.Integer(),
    openTime: Type.String(),
    closeTime: Type.String(),
    isClosed: Type.Boolean(),
  })),
});

export const TeamMemberResponse = Type.Object({
  userId: Type.String(),
  phone: Type.String(),
  firstName: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  role: MerchantRole,
  createdAt: Type.String({ format: 'date-time' }),
});

export const TeamListResponse = Type.Object({
  members: Type.Array(TeamMemberResponse),
});

export const MessageResponse = Type.Object({
  message: Type.String(),
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

export type CreateMerchantBodyType = Static<typeof CreateMerchantBody>;
export type UpdateMerchantBodyType = Static<typeof UpdateMerchantBody>;
export type UpdateHoursBodyType = Static<typeof UpdateHoursBody>;
export type AddTeamMemberBodyType = Static<typeof AddTeamMemberBody>;
export type ListMerchantsQueryType = Static<typeof ListMerchantsQuery>;
export type AdminListMerchantsQueryType = Static<typeof AdminListMerchantsQuery>;

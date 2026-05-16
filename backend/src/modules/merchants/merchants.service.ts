/**
 * Merchants module — Service (business logic)
 *
 * Feature 1/3: Merchant CRUD, team, hours.
 * Redis cache on GET /merchants/:id (TTL 5 min).
 */

import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { MerchantsRepository } from './merchants.repository.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import type {
  CreateMerchantBodyType,
  UpdateMerchantBodyType,
  UpdateHoursBodyType,
  AddTeamMemberBodyType,
  ListMerchantsQueryType,
  AdminListMerchantsQueryType,
} from './merchants.schemas.js';
import { MERCHANT_CACHE_PREFIX, MERCHANT_CACHE_TTL_SECONDS } from './merchants.types.js';
import type { MerchantRole } from './merchants.types.js';

export class MerchantsService {
  constructor(
    private readonly merchantsRepository: MerchantsRepository,
    private readonly authRepository: AuthRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  // ============================================================
  // PUBLIC — List merchants (ACTIVE only)
  // ============================================================

  async listPublic(query: ListMerchantsQueryType) {
    const { items, total } = await this.merchantsRepository.listPublic(query);
    return {
      items: items.map((m) => this.serializePublic(m)),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  // ============================================================
  // PUBLIC — Get merchant by ID (ACTIVE only, cached)
  // ============================================================

  async getPublicById(id: string) {
    const cacheKey = `${MERCHANT_CACHE_PREFIX}${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const merchant = await this.merchantsRepository.findActiveById(id);
    if (!merchant) throw new NotFoundError('Merchant', id);

    const serialized = this.serializePublic(merchant);
    await this.redis.set(cacheKey, JSON.stringify(serialized), 'EX', MERCHANT_CACHE_TTL_SECONDS);
    return serialized;
  }

  // ============================================================
  // PUBLIC — Get hours
  // ============================================================

  async getHours(merchantId: string) {
    // Verify merchant exists and is active for public endpoint
    const merchant = await this.merchantsRepository.findActiveById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);

    const hours = await this.merchantsRepository.getHours(merchantId);
    return {
      hours: hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    };
  }

  // ============================================================
  // OWNER/TEAM — Create merchant
  // ============================================================

  async create(data: CreateMerchantBodyType, userId: string) {
    // Single transaction: merchant + OWNER membership (no orphan merchant on failure)
    const merchant = await this.merchantsRepository.createWithOwner(data, userId);

    this.logger.info({ merchantId: merchant.id, userId }, 'Merchant created, user set as OWNER');
    return this.serializePublic(merchant);
  }

  // ============================================================
  // OWNER/TEAM — Update merchant
  // ============================================================

  async update(merchantId: string, data: UpdateMerchantBodyType) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);

    const updated = await this.merchantsRepository.update(merchantId, data);
    await this.invalidateCache(merchantId);
    return this.serializePublic(updated);
  }

  // ============================================================
  // OWNER/TEAM — Update hours (replace all 7 days)
  // ============================================================

  async updateHours(merchantId: string, data: UpdateHoursBodyType) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);

    const hours = await this.merchantsRepository.replaceHours(merchantId, data.hours);
    await this.invalidateCache(merchantId);

    return {
      hours: hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    };
  }

  // ============================================================
  // OWNER/TEAM — Pause / Resume
  // ============================================================

  async pause(merchantId: string) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);
    if ((merchant as any).status !== 'ACTIVE') {
      throw new ValidationError('Merchant must be ACTIVE to pause');
    }

    await this.merchantsRepository.updateStatus(merchantId, 'PAUSED');
    await this.invalidateCache(merchantId);
    this.logger.info({ merchantId }, 'Merchant paused');
  }

  async resume(merchantId: string) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);
    if ((merchant as any).status !== 'PAUSED') {
      throw new ValidationError('Merchant must be PAUSED to resume');
    }

    await this.merchantsRepository.updateStatus(merchantId, 'ACTIVE');
    await this.invalidateCache(merchantId);
    this.logger.info({ merchantId }, 'Merchant resumed');
  }

  // ============================================================
  // OWNER — Team management
  // ============================================================

  async getTeam(merchantId: string) {
    const members = await this.merchantsRepository.listTeam(merchantId);
    return {
      members: members.map((m) => ({
        userId: m.user.id,
        phone: m.user.phone,
        firstName: m.user.firstName ?? undefined,
        lastName: m.user.lastName ?? undefined,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async addTeamMember(merchantId: string, data: AddTeamMemberBodyType) {
    const user = await this.authRepository.findUserByPhone(data.phone);
    if (!user) {
      throw new NotFoundError(
        'User',
        `phone ${data.phone} — cet utilisateur n'est pas inscrit sur Wakaman, demandez-lui de télécharger l'application d'abord`,
      );
    }

    const existing = await this.merchantsRepository.findMembership(user.id, merchantId);
    if (existing) {
      throw new ConflictError('User is already a member of this merchant');
    }

    try {
      await this.merchantsRepository.addMember(merchantId, user.id, data.role);
    } catch (error) {
      // Race condition: concurrent addMember passed the findMembership check
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('User is already a member of this merchant');
      }
      throw error;
    }
    this.logger.info({ merchantId, userId: user.id, role: data.role }, 'Team member added');

    return {
      userId: user.id,
      phone: user.phone,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      role: data.role,
      createdAt: new Date().toISOString(),
    };
  }

  async removeTeamMember(merchantId: string, targetUserId: string, requestingUserId: string) {
    if (targetUserId === requestingUserId) {
      throw new ValidationError('Cannot remove yourself from the team');
    }

    const membership = await this.merchantsRepository.findMembership(targetUserId, merchantId);
    if (!membership) {
      throw new NotFoundError('Team member', targetUserId);
    }

    if (membership.role === 'OWNER') {
      throw new ValidationError('Cannot remove the OWNER from the team');
    }

    await this.merchantsRepository.removeMember(targetUserId, merchantId);
    this.logger.info({ merchantId, removedUserId: targetUserId }, 'Team member removed');
  }

  // ============================================================
  // ADMIN — Approve / Suspend
  // ============================================================

  async approve(merchantId: string) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);
    if ((merchant as any).status !== 'PENDING') {
      throw new ValidationError('Merchant must be PENDING to approve');
    }

    const updated = await this.merchantsRepository.updateStatus(merchantId, 'ACTIVE');
    await this.invalidateCache(merchantId);
    this.logger.info({ merchantId }, 'Merchant approved by admin');
    return this.serializePublic(updated);
  }

  async suspend(merchantId: string) {
    const merchant = await this.merchantsRepository.findById(merchantId);
    if (!merchant) throw new NotFoundError('Merchant', merchantId);

    // TODO: when Orders module exists, cancel all pending orders for this merchant
    const updated = await this.merchantsRepository.updateStatus(merchantId, 'SUSPENDED');
    await this.invalidateCache(merchantId);
    this.logger.info({ merchantId }, 'Merchant suspended by admin');
    return this.serializePublic(updated);
  }

  // ============================================================
  // ADMIN — List all merchants
  // ============================================================

  async listAdmin(query: AdminListMerchantsQueryType) {
    const { items, total } = await this.merchantsRepository.listAdmin(query);
    return {
      items: items.map((m) => this.serializePublic(m)),
      total,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
    };
  }

  // ============================================================
  // MEMBERSHIP CHECK (used by route preHandler)
  // ============================================================

  async verifyMembership(userId: string, merchantId: string): Promise<MerchantRole> {
    const membership = await this.merchantsRepository.findMembership(userId, merchantId);
    if (!membership) {
      throw new ForbiddenError('Not a member of this merchant');
    }
    return membership.role as MerchantRole;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async invalidateCache(merchantId: string): Promise<void> {
    await this.redis.del(`${MERCHANT_CACHE_PREFIX}${merchantId}`);
  }

  private serializePublic(m: Record<string, unknown>) {
    return {
      id: m.id,
      businessName: m.businessName,
      type: m.type,
      status: m.status,
      description: m.description ?? undefined,
      logoUrl: m.logoUrl ?? undefined,
      coverUrl: m.coverUrl ?? undefined,
      addressLabel: m.addressLabel,
      city: m.city,
      district: m.district ?? undefined,
      landmark: m.landmark ?? undefined,
      latitude: Number(m.latitude),
      longitude: Number(m.longitude),
      phonePrimary: m.phonePrimary,
      email: m.email ?? undefined,
      averagePreparationMinutes: m.averagePreparationMinutes,
      minimumOrderFcfa: Number(m.minimumOrderFcfa),
      acceptsCash: m.acceptsCash,
      acceptsMomo: m.acceptsMomo,
      averageRating: Number(m.averageRating),
      totalOrders: m.totalOrders,
      createdAt: (m.createdAt as Date).toISOString(),
    };
  }
}

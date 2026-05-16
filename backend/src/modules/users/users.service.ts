/**
 * Users module — Service (business logic)
 *
 * Profile management for authenticated users + admin operations.
 * Redis cache on GET /users/me (TTL 5 min), invalidated on PATCH/DELETE.
 */

import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import type { UsersRepository } from './users.repository.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import type { UpdateMyProfileBodyType, ListUsersQueryType } from './users.schemas.js';
import { USER_CACHE_PREFIX, USER_CACHE_TTL_SECONDS, USER_BLOCKED_PREFIX, USER_BLOCKED_TTL_SECONDS } from './users.types.js';

export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authRepository: AuthRepository,
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  // ============================================================
  // GET /users/me
  // ============================================================

  async getMyProfile(userId: string) {
    // Check Redis cache first
    const cacheKey = `${USER_CACHE_PREFIX}${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const user = await this.usersRepository.findActiveById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const serialized = this.serializeUser(user);
    await this.redis.set(cacheKey, JSON.stringify(serialized), 'EX', USER_CACHE_TTL_SECONDS);
    return serialized;
  }

  // ============================================================
  // PATCH /users/me
  // ============================================================

  async updateMyProfile(userId: string, data: UpdateMyProfileBodyType) {
    const user = await this.usersRepository.findActiveById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const updated = await this.usersRepository.updateProfile(userId, data);
    await this.invalidateCache(userId);
    return this.serializeUser(updated);
  }

  // ============================================================
  // DELETE /users/me
  // ============================================================

  async deleteMyAccount(userId: string): Promise<void> {
    const user = await this.usersRepository.findActiveById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    await this.usersRepository.softDelete(userId);
    await this.authRepository.revokeAllUserSessions(userId);
    await this.redis.set(`${USER_BLOCKED_PREFIX}${userId}`, 'DELETED', 'EX', USER_BLOCKED_TTL_SECONDS);
    await this.invalidateCache(userId);

    this.logger.info({ userId }, 'User soft-deleted own account, all sessions revoked, access blocked');
  }

  // ============================================================
  // GET /users/:id (admin)
  // ============================================================

  async getUserById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return this.serializeUser(user);
  }

  // ============================================================
  // GET /users (admin)
  // ============================================================

  async listUsers(query: ListUsersQueryType) {
    const { items, total } = await this.usersRepository.listUsers(query);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    return {
      items: items.map((u) => this.serializeUser(u)),
      total,
      page,
      pageSize,
    };
  }

  // ============================================================
  // PATCH /users/:id/status (admin)
  // ============================================================

  async updateUserStatus(
    targetUserId: string,
    adminUserId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED',
    reason?: string,
  ) {
    if (targetUserId === adminUserId) {
      throw new ValidationError('Admin cannot change own status');
    }

    const user = await this.usersRepository.findById(targetUserId);
    if (!user) {
      throw new NotFoundError('User', targetUserId);
    }

    const updated = await this.usersRepository.updateStatus(targetUserId, status);

    // If suspending or banning, revoke sessions + block access tokens via Redis
    if (status === 'SUSPENDED' || status === 'BANNED') {
      await this.authRepository.revokeAllUserSessions(targetUserId);
      await this.redis.set(
        `${USER_BLOCKED_PREFIX}${targetUserId}`,
        status,
        'EX',
        USER_BLOCKED_TTL_SECONDS,
      );
    } else {
      // Reactivating — remove from blocklist
      await this.redis.del(`${USER_BLOCKED_PREFIX}${targetUserId}`);
    }

    await this.invalidateCache(targetUserId);

    this.logger.info(
      { adminUserId, targetUserId, status, reason },
      'Admin changed user status',
    );

    return this.serializeUser(updated);
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async invalidateCache(userId: string): Promise<void> {
    await this.redis.del(`${USER_CACHE_PREFIX}${userId}`);
  }

  private serializeUser(user: Record<string, unknown>) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email ?? undefined,
      type: user.type,
      status: user.status,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      avatarUrl: user.avatarUrl ?? undefined,
      language: user.language,
      phoneVerifiedAt: user.phoneVerifiedAt ? (user.phoneVerifiedAt as Date).toISOString() : undefined,
      emailVerifiedAt: user.emailVerifiedAt ? (user.emailVerifiedAt as Date).toISOString() : undefined,
      lastLoginAt: user.lastLoginAt ? (user.lastLoginAt as Date).toISOString() : undefined,
      createdAt: (user.createdAt as Date).toISOString(),
      updatedAt: (user.updatedAt as Date).toISOString(),
    };
  }
}

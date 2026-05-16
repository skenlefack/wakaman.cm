/**
 * Users module — Tests (Vitest)
 *
 * Unit tests for UsersService: profile CRUD + admin operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { UsersRepository } from './users.repository.js';
import { AuthRepository } from '../auth/auth.repository.js';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import type { User } from '@prisma/client';

// ============================================================
// MOCKS
// ============================================================

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_abc123',
    phone: '+237691234567',
    email: 'jean@test.cm',
    passwordHash: null,
    type: 'CLIENT',
    status: 'ACTIVE',
    language: 'FR',
    firstName: 'Jean',
    lastName: 'Dupont',
    avatarUrl: null,
    birthDate: null,
    gender: null,
    phoneVerifiedAt: new Date('2026-01-01'),
    emailVerifiedAt: null,
    lastLoginAt: new Date('2026-05-16'),
    lastLoginIp: '1.2.3.4',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-05-16'),
    deletedAt: null,
    ...overrides,
  } as User;
}

function createMockLogger(): Logger {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as unknown as Logger;
}

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    _store: store,
  };
}

function createMockUsersRepository() {
  return {
    findById: vi.fn(),
    findActiveById: vi.fn(),
    updateProfile: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn(),
    listUsers: vi.fn(),
  };
}

function createMockAuthRepository() {
  return {
    revokeAllUserSessions: vi.fn().mockResolvedValue(3),
  };
}

type MockUsersRepo = ReturnType<typeof createMockUsersRepository>;
type MockAuthRepo = ReturnType<typeof createMockAuthRepository>;
type MockRedis = ReturnType<typeof createMockRedis>;

function createService() {
  const usersRepo = createMockUsersRepository();
  const authRepo = createMockAuthRepository();
  const redis = createMockRedis();
  const service = new UsersService(
    usersRepo as unknown as UsersRepository,
    authRepo as unknown as AuthRepository,
    redis as unknown as Redis,
    createMockLogger(),
  );
  return { service, usersRepo, authRepo, redis };
}

// ============================================================
// GET /users/me
// ============================================================

describe('UsersService.getMyProfile', () => {
  it('should return user profile', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findActiveById.mockResolvedValue(createMockUser());
    const result = await service.getMyProfile('usr_abc123');
    expect(result.id).toBe('usr_abc123');
    expect(result.firstName).toBe('Jean');
    expect(result.phone).toBe('+237691234567');
  });

  it('should return cached profile on second call', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findActiveById.mockResolvedValue(createMockUser());

    await service.getMyProfile('usr_abc123');
    await service.getMyProfile('usr_abc123');

    // findActiveById called only once — second call hits cache
    expect(usersRepo.findActiveById).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('should throw 404 for deleted user', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findActiveById.mockResolvedValue(null);
    await expect(service.getMyProfile('usr_abc123')).rejects.toThrow('not found');
  });
});

// ============================================================
// PATCH /users/me
// ============================================================

describe('UsersService.updateMyProfile', () => {
  it('should update and invalidate cache', async () => {
    const { service, usersRepo, redis } = createService();
    const updated = createMockUser({ firstName: 'Pierre' });
    usersRepo.findActiveById.mockResolvedValue(createMockUser());
    usersRepo.updateProfile.mockResolvedValue(updated);

    const result = await service.updateMyProfile('usr_abc123', { firstName: 'Pierre' });
    expect(result.firstName).toBe('Pierre');
    expect(redis.del).toHaveBeenCalledWith('user:usr_abc123');
  });

  it('should throw 404 if user not found', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findActiveById.mockResolvedValue(null);
    await expect(service.updateMyProfile('usr_abc123', { firstName: 'X' }))
      .rejects.toThrow('not found');
  });
});

// ============================================================
// DELETE /users/me
// ============================================================

describe('UsersService.deleteMyAccount', () => {
  it('should soft delete, revoke sessions, and invalidate cache', async () => {
    const { service, usersRepo, authRepo, redis } = createService();
    usersRepo.findActiveById.mockResolvedValue(createMockUser());

    await service.deleteMyAccount('usr_abc123');

    expect(usersRepo.softDelete).toHaveBeenCalledWith('usr_abc123');
    expect(authRepo.revokeAllUserSessions).toHaveBeenCalledWith('usr_abc123');
    expect(redis.del).toHaveBeenCalledWith('user:usr_abc123');
  });

  it('should throw 404 if already deleted', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findActiveById.mockResolvedValue(null);
    await expect(service.deleteMyAccount('usr_abc123')).rejects.toThrow('not found');
  });
});

// ============================================================
// GET /users/:id (admin)
// ============================================================

describe('UsersService.getUserById', () => {
  it('should return any user (including deleted) for admin', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser({ status: 'DELETED' }));
    const result = await service.getUserById('usr_abc123');
    expect(result.status).toBe('DELETED');
  });

  it('should throw 404 for non-existent user', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findById.mockResolvedValue(null);
    await expect(service.getUserById('usr_nonexistent')).rejects.toThrow('not found');
  });
});

// ============================================================
// GET /users (admin)
// ============================================================

describe('UsersService.listUsers', () => {
  it('should return paginated list', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({
      items: [createMockUser(), createMockUser({ id: 'usr_def456' })],
      total: 42,
    });

    const result = await service.listUsers({ page: 2, pageSize: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(42);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
  });

  it('should use default pagination', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({ items: [], total: 0 });

    const result = await service.listUsers({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('should pass type filter to repository', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ type: 'COURIER' });
    expect(usersRepo.listUsers).toHaveBeenCalledWith({ type: 'COURIER' });
  });

  it('should pass status filter to repository', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ status: 'SUSPENDED' });
    expect(usersRepo.listUsers).toHaveBeenCalledWith({ status: 'SUSPENDED' });
  });

  it('should pass search filter to repository', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ search: 'Jean' });
    expect(usersRepo.listUsers).toHaveBeenCalledWith({ search: 'Jean' });
  });

  it('should pass combined filters to repository', async () => {
    const { service, usersRepo } = createService();
    usersRepo.listUsers.mockResolvedValue({ items: [], total: 0 });

    await service.listUsers({ type: 'CLIENT', status: 'ACTIVE', search: 'Kam', page: 2, pageSize: 5 });
    expect(usersRepo.listUsers).toHaveBeenCalledWith({
      type: 'CLIENT',
      status: 'ACTIVE',
      search: 'Kam',
      page: 2,
      pageSize: 5,
    });
  });
});

// ============================================================
// PATCH /users/:id/status (admin)
// ============================================================

describe('UsersService.updateUserStatus', () => {
  it('should suspend user and revoke sessions', async () => {
    const { service, usersRepo, authRepo } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser());
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));

    const result = await service.updateUserStatus('usr_target', 'usr_admin', 'SUSPENDED', 'Abuse');
    expect(result.status).toBe('SUSPENDED');
    expect(authRepo.revokeAllUserSessions).toHaveBeenCalledWith('usr_target');
  });

  it('should ban user and revoke sessions', async () => {
    const { service, usersRepo, authRepo } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser());
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'BANNED' }));

    await service.updateUserStatus('usr_target', 'usr_admin', 'BANNED');
    expect(authRepo.revokeAllUserSessions).toHaveBeenCalledWith('usr_target');
  });

  it('should reactivate user without revoking sessions', async () => {
    const { service, usersRepo, authRepo } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'ACTIVE' }));

    const result = await service.updateUserStatus('usr_target', 'usr_admin', 'ACTIVE');
    expect(result.status).toBe('ACTIVE');
    expect(authRepo.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('should reject admin banning themselves', async () => {
    const { service } = createService();
    await expect(service.updateUserStatus('usr_admin', 'usr_admin', 'BANNED'))
      .rejects.toThrow('Admin cannot change own status');
  });

  it('should throw 404 if target user not found', async () => {
    const { service, usersRepo } = createService();
    usersRepo.findById.mockResolvedValue(null);
    await expect(service.updateUserStatus('usr_ghost', 'usr_admin', 'SUSPENDED'))
      .rejects.toThrow('not found');
  });

  it('should invalidate cache after status change', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser());
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));

    await service.updateUserStatus('usr_target', 'usr_admin', 'SUSPENDED');
    expect(redis.del).toHaveBeenCalledWith('user:usr_target');
  });

  it('should add user to Redis blocklist when SUSPENDED', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser());
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));

    await service.updateUserStatus('usr_target', 'usr_admin', 'SUSPENDED');
    expect(redis.set).toHaveBeenCalledWith('blocked:usr_target', 'SUSPENDED', 'EX', 900);
  });

  it('should add user to Redis blocklist when BANNED', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser());
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'BANNED' }));

    await service.updateUserStatus('usr_target', 'usr_admin', 'BANNED');
    expect(redis.set).toHaveBeenCalledWith('blocked:usr_target', 'BANNED', 'EX', 900);
  });

  it('should remove user from Redis blocklist when reactivated', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findById.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));
    usersRepo.updateStatus.mockResolvedValue(createMockUser({ status: 'ACTIVE' }));

    await service.updateUserStatus('usr_target', 'usr_admin', 'ACTIVE');
    expect(redis.del).toHaveBeenCalledWith('blocked:usr_target');
  });
});

// ============================================================
// BLOCKLIST — banned user with valid access token
// ============================================================

describe('UsersService — blocklist on delete', () => {
  it('should add user to Redis blocklist on account deletion', async () => {
    const { service, usersRepo, redis } = createService();
    usersRepo.findActiveById.mockResolvedValue(createMockUser());

    await service.deleteMyAccount('usr_abc123');
    expect(redis.set).toHaveBeenCalledWith('blocked:usr_abc123', 'DELETED', 'EX', 900);
  });
});

/**
 * Merchants module — Tests (Vitest)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MerchantsService } from './merchants.service.js';
import { MerchantsRepository } from './merchants.repository.js';
import { AuthRepository } from '../auth/auth.repository.js';
import type Redis from 'ioredis';
import type { Logger } from 'pino';

// ============================================================
// MOCKS
// ============================================================

function createMockMerchant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mch_abc123',
    businessName: 'Chez Mama',
    type: 'RESTAURANT',
    status: 'ACTIVE',
    description: 'Best ndolé in town',
    logoUrl: null,
    coverUrl: null,
    addressLabel: 'Marché Central',
    city: 'Douala',
    district: 'Akwa',
    landmark: 'À côté de la pharmacie',
    latitude: 4.0510564,
    longitude: 9.7678687,
    phonePrimary: '+237691234567',
    phoneSecondary: null,
    email: null,
    commissionRate: 20,
    averagePreparationMinutes: 25,
    minimumOrderFcfa: 1500,
    acceptsCash: true,
    acceptsMomo: true,
    averageRating: 4.5,
    totalOrders: 120,
    totalRevenueFcfa: 500000,
    legalName: null,
    registrationNumber: null,
    taxId: null,
    momoNumber: null,
    momoOperator: null,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-05-16'),
    deletedAt: null,
    ...overrides,
  };
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
  };
}

function createMockMerchantsRepo() {
  return {
    createWithOwner: vi.fn(),
    findById: vi.fn(),
    findActiveById: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    listPublic: vi.fn(),
    listAdmin: vi.fn(),
    findMembership: vi.fn(),
    addMember: vi.fn().mockResolvedValue({}),
    removeMember: vi.fn().mockResolvedValue(undefined),
    listTeam: vi.fn(),
    getHours: vi.fn(),
    replaceHours: vi.fn(),
  };
}

function createMockAuthRepo() {
  return {
    findUserByPhone: vi.fn(),
    revokeAllUserSessions: vi.fn(),
  };
}

type MockMerchRepo = ReturnType<typeof createMockMerchantsRepo>;
type MockAuthRepo = ReturnType<typeof createMockAuthRepo>;

function createMockSearchIndexService() {
  return {
    indexProduct: vi.fn().mockResolvedValue(undefined),
    removeProduct: vi.fn().mockResolvedValue(undefined),
    reindexMerchantProducts: vi.fn().mockResolvedValue(undefined),
  };
}

function createService() {
  const merchRepo = createMockMerchantsRepo();
  const authRepo = createMockAuthRepo();
  const searchIdx = createMockSearchIndexService();
  const redis = createMockRedis();
  const service = new MerchantsService(
    merchRepo as unknown as MerchantsRepository,
    authRepo as unknown as AuthRepository,
    searchIdx as any,
    redis as unknown as Redis,
    createMockLogger(),
  );
  return { service, merchRepo, authRepo, searchIdx, redis };
}

// ============================================================
// CREATE
// ============================================================

describe('MerchantsService.create', () => {
  const createBody = {
    businessName: 'Chez Mama',
    type: 'RESTAURANT' as const,
    addressLabel: 'Marché Central',
    city: 'Douala',
    latitude: 4.05,
    longitude: 9.77,
    phonePrimary: '+237691234567',
  };

  it('should create merchant via transaction with OWNER membership', async () => {
    const { service, merchRepo } = createService();
    merchRepo.createWithOwner.mockResolvedValue(createMockMerchant({ status: 'PENDING' }));

    const result = await service.create(createBody, 'usr_creator');

    expect(merchRepo.createWithOwner).toHaveBeenCalledWith(createBody, 'usr_creator');
    expect(result.businessName).toBe('Chez Mama');
  });

  it('should return merchant in PENDING status', async () => {
    const { service, merchRepo } = createService();
    merchRepo.createWithOwner.mockResolvedValue(createMockMerchant({ status: 'PENDING' }));

    const result = await service.create(createBody, 'usr_creator');
    expect(result.status).toBe('PENDING');
  });

  it('should allow same user to create multiple merchants (no limit)', async () => {
    const { service, merchRepo } = createService();
    merchRepo.createWithOwner
      .mockResolvedValueOnce(createMockMerchant({ id: 'mch_first', status: 'PENDING' }))
      .mockResolvedValueOnce(createMockMerchant({ id: 'mch_second', status: 'PENDING' }));

    const first = await service.create(createBody, 'usr_creator');
    const second = await service.create({ ...createBody, businessName: 'Second Shop' }, 'usr_creator');

    expect(first.id).toBe('mch_first');
    expect(second.id).toBe('mch_second');
    expect(merchRepo.createWithOwner).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// UPDATE (membership)
// ============================================================

describe('MerchantsService.update', () => {
  it('should allow OWNER to update', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant());
    merchRepo.update.mockResolvedValue(createMockMerchant({ businessName: 'New Name' }));

    const result = await service.update('mch_abc123', { businessName: 'New Name' });
    expect(result.businessName).toBe('New Name');
  });

  it('should invalidate cache on update', async () => {
    const { service, merchRepo, redis } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant());
    merchRepo.update.mockResolvedValue(createMockMerchant());

    await service.update('mch_abc123', { description: 'Updated' });
    expect(redis.del).toHaveBeenCalledWith('merchant:mch_abc123');
  });
});

// ============================================================
// MEMBERSHIP VERIFICATION
// ============================================================

describe('MerchantsService.verifyMembership', () => {
  it('should return role for valid member', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findMembership.mockResolvedValue({ role: 'MANAGER' });

    const role = await service.verifyMembership('usr_member', 'mch_abc123');
    expect(role).toBe('MANAGER');
  });

  it('should throw 403 for non-member', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findMembership.mockResolvedValue(null);

    await expect(service.verifyMembership('usr_stranger', 'mch_abc123'))
      .rejects.toThrow('Not a member');
  });
});

// ============================================================
// TEAM MANAGEMENT
// ============================================================

describe('MerchantsService.addTeamMember', () => {
  it('should add member by phone', async () => {
    const { service, merchRepo, authRepo } = createService();
    authRepo.findUserByPhone.mockResolvedValue({ id: 'usr_new', phone: '+237699999999', firstName: 'Paul', lastName: null });
    merchRepo.findMembership.mockResolvedValue(null);

    const result = await service.addTeamMember('mch_abc123', { phone: '+237699999999', role: 'STAFF' });
    expect(result.userId).toBe('usr_new');
    expect(result.role).toBe('STAFF');
    expect(merchRepo.addMember).toHaveBeenCalledWith('mch_abc123', 'usr_new', 'STAFF');
  });

  it('should reject if user not registered on Wakaman', async () => {
    const { service, authRepo } = createService();
    authRepo.findUserByPhone.mockResolvedValue(null);

    await expect(service.addTeamMember('mch_abc123', { phone: '+237600000000', role: 'MANAGER' }))
      .rejects.toThrow('pas inscrit sur Wakaman');
  });

  it('should reject if already a member', async () => {
    const { service, merchRepo, authRepo } = createService();
    authRepo.findUserByPhone.mockResolvedValue({ id: 'usr_dup', phone: '+237699999999' });
    merchRepo.findMembership.mockResolvedValue({ role: 'STAFF' });

    await expect(service.addTeamMember('mch_abc123', { phone: '+237699999999', role: 'MANAGER' }))
      .rejects.toThrow('already a member');
  });
});

describe('MerchantsService.removeTeamMember', () => {
  it('should remove a STAFF member', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findMembership.mockResolvedValue({ role: 'STAFF' });

    await service.removeTeamMember('mch_abc123', 'usr_staff', 'usr_owner');
    expect(merchRepo.removeMember).toHaveBeenCalledWith('usr_staff', 'mch_abc123');
  });

  it('should reject removing OWNER', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findMembership.mockResolvedValue({ role: 'OWNER' });

    await expect(service.removeTeamMember('mch_abc123', 'usr_owner_target', 'usr_admin'))
      .rejects.toThrow('Cannot remove the OWNER');
  });

  it('should reject OWNER removing themselves', async () => {
    const { service } = createService();

    await expect(service.removeTeamMember('mch_abc123', 'usr_owner', 'usr_owner'))
      .rejects.toThrow('Cannot remove yourself');
  });
});

// ============================================================
// ADMIN — APPROVE / SUSPEND
// ============================================================

describe('MerchantsService.approve', () => {
  it('should approve PENDING merchant → ACTIVE and invalidate cache', async () => {
    const { service, merchRepo, redis } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'PENDING' }));
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));

    const result = await service.approve('mch_abc123');
    expect(result.status).toBe('ACTIVE');
    expect(redis.del).toHaveBeenCalledWith('merchant:mch_abc123');
  });

  it('should reject if not PENDING', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));

    await expect(service.approve('mch_abc123')).rejects.toThrow('must be PENDING');
  });

  it('should reindex merchant products on approve', async () => {
    const { service, merchRepo, searchIdx } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'PENDING' }));
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));

    await service.approve('mch_abc123');
    expect(searchIdx.reindexMerchantProducts).toHaveBeenCalledWith('mch_abc123');
  });
});

describe('MerchantsService.suspend', () => {
  it('should suspend merchant and invalidate cache', async () => {
    const { service, merchRepo, redis } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant());
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'SUSPENDED' }));

    const result = await service.suspend('mch_abc123');
    expect(result.status).toBe('SUSPENDED');
    expect(redis.del).toHaveBeenCalledWith('merchant:mch_abc123');
  });

  it('should reindex merchant products on suspend', async () => {
    const { service, merchRepo, searchIdx } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant());
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'SUSPENDED' }));

    await service.suspend('mch_abc123');
    expect(searchIdx.reindexMerchantProducts).toHaveBeenCalledWith('mch_abc123');
  });
});

// ============================================================
// PUBLIC LIST — only ACTIVE
// ============================================================

describe('MerchantsService.listPublic', () => {
  it('should return only ACTIVE merchants', async () => {
    const { service, merchRepo } = createService();
    merchRepo.listPublic.mockResolvedValue({
      items: [createMockMerchant()],
      total: 1,
    });

    const result = await service.listPublic({});
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe('ACTIVE');
  });

  it('should pass city filter', async () => {
    const { service, merchRepo } = createService();
    merchRepo.listPublic.mockResolvedValue({ items: [], total: 0 });

    await service.listPublic({ city: 'Yaoundé' });
    expect(merchRepo.listPublic).toHaveBeenCalledWith({ city: 'Yaoundé' });
  });

  it('should pass type filter', async () => {
    const { service, merchRepo } = createService();
    merchRepo.listPublic.mockResolvedValue({ items: [], total: 0 });

    await service.listPublic({ type: 'PHARMACY' });
    expect(merchRepo.listPublic).toHaveBeenCalledWith({ type: 'PHARMACY' });
  });

  it('should pass search filter', async () => {
    const { service, merchRepo } = createService();
    merchRepo.listPublic.mockResolvedValue({ items: [], total: 0 });

    await service.listPublic({ search: 'Mama' });
    expect(merchRepo.listPublic).toHaveBeenCalledWith({ search: 'Mama' });
  });

  it('should pass combined filters', async () => {
    const { service, merchRepo } = createService();
    merchRepo.listPublic.mockResolvedValue({ items: [], total: 0 });

    await service.listPublic({ city: 'Douala', type: 'RESTAURANT', search: 'Chez' });
    expect(merchRepo.listPublic).toHaveBeenCalledWith({ city: 'Douala', type: 'RESTAURANT', search: 'Chez' });
  });
});

// ============================================================
// PUBLIC GET — ACTIVE only
// ============================================================

describe('MerchantsService.getPublicById', () => {
  it('should return ACTIVE merchant', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findActiveById.mockResolvedValue(createMockMerchant());

    const result = await service.getPublicById('mch_abc123');
    expect(result.id).toBe('mch_abc123');
  });

  it('should return 404 for PENDING merchant', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findActiveById.mockResolvedValue(null);

    await expect(service.getPublicById('mch_pending'))
      .rejects.toThrow('not found');
  });

  it('should use cache on second call', async () => {
    const { service, merchRepo, redis } = createService();
    merchRepo.findActiveById.mockResolvedValue(createMockMerchant());

    await service.getPublicById('mch_abc123');
    await service.getPublicById('mch_abc123');

    expect(merchRepo.findActiveById).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// HOURS
// ============================================================

describe('MerchantsService.updateHours', () => {
  it('should replace all 7 days and invalidate cache', async () => {
    const { service, merchRepo, redis } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant());

    const hoursInput = Array.from({ length: 7 }, (_, i) => ({
      dayOfWeek: i,
      openTime: '08:00',
      closeTime: '22:00',
      isClosed: i === 0, // Sunday closed
    }));
    merchRepo.replaceHours.mockResolvedValue(hoursInput.map((h) => ({ ...h, id: `mhr_${h.dayOfWeek}`, merchantId: 'mch_abc123' })));

    const result = await service.updateHours('mch_abc123', { hours: hoursInput });
    expect(result.hours).toHaveLength(7);
    expect(result.hours[0].isClosed).toBe(true);
    expect(redis.del).toHaveBeenCalledWith('merchant:mch_abc123');
  });
});

// ============================================================
// PAUSE / RESUME
// ============================================================

describe('MerchantsService.pause/resume', () => {
  it('should pause ACTIVE merchant', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'PAUSED' }));

    await expect(service.pause('mch_abc123')).resolves.toBeUndefined();
    expect(merchRepo.updateStatus).toHaveBeenCalledWith('mch_abc123', 'PAUSED');
  });

  it('should reject pause if not ACTIVE', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'PENDING' }));

    await expect(service.pause('mch_abc123')).rejects.toThrow('must be ACTIVE');
  });

  it('should resume PAUSED merchant', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'PAUSED' }));
    merchRepo.updateStatus.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));

    await expect(service.resume('mch_abc123')).resolves.toBeUndefined();
    expect(merchRepo.updateStatus).toHaveBeenCalledWith('mch_abc123', 'ACTIVE');
  });

  it('should reject resume if not PAUSED', async () => {
    const { service, merchRepo } = createService();
    merchRepo.findById.mockResolvedValue(createMockMerchant({ status: 'ACTIVE' }));

    await expect(service.resume('mch_abc123')).rejects.toThrow('must be PAUSED');
  });
});

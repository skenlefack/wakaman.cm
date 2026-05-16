/**
 * Auth module — Tests (Vitest)
 *
 * Unit tests for AuthService (login, logout, sessions)
 * and TokenService (refresh with rotation + grace window).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { AuthRepository } from './auth.repository.js';
import type { SmsProvider } from '../../providers/sms/sms.provider.js';
import type { Logger } from 'pino';
import type Redis from 'ioredis';
import type { User, OTPCode, Session } from '@prisma/client';

// ============================================================
// MOCKS
// ============================================================

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const MOCK_PHONE = '+237691234567';
const MOCK_OTP = '123456';
const MOCK_OTP_HASH = hashCode(MOCK_OTP);
const MOCK_REFRESH_TOKEN = 'a'.repeat(64);
const MOCK_REFRESH_HASH = hashCode(MOCK_REFRESH_TOKEN);

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'usr_abc123',
    phone: MOCK_PHONE,
    email: null,
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
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  } as User;
}

function createMockOtp(overrides: Partial<OTPCode> = {}): OTPCode {
  return {
    id: 'otp_abc123',
    phone: MOCK_PHONE,
    code: MOCK_OTP_HASH,
    purpose: 'LOGIN',
    attempts: 0,
    verified: false,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  } as OTPCode;
}

function createMockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses_abc123',
    userId: 'usr_abc123',
    refreshToken: MOCK_REFRESH_HASH,
    deviceId: null,
    deviceType: 'android',
    deviceName: 'Samsung Galaxy A14',
    appVersion: '1.0.0',
    ipAddress: '1.2.3.4',
    userAgent: 'TestAgent/1.0',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Session;
}

function createMockLogger(): Logger {
  return { info: () => {}, error: () => {}, warn: () => {}, debug: () => {} } as unknown as Logger;
}

function createMockSmsProvider(): SmsProvider {
  return { send: async () => ({ success: true, externalId: 'fake_123' }) };
}

function createMockTokenService() {
  return {
    generateTokenPair: vi.fn().mockResolvedValue({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
    }),
    refresh: vi.fn(),
  };
}

function createMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, _mode: string, _ttl: number) => {
      store.set(key, value);
      return 'OK';
    }),
    _store: store,
  };
}

function createMockRepository() {
  return {
    findUserByPhone: vi.fn(),
    findUserById: vi.fn(),
    findLatestOtp: vi.fn(),
    createOtp: vi.fn().mockResolvedValue(createMockOtp()),
    incrementOtpAttempts: vi.fn().mockResolvedValue(createMockOtp()),
    markOtpVerified: vi.fn().mockResolvedValue(createMockOtp({ verified: true })),
    invalidatePendingOtps: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
    activateUser: vi.fn(),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    findSessionByRefreshTokenHash: vi.fn(),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    revokeAllUserSessions: vi.fn().mockResolvedValue(3),
    findActiveSessions: vi.fn().mockResolvedValue([]),
    countActiveSessions: vi.fn().mockResolvedValue(0),
    revokeOldestSession: vi.fn().mockResolvedValue(undefined),
    purgeExpiredSessions: vi.fn().mockResolvedValue(5),
    purgeExpiredOtps: vi.fn().mockResolvedValue(10),
  };
}

type MockRepo = ReturnType<typeof createMockRepository>;
type MockRedis = ReturnType<typeof createMockRedis>;

// ============================================================
// LOGIN TESTS
// ============================================================

describe('AuthService.login', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should send OTP to a verified active user', async () => {
    repo.findUserByPhone.mockResolvedValue(createMockUser());
    const result = await service.login({ phone: MOCK_PHONE });
    expect(result.message).toBe('Verification code sent');
    expect(result.expiresInSeconds).toBe(300);
    expect(repo.invalidatePendingOtps).toHaveBeenCalledWith(MOCK_PHONE, 'LOGIN');
  });

  it('should reject non-existent phone with generic error', async () => {
    repo.findUserByPhone.mockResolvedValue(null);
    await expect(service.login({ phone: MOCK_PHONE })).rejects.toThrow('Invalid credentials');
  });

  it('should reject unverified phone with same generic error', async () => {
    repo.findUserByPhone.mockResolvedValue(createMockUser({ phoneVerifiedAt: null }));
    await expect(service.login({ phone: MOCK_PHONE })).rejects.toThrow('Invalid credentials');
  });

  it('should reject SUSPENDED account', async () => {
    repo.findUserByPhone.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));
    await expect(service.login({ phone: MOCK_PHONE })).rejects.toThrow('Account suspended');
  });

  it('should reject BANNED account', async () => {
    repo.findUserByPhone.mockResolvedValue(createMockUser({ status: 'BANNED' }));
    await expect(service.login({ phone: MOCK_PHONE })).rejects.toThrow('Account suspended');
  });
});

// ============================================================
// VERIFY LOGIN OTP TESTS
// ============================================================

describe('AuthService.verifyLoginOtp', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should verify OTP and return user with tokens', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(createMockUser());
    const result = await service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP });
    expect(result.user.id).toBe('usr_abc123');
    expect(result.accessToken).toBe('mock_access_token');
    expect(result.refreshToken).toBe('mock_refresh_token');
    expect(repo.markOtpVerified).toHaveBeenCalledWith('otp_abc123');
  });

  it('should reject when no OTP exists', async () => {
    repo.findLatestOtp.mockResolvedValue(null);
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('No pending verification code found');
  });

  it('should reject already used OTP', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp({ verified: true }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('already been used');
  });

  it('should reject expired OTP', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('expired');
  });

  it('should reject after max attempts', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp({ attempts: 3 }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('Too many failed attempts');
  });

  it('should increment attempts on wrong code', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: '000000' }))
      .rejects.toThrow('Invalid verification code');
    expect(repo.incrementOtpAttempts).toHaveBeenCalledWith('otp_abc123');
  });

  it('should show remaining attempts on wrong code', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp({ attempts: 1 }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: '000000' }))
      .rejects.toThrow('1 attempt(s) remaining');
  });

  it('should reject SUSPENDED user even with valid OTP', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('Account suspended');
  });

  it('should reject BANNED user even with valid OTP', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(createMockUser({ status: 'BANNED' }));
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('Account suspended');
  });

  it('should reject if user disappeared between login and verify', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(null);
    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('Invalid credentials');
  });

  it('should pass device info to token generation and lastLogin', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(createMockUser());
    await service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }, { ipAddress: '1.2.3.4' });
    expect(repo.updateLastLogin).toHaveBeenCalledWith('usr_abc123', '1.2.3.4');
  });
});

// ============================================================
// TOKEN SERVICE — REFRESH TESTS
// ============================================================

describe('TokenService.refresh', () => {
  let tokenService: TokenService;
  let repo: MockRepo;
  let mockRedis: MockRedis;
  const mockJwtSign = vi.fn().mockReturnValue('new_access_token');
  const mockPrisma = { session: { create: vi.fn().mockResolvedValue({}) } };

  beforeEach(() => {
    repo = createMockRepository();
    mockRedis = createMockRedis();
    tokenService = new TokenService(
      mockPrisma as any,
      mockRedis as unknown as Redis,
      repo as unknown as AuthRepository,
      mockJwtSign,
      createMockLogger(),
    );
  });

  it('should return new token pair on valid refresh', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(createMockUser());
    const result = await tokenService.refresh(MOCK_REFRESH_TOKEN);
    expect(result.accessToken).toBe('new_access_token');
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe(MOCK_REFRESH_TOKEN);
    expect(repo.revokeSession).toHaveBeenCalledWith('ses_abc123');
  });

  it('should store new tokens in Redis grace window after rotation', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(createMockUser());
    await tokenService.refresh(MOCK_REFRESH_TOKEN);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `refresh_grace:${MOCK_REFRESH_HASH}`,
      expect.any(String),
      'EX',
      30,
    );
  });

  it('should return cached tokens on retry within grace window (3G retry)', async () => {
    // First refresh succeeds — tokens stored in Redis
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(createMockUser());
    const firstResult = await tokenService.refresh(MOCK_REFRESH_TOKEN);

    // Second refresh — session is now revoked, but Redis has cached tokens
    repo.findSessionByRefreshTokenHash.mockResolvedValue(
      createMockSession({ revokedAt: new Date() }),
    );
    repo.revokeAllUserSessions.mockClear();

    const retryResult = await tokenService.refresh(MOCK_REFRESH_TOKEN);

    // Must return the SAME tokens, no all-revoke
    expect(retryResult).toEqual(firstResult);
    expect(repo.revokeAllUserSessions).not.toHaveBeenCalled();
  });

  it('should all-revoke on reuse OUTSIDE grace window', async () => {
    // Session revoked, Redis empty (grace expired)
    repo.findSessionByRefreshTokenHash.mockResolvedValue(
      createMockSession({ revokedAt: new Date() }),
    );
    // mockRedis.get returns null by default (no cached tokens)
    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Refresh token has been revoked');
    expect(repo.revokeAllUserSessions).toHaveBeenCalledWith('usr_abc123');
  });

  it('should reject unknown refresh token', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(null);
    await expect(tokenService.refresh('unknown_token'))
      .rejects.toThrow('Invalid refresh token');
  });

  it('should reject expired refresh token', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(
      createMockSession({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Refresh token has expired');
  });

  it('should reject if user no longer exists', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(null);
    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Invalid refresh token');
  });

  it('should reject SUSPENDED user and revoke all sessions', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(createMockUser({ status: 'SUSPENDED' }));
    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Account suspended');
    expect(repo.revokeAllUserSessions).toHaveBeenCalledWith('usr_abc123');
  });

  it('should reject BANNED user and revoke all sessions', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    repo.findUserById.mockResolvedValue(createMockUser({ status: 'BANNED' }));
    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Account suspended');
    expect(repo.revokeAllUserSessions).toHaveBeenCalledWith('usr_abc123');
  });
});

// ============================================================
// LOGOUT TESTS
// ============================================================

describe('AuthService.logout', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should revoke session on logout', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    await service.logout(MOCK_REFRESH_TOKEN);
    expect(repo.revokeSession).toHaveBeenCalledWith('ses_abc123');
  });

  it('should silently succeed if token not found', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(null);
    await expect(service.logout('nonexistent')).resolves.toBeUndefined();
  });

  it('should silently succeed if already revoked', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(
      createMockSession({ revokedAt: new Date() }),
    );
    await expect(service.logout(MOCK_REFRESH_TOKEN)).resolves.toBeUndefined();
    expect(repo.revokeSession).not.toHaveBeenCalled();
  });

  it('should fail refresh after logout (outside grace window)', async () => {
    repo.findSessionByRefreshTokenHash.mockResolvedValue(createMockSession());
    await service.logout(MOCK_REFRESH_TOKEN);

    // Simulate refresh attempt with revoked session and no Redis cache
    const repoForRefresh = createMockRepository();
    repoForRefresh.findSessionByRefreshTokenHash.mockResolvedValue(
      createMockSession({ revokedAt: new Date() }),
    );
    const mockRedis = createMockRedis();
    const tokenService = new TokenService(
      { session: { create: vi.fn().mockResolvedValue({}) } } as any,
      mockRedis as unknown as Redis,
      repoForRefresh as unknown as AuthRepository,
      vi.fn().mockReturnValue('token'),
      createMockLogger(),
    );

    await expect(tokenService.refresh(MOCK_REFRESH_TOKEN))
      .rejects.toThrow('Refresh token has been revoked');
  });
});

// ============================================================
// LOGOUT-ALL TESTS
// ============================================================

describe('AuthService.logoutAll', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should revoke all user sessions and return count', async () => {
    repo.revokeAllUserSessions.mockResolvedValue(3);
    const count = await service.logoutAll('usr_abc123');
    expect(count).toBe(3);
    expect(repo.revokeAllUserSessions).toHaveBeenCalledWith('usr_abc123');
  });
});

// ============================================================
// SESSIONS LIST TESTS
// ============================================================

describe('AuthService.getActiveSessions', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should return active sessions with device info', async () => {
    repo.findActiveSessions.mockResolvedValue([
      createMockSession(),
      createMockSession({ id: 'ses_def456', deviceType: 'ios', deviceName: 'iPhone 15' }),
    ]);
    const sessions = await service.getActiveSessions('usr_abc123');
    expect(sessions).toHaveLength(2);
    expect(sessions[0].deviceType).toBe('android');
    expect(sessions[1].deviceType).toBe('ios');
  });

  it('should mark current session when hash matches', async () => {
    repo.findActiveSessions.mockResolvedValue([
      createMockSession(),
      createMockSession({ id: 'ses_def456', refreshToken: 'other_hash' }),
    ]);
    const sessions = await service.getActiveSessions('usr_abc123', MOCK_REFRESH_HASH);
    expect(sessions[0].current).toBe(true);
    expect(sessions[1].current).toBe(false);
  });

  it('should return empty array when no sessions', async () => {
    repo.findActiveSessions.mockResolvedValue([]);
    const sessions = await service.getActiveSessions('usr_abc123');
    expect(sessions).toEqual([]);
  });
});

// ============================================================
// CLEANUP TESTS
// ============================================================

describe('AuthService.purgeExpired', () => {
  let service: AuthService;
  let repo: MockRepo;

  beforeEach(() => {
    repo = createMockRepository();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService() as unknown as TokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should purge expired sessions and OTPs', async () => {
    const result = await service.purgeExpired();
    expect(result).toEqual({ sessions: 5, otps: 10 });
    expect(repo.purgeExpiredSessions).toHaveBeenCalled();
    expect(repo.purgeExpiredOtps).toHaveBeenCalled();
  });
});

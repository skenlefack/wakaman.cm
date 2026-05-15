/**
 * Auth module — Tests (Vitest)
 *
 * Unit tests for AuthService login flow.
 * Tests signup + login together since login requires a verified user.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import type { TokenService } from './token.service.js';
import type { SmsProvider } from '../../providers/sms/sms.provider.js';
import type { Logger } from 'pino';
import type { User, OTPCode } from '@prisma/client';

// ============================================================
// MOCKS
// ============================================================

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

const MOCK_PHONE = '+237691234567';
const MOCK_OTP = '123456';
const MOCK_OTP_HASH = hashCode(MOCK_OTP);

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

function createMockLogger(): Logger {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  } as unknown as Logger;
}

function createMockSmsProvider(): SmsProvider {
  return {
    send: async () => ({ success: true, externalId: 'fake_123' }),
  };
}

function createMockTokenService(): TokenService {
  return {
    generateTokenPair: async () => ({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
    }),
  } as unknown as TokenService;
}

interface MockRepository {
  findUserByPhone: ReturnType<typeof vi.fn>;
  findLatestOtp: ReturnType<typeof vi.fn>;
  createOtp: ReturnType<typeof vi.fn>;
  incrementOtpAttempts: ReturnType<typeof vi.fn>;
  markOtpVerified: ReturnType<typeof vi.fn>;
  invalidatePendingOtps: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  activateUser: ReturnType<typeof vi.fn>;
  updateLastLogin: ReturnType<typeof vi.fn>;
}

function createMockRepository(): MockRepository {
  return {
    findUserByPhone: vi.fn(),
    findLatestOtp: vi.fn(),
    createOtp: vi.fn().mockResolvedValue(createMockOtp()),
    incrementOtpAttempts: vi.fn().mockResolvedValue(createMockOtp()),
    markOtpVerified: vi.fn().mockResolvedValue(createMockOtp({ verified: true })),
    invalidatePendingOtps: vi.fn().mockResolvedValue(undefined),
    createUser: vi.fn(),
    activateUser: vi.fn(),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
  };
}

// ============================================================
// LOGIN TESTS
// ============================================================

describe('AuthService.login', () => {
  let service: AuthService;
  let repo: MockRepository;
  let smsProvider: SmsProvider;

  beforeEach(() => {
    repo = createMockRepository();
    smsProvider = createMockSmsProvider();
    service = new AuthService(
      repo as unknown as AuthRepository,
      createMockTokenService(),
      smsProvider,
      createMockLogger(),
    );
  });

  it('should send OTP to a verified active user', async () => {
    repo.findUserByPhone.mockResolvedValue(createMockUser());

    const result = await service.login({ phone: MOCK_PHONE });

    expect(result.message).toBe('Verification code sent');
    expect(result.expiresInSeconds).toBe(300);
    expect(repo.invalidatePendingOtps).toHaveBeenCalledWith(MOCK_PHONE, 'LOGIN');
    expect(repo.createOtp).toHaveBeenCalled();
  });

  it('should reject non-existent phone with generic error', async () => {
    repo.findUserByPhone.mockResolvedValue(null);

    await expect(service.login({ phone: MOCK_PHONE }))
      .rejects.toThrow('Invalid credentials');
  });

  it('should reject unverified phone with same generic error', async () => {
    repo.findUserByPhone.mockResolvedValue(
      createMockUser({ phoneVerifiedAt: null }),
    );

    await expect(service.login({ phone: MOCK_PHONE }))
      .rejects.toThrow('Invalid credentials');
  });

  it('should reject SUSPENDED account', async () => {
    repo.findUserByPhone.mockResolvedValue(
      createMockUser({ status: 'SUSPENDED' }),
    );

    await expect(service.login({ phone: MOCK_PHONE }))
      .rejects.toThrow('Account suspended');
  });

  it('should reject BANNED account', async () => {
    repo.findUserByPhone.mockResolvedValue(
      createMockUser({ status: 'BANNED' }),
    );

    await expect(service.login({ phone: MOCK_PHONE }))
      .rejects.toThrow('Account suspended');
  });
});

// ============================================================
// VERIFY LOGIN OTP TESTS
// ============================================================

describe('AuthService.verifyLoginOtp', () => {
  let service: AuthService;
  let repo: MockRepository;
  let tokenService: TokenService;

  beforeEach(() => {
    repo = createMockRepository();
    tokenService = createMockTokenService();
    service = new AuthService(
      repo as unknown as AuthRepository,
      tokenService,
      createMockSmsProvider(),
      createMockLogger(),
    );
  });

  it('should verify OTP and return user with tokens', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(createMockUser());

    const result = await service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP });

    expect(result.user.id).toBe('usr_abc123');
    expect(result.user.phone).toBe(MOCK_PHONE);
    expect(result.user.firstName).toBe('Jean');
    expect(result.accessToken).toBe('mock_access_token');
    expect(result.refreshToken).toBe('mock_refresh_token');
    expect(repo.markOtpVerified).toHaveBeenCalledWith('otp_abc123');
    expect(repo.updateLastLogin).toHaveBeenCalledWith('usr_abc123', undefined);
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
    repo.findLatestOtp.mockResolvedValue(
      createMockOtp({ expiresAt: new Date(Date.now() - 1000) }),
    );

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
    repo.findUserByPhone.mockResolvedValue(
      createMockUser({ status: 'SUSPENDED' }),
    );

    await expect(service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }))
      .rejects.toThrow('Account suspended');
  });

  it('should reject BANNED user even with valid OTP', async () => {
    repo.findLatestOtp.mockResolvedValue(createMockOtp());
    repo.findUserByPhone.mockResolvedValue(
      createMockUser({ status: 'BANNED' }),
    );

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

    const deviceInfo = { ipAddress: '1.2.3.4', userAgent: 'TestAgent/1.0' };
    await service.verifyLoginOtp({ phone: MOCK_PHONE, code: MOCK_OTP }, deviceInfo);

    expect(repo.updateLastLogin).toHaveBeenCalledWith('usr_abc123', '1.2.3.4');
  });
});

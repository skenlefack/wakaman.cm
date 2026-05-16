/**
 * Token Service — JWT access + refresh token generation and rotation
 *
 * Handles token pair creation, refresh with rotation, and session lifecycle.
 * Uses Redis grace window to handle network retries on unstable connections
 * (critical for 3G networks in Cameroon/CEMAC).
 */

import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import type { Logger } from 'pino';
import { ForbiddenError, UnauthorizedError } from '../../lib/errors.js';
import type { AuthRepository } from './auth.repository.js';
import { MAX_SESSIONS_PER_USER, REFRESH_GRACE_PERIOD_SECONDS } from './auth.types.js';

// ============================================================
// CONSTANTS
// ============================================================

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const REDIS_GRACE_PREFIX = 'refresh_grace:';

// ============================================================
// TYPES
// ============================================================

export type JwtSign = (payload: Record<string, unknown>, options?: { expiresIn?: string }) => string;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface DeviceInfo {
  deviceId?: string;
  deviceType?: string;
  deviceName?: string;
  appVersion?: string;
  ipAddress?: string;
  userAgent?: string;
}

// ============================================================
// SERVICE
// ============================================================

export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly authRepository: AuthRepository,
    private readonly jwtSign: JwtSign,
    private readonly logger: Logger,
  ) {}

  async generateTokenPair(
    userId: string,
    userType: string,
    deviceInfo?: DeviceInfo,
  ): Promise<TokenPair> {
    // Enforce max sessions limit — revoke oldest if at capacity
    const activeCount = await this.authRepository.countActiveSessions(userId);
    if (activeCount >= MAX_SESSIONS_PER_USER) {
      await this.authRepository.revokeOldestSession(userId);
      this.logger.info({ userId, activeCount }, 'Revoked oldest session (max sessions reached)');
    }

    const accessToken = this.jwtSign(
      { sub: userId, type: userType },
      { expiresIn: ACCESS_TOKEN_EXPIRY },
    );

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await this.prisma.session.create({
      data: {
        userId,
        refreshToken: refreshTokenHash,
        expiresAt,
        deviceId: deviceInfo?.deviceId,
        deviceType: deviceInfo?.deviceType,
        deviceName: deviceInfo?.deviceName,
        appVersion: deviceInfo?.appVersion,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
      },
    });

    this.logger.info({ userId }, 'Token pair generated, session created');

    return { accessToken, refreshToken };
  }

  // ============================================================
  // REFRESH — rotate refresh token with grace window
  // ============================================================

  async refresh(rawRefreshToken: string): Promise<TokenPair> {
    const hash = createHash('sha256').update(rawRefreshToken).digest('hex');
    const session = await this.authRepository.findSessionByRefreshTokenHash(hash);

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (session.revokedAt) {
      // Check Redis grace window — network retry on 3G?
      const cached = await this.getGraceTokens(hash);
      if (cached) {
        this.logger.info({ userId: session.userId, sessionId: session.id }, 'Refresh retry within grace window — returning cached tokens');
        return cached;
      }

      // Outside grace window — real token reuse, revoke everything
      await this.authRepository.revokeAllUserSessions(session.userId);
      this.logger.warn({ userId: session.userId, sessionId: session.id }, 'Refresh token reuse detected — all sessions revoked');
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Check user is still active
    const user = await this.authRepository.findUserById(session.userId);
    if (!user) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      await this.authRepository.revokeAllUserSessions(user.id);
      throw new ForbiddenError('Account suspended');
    }

    // Rotate: revoke old session, issue new token pair
    await this.authRepository.revokeSession(session.id);

    const newTokens = await this.generateTokenPair(user.id, user.type, {
      deviceId: session.deviceId ?? undefined,
      deviceType: session.deviceType ?? undefined,
      deviceName: session.deviceName ?? undefined,
      appVersion: session.appVersion ?? undefined,
      ipAddress: session.ipAddress ?? undefined,
      userAgent: session.userAgent ?? undefined,
    });

    // Store new tokens in Redis grace window, keyed by OLD token hash
    await this.setGraceTokens(hash, newTokens);

    this.logger.info({ userId: user.id, oldSessionId: session.id }, 'Token refreshed with rotation');

    return newTokens;
  }

  // ============================================================
  // REDIS GRACE WINDOW
  // ============================================================

  private async setGraceTokens(oldTokenHash: string, tokens: TokenPair): Promise<void> {
    const key = `${REDIS_GRACE_PREFIX}${oldTokenHash}`;
    await this.redis.set(key, JSON.stringify(tokens), 'EX', REFRESH_GRACE_PERIOD_SECONDS);
  }

  private async getGraceTokens(oldTokenHash: string): Promise<TokenPair | null> {
    const key = `${REDIS_GRACE_PREFIX}${oldTokenHash}`;
    const cached = await this.redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as TokenPair;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

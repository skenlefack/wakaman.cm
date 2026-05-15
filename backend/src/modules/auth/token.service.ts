/**
 * Token Service — JWT access + refresh token generation
 *
 * Extracted as a standalone service so login (feature 2) can reuse it.
 * Receives jwtSign function via DI to stay decoupled from Fastify.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';

// ============================================================
// CONSTANTS
// ============================================================

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

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
    private readonly jwtSign: JwtSign,
    private readonly logger: Logger,
  ) {}

  async generateTokenPair(
    userId: string,
    userType: string,
    deviceInfo?: DeviceInfo,
  ): Promise<TokenPair> {
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
}

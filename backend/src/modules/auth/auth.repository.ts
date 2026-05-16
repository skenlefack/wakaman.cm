/**
 * Auth module — Repository (Prisma)
 *
 * Data access for OTPCode and User creation during signup.
 */

import type { PrismaClient, User, OTPCode, Session } from '@prisma/client';
import type { OtpPurpose } from './auth.types.js';

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ============================================================
  // OTP
  // ============================================================

  async createOtp(data: {
    phone: string;
    code: string;
    purpose: OtpPurpose;
    expiresAt: Date;
  }): Promise<OTPCode> {
    return this.prisma.oTPCode.create({ data });
  }

  async findLatestOtp(phone: string, purpose: OtpPurpose): Promise<OTPCode | null> {
    return this.prisma.oTPCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
  }

  async incrementOtpAttempts(id: string): Promise<OTPCode> {
    return this.prisma.oTPCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async markOtpVerified(id: string): Promise<OTPCode> {
    return this.prisma.oTPCode.update({
      where: { id },
      data: { verified: true },
    });
  }

  async invalidatePendingOtps(phone: string, purpose: OtpPurpose): Promise<void> {
    await this.prisma.oTPCode.updateMany({
      where: { phone, purpose, verified: false },
      data: { expiresAt: new Date() },
    });
  }

  // ============================================================
  // USERS
  // ============================================================

  async findUserByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phone },
      select: {
        id: true,
        phone: true,
        type: true,
        status: true,
        phoneVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        language: true,
        passwordHash: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        birthDate: true,
        gender: true,
        deletedAt: true,
      },
    });
  }

  async createUser(data: {
    phone: string;
    type: 'CLIENT' | 'COURIER' | 'MERCHANT';
  }): Promise<User> {
    const now = new Date();
    return this.prisma.user.create({
      data: {
        phone: data.phone,
        type: data.type,
        status: 'ACTIVE',
        phoneVerifiedAt: now,
      },
    });
  }

  async activateUser(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
      },
    });
  }

  async updateLastLogin(userId: string, ipAddress?: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
      },
    });
  }

  async findUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  // ============================================================
  // SESSIONS
  // ============================================================

  async findSessionByRefreshTokenHash(hash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { refreshToken: hash } });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  async findActiveSessions(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.prisma.session.count({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }

  async revokeOldestSession(userId: string): Promise<void> {
    const oldest = await this.prisma.session.findFirst({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });
    if (oldest) {
      await this.revokeSession(oldest.id);
    }
  }

  // ============================================================
  // CLEANUP (expired sessions & OTPs)
  // ============================================================

  async purgeExpiredSessions(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { not: null } },
        ],
      },
    });
    return result.count;
  }

  async purgeExpiredOtps(): Promise<number> {
    const result = await this.prisma.oTPCode.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

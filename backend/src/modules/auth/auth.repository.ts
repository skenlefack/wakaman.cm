/**
 * Auth module — Repository (Prisma)
 *
 * Data access for OTPCode and User creation during signup.
 */

import type { PrismaClient, User, OTPCode } from '@prisma/client';
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
}

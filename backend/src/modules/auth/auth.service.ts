/**
 * Auth module — Service (business logic)
 *
 * Handles OTP generation, verification, user creation (signup),
 * and login via OTP with auto-login (token generation).
 * Refresh/logout will be added in feature 3.
 */

import { createHash, randomInt } from 'node:crypto';
import type { Logger } from 'pino';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, OtpError, UnauthorizedError } from '../../lib/errors.js';
import type { AuthRepository } from './auth.repository.js';
import type { TokenService } from './token.service.js';
import type { DeviceInfo } from './token.service.js';
import type { SmsProvider } from '../../providers/sms/sms.provider.js';
import { OTP_LENGTH, OTP_EXPIRY_MINUTES, OTP_MAX_ATTEMPTS } from './auth.types.js';
import type { SignupBodyType, VerifyOtpBodyType, LoginBodyType, VerifyLoginOtpBodyType } from './auth.schemas.js';

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly smsProvider: SmsProvider,
    private readonly logger: Logger,
  ) {}

  // ============================================================
  // SIGNUP — Step 1: Send OTP
  // ============================================================

  async signup(data: SignupBodyType): Promise<{ message: string; expiresInSeconds: number }> {
    const existingUser = await this.authRepository.findUserByPhone(data.phone);

    if (existingUser && existingUser.phoneVerifiedAt) {
      throw new ConflictError('Phone number already registered');
    }

    // Invalidate any pending OTPs for this phone+purpose
    await this.authRepository.invalidatePendingOtps(data.phone, 'SIGNUP');

    const otp = this.generateOtp();

    await this.authRepository.createOtp({
      phone: data.phone,
      code: otp.hash,
      purpose: 'SIGNUP',
      expiresAt: otp.expiresAt,
    });

    const smsResult = await this.smsProvider.send({
      to: data.phone,
      message: `Wakaman: votre code de vérification est ${otp.code}. Valable ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    if (!smsResult.success) {
      this.logger.error({ phone: data.phone, error: smsResult.error }, 'Failed to send OTP SMS');
      throw new OtpError('Failed to send verification code. Please try again.');
    }

    return {
      message: 'Verification code sent',
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    };
  }

  // ============================================================
  // SIGNUP — Step 2: Verify OTP & create user
  // ============================================================

  async verifySignupOtp(data: VerifyOtpBodyType, deviceInfo?: DeviceInfo) {
    const otpRecord = await this.authRepository.findLatestOtp(data.phone, 'SIGNUP');

    if (!otpRecord) {
      throw new OtpError('No pending verification code found. Please request a new one.');
    }

    if (otpRecord.verified) {
      throw new OtpError('This code has already been used.');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new OtpError('Verification code has expired. Please request a new one.');
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      throw new OtpError('Too many failed attempts. Please request a new code.', otpRecord.attempts);
    }

    const codeHash = this.hashCode(data.code);

    if (codeHash !== otpRecord.code) {
      await this.authRepository.incrementOtpAttempts(otpRecord.id);
      const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
      throw new OtpError(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
        otpRecord.attempts + 1,
      );
    }

    // OTP is valid — mark verified and resolve user
    await this.authRepository.markOtpVerified(otpRecord.id);

    const existingUser = await this.authRepository.findUserByPhone(data.phone);

    let user;
    if (existingUser && existingUser.phoneVerifiedAt) {
      // Case 1: already verified — reject (duplicate signup or race condition)
      throw new ConflictError('Phone number already registered');
    } else if (existingUser && !existingUser.phoneVerifiedAt) {
      // Case 2: exists but unverified (abandoned previous signup) — activate
      user = await this.authRepository.activateUser(existingUser.id);
    } else {
      // Case 3: new user — create (catch race condition on unique phone)
      try {
        user = await this.authRepository.createUser({
          phone: data.phone,
          type: data.type,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictError('Phone number already registered');
        }
        throw error;
      }
    }

    // Auto-login: generate tokens and create session
    const tokens = await this.tokenService.generateTokenPair(user.id, user.type, deviceInfo);

    this.logger.info({ userId: user.id, phone: data.phone }, 'User signed up and auto-logged in via OTP');

    return {
      user: {
        id: user.id,
        phone: user.phone,
        type: user.type,
        status: user.status,
        phoneVerifiedAt: user.phoneVerifiedAt!.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ============================================================
  // LOGIN — Step 1: Send OTP to existing user
  // ============================================================

  async login(data: LoginBodyType): Promise<{ message: string; expiresInSeconds: number }> {
    const user = await this.authRepository.findUserByPhone(data.phone);

    // Generic error to prevent account enumeration
    if (!user || !user.phoneVerifiedAt) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenError('Account suspended');
    }

    await this.authRepository.invalidatePendingOtps(data.phone, 'LOGIN');

    const otp = this.generateOtp();

    await this.authRepository.createOtp({
      phone: data.phone,
      code: otp.hash,
      purpose: 'LOGIN',
      expiresAt: otp.expiresAt,
    });

    const smsResult = await this.smsProvider.send({
      to: data.phone,
      message: `Wakaman: votre code de connexion est ${otp.code}. Valable ${OTP_EXPIRY_MINUTES} minutes.`,
    });

    if (!smsResult.success) {
      this.logger.error({ phone: data.phone, error: smsResult.error }, 'Failed to send login OTP SMS');
      throw new OtpError('Failed to send verification code. Please try again.');
    }

    return {
      message: 'Verification code sent',
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    };
  }

  // ============================================================
  // LOGIN — Step 2: Verify OTP & create session
  // ============================================================

  async verifyLoginOtp(data: VerifyLoginOtpBodyType, deviceInfo?: DeviceInfo) {
    const otpRecord = await this.authRepository.findLatestOtp(data.phone, 'LOGIN');

    if (!otpRecord) {
      throw new OtpError('No pending verification code found. Please request a new one.');
    }

    if (otpRecord.verified) {
      throw new OtpError('This code has already been used.');
    }

    if (otpRecord.expiresAt < new Date()) {
      throw new OtpError('Verification code has expired. Please request a new one.');
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      throw new OtpError('Too many failed attempts. Please request a new code.', otpRecord.attempts);
    }

    const codeHash = this.hashCode(data.code);

    if (codeHash !== otpRecord.code) {
      await this.authRepository.incrementOtpAttempts(otpRecord.id);
      const remaining = OTP_MAX_ATTEMPTS - otpRecord.attempts - 1;
      throw new OtpError(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
        otpRecord.attempts + 1,
      );
    }

    await this.authRepository.markOtpVerified(otpRecord.id);

    const user = await this.authRepository.findUserByPhone(data.phone);

    // Re-check: user must still exist, be verified, and not suspended/banned
    if (!user || !user.phoneVerifiedAt) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenError('Account suspended');
    }

    await this.authRepository.updateLastLogin(user.id, deviceInfo?.ipAddress);

    const tokens = await this.tokenService.generateTokenPair(user.id, user.type, deviceInfo);

    this.logger.info({ userId: user.id, phone: data.phone }, 'User logged in via OTP');

    return {
      user: {
        id: user.id,
        phone: user.phone,
        type: user.type,
        status: user.status,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        phoneVerifiedAt: user.phoneVerifiedAt.toISOString(),
        createdAt: user.createdAt.toISOString(),
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // ============================================================
  // OTP HELPERS
  // ============================================================

  private generateOtp() {
    const max = 10 ** OTP_LENGTH;
    const code = randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
    const hash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    return { code, hash, expiresAt };
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}

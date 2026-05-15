/**
 * Auth module — Domain types
 */

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 3;

export type OtpPurpose = 'SIGNUP' | 'LOGIN' | 'RESET_PASSWORD' | 'DELIVERY_CONFIRM';

export interface GeneratedOtp {
  code: string;
  hash: string;
  expiresAt: Date;
}

export interface OtpRecord {
  id: string;
  phone: string;
  code: string; // hashed
  purpose: string;
  attempts: number;
  verified: boolean;
  expiresAt: Date;
  createdAt: Date;
}

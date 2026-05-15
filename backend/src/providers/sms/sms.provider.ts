/**
 * SMS Provider — Interface
 *
 * Abstraction pour l'envoi de SMS. Permet de switcher entre
 * Twilio (prod), InTouch (fallback), et FakeSmsProvider (dev/test).
 */

export interface SendSmsParams {
  to: string;     // E.164 format: +237XXXXXXXXX
  message: string;
}

export interface SendSmsResult {
  success: boolean;
  externalId?: string; // Provider message ID for tracking
  error?: string;
}

export interface SmsProvider {
  send(params: SendSmsParams): Promise<SendSmsResult>;
}

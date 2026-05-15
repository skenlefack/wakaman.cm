/**
 * Twilio SMS Provider
 *
 * Uses Twilio REST API directly (no SDK) to keep dependencies light.
 * Falls back gracefully with error details for monitoring.
 */

import type { SmsProvider, SendSmsParams, SendSmsResult } from './sms.provider.js';
import type { Logger } from 'pino';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

export class TwilioProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;
  private readonly authHeader: string;

  constructor(private readonly logger: Logger) {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID ?? '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
    this.fromNumber = process.env.TWILIO_FROM_NUMBER ?? '';

    if (!this.accountSid || !this.authToken || !this.fromNumber) {
      this.logger.warn('Twilio credentials missing — SMS sending will fail');
    }

    this.authHeader = `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;
  }

  async send(params: SendSmsParams): Promise<SendSmsResult> {
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: params.to,
      From: this.fromNumber,
      Body: params.message,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: this.authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json() as Record<string, unknown>;

      if (!response.ok) {
        this.logger.error({ status: response.status, data }, 'Twilio SMS failed');
        return { success: false, error: (data.message as string) ?? 'Twilio API error' };
      }

      this.logger.info({ to: params.to, sid: data.sid }, 'SMS sent via Twilio');
      return { success: true, externalId: data.sid as string };
    } catch (error) {
      this.logger.error({ err: error, to: params.to }, 'Twilio request failed');
      return { success: false, error: 'Twilio request failed' };
    }
  }
}

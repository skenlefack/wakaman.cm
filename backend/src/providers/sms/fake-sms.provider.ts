/**
 * Fake SMS Provider — Dev & Tests
 *
 * Logs OTP to console instead of sending real SMS.
 * Stores sent messages in memory for test assertions.
 */

import type { SmsProvider, SendSmsParams, SendSmsResult } from './sms.provider.js';
import type { Logger } from 'pino';

export interface SentMessage {
  to: string;
  message: string;
  sentAt: Date;
}

export class FakeSmsProvider implements SmsProvider {
  public readonly sentMessages: SentMessage[] = [];

  constructor(private readonly logger: Logger) {}

  async send(params: SendSmsParams): Promise<SendSmsResult> {
    this.sentMessages.push({
      to: params.to,
      message: params.message,
      sentAt: new Date(),
    });

    this.logger.info(
      { to: params.to, message: params.message },
      '[FakeSMS] OTP sent (not a real SMS)',
    );

    return { success: true, externalId: `fake_${Date.now()}` };
  }

  getLastMessage(): SentMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}

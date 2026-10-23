import 'server-only';
import { randomInt } from 'node:crypto';

/**
 * SMS OTP is a future hook (phone verification / password reset). This file only defines the shape
 * and a no-op development provider. It is intentionally NOT wired into any UI or action yet.
 */
export interface OtpProvider {
  /** Deliver `code` to an E.164 phone number. Must not throw for unknown numbers. */
  send(phone: string, code: string, locale: string): Promise<void>;
}

export const OTP_LENGTH = 6;
export const OTP_TTL_SECONDS = 5 * 60;

/** Cryptographically random numeric code, zero-padded (e.g. `004217`). */
export function generateOtpCode(length: number = OTP_LENGTH): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}

/** Development provider: sends nothing; logs the code to the server console outside production. */
export class NoopOtpProvider implements OtpProvider {
  async send(phone: string, code: string): Promise<void> {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[otp:noop] would send ${code} to ${phone}`);
    }
  }
}

export const otpProvider: OtpProvider = new NoopOtpProvider();

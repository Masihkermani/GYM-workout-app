import type { CoachErrorCode } from '../schemas';

/**
 * /app/me is the CLIENT's page, but its forms share the coach action codes. `coach.errors.*` is
 * worded for the coach («شما»); the codes the profile actions can return have a client-voice twin in
 * `coach.profile.errors.*` («تو»). Anything else falls back to the shared wording.
 */
export const PROFILE_ERROR_CODES = [
  'required',
  'nameShort',
  'nameLong',
  'textLong',
  'passwordShort',
  'passwordLong',
  'passwordWeak',
  'passwordWrong',
  'passwordSame',
  'passwordMismatch',
  'rateLimited',
  'generic',
] as const satisfies readonly CoachErrorCode[];

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

export const isProfileError = (code: CoachErrorCode): code is ProfileErrorCode =>
  (PROFILE_ERROR_CODES as readonly string[]).includes(code);

import 'server-only';
import { headers } from 'next/headers';
import { clientIpFrom } from './client-ip';

/** `TRUST_PROXY=1`: the app is only reachable through a reverse proxy that sets X-Forwarded-For (README, Caddy). */
export const trustProxy = (): boolean => process.env.TRUST_PROXY === '1';

/** The caller's rate-limit address (see client-ip.ts). Server Actions and server components only. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return clientIpFrom((name) => h.get(name), trustProxy());
}

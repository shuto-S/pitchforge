import { verifyPassword } from "@/lib/server/auth/password-hash";
import { AsyncBulkhead } from "@/lib/server/utils/async-bulkhead";

export { AsyncBulkhead } from "@/lib/server/utils/async-bulkhead";

export const PASSWORD_VERIFICATION_CONCURRENCY = 2;

const passwordVerificationBulkhead = new AsyncBulkhead(
  PASSWORD_VERIFICATION_CONCURRENCY
);

export function verifyPasswordWithBulkhead(
  password: string,
  encoded: string
): Promise<boolean> {
  return passwordVerificationBulkhead.run(() => verifyPassword(password, encoded));
}

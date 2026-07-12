import { describe, expect, it } from "vitest";
import {
  DUMMY_PASSWORD_HASH,
  PASSWORD_HASH_VERSION,
  hashPassword,
  verifyPassword
} from "@/lib/server/auth/password-hash";

describe("password hashing", () => {
  it("creates a randomized versioned scrypt hash and verifies only the matching password", async () => {
    const password = "correct horse battery staple";
    const [first, second] = await Promise.all([
      hashPassword(password),
      hashPassword(password)
    ]);

    expect(first).toMatch(new RegExp(`^${PASSWORD_HASH_VERSION}\\$`));
    expect(second).not.toBe(first);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it("rejects unsupported or malformed hashes without throwing", async () => {
    await expect(verifyPassword("password", "scrypt-v0$1$1$1$bad$bad")).resolves.toBe(false);
    await expect(verifyPassword("password", "not-a-password-hash")).resolves.toBe(false);
    await expect(verifyPassword("password", DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});

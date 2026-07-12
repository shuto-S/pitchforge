import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const PASSWORD_HASH_VERSION = "scrypt-v1";

const scryptParameters = {
  cost: 32_768,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltLength: 16,
  maxMemory: 64 * 1024 * 1024
} as const;

export const DUMMY_PASSWORD_HASH = [
  PASSWORD_HASH_VERSION,
  scryptParameters.cost,
  scryptParameters.blockSize,
  scryptParameters.parallelization,
  Buffer.alloc(scryptParameters.saltLength).toString("base64url"),
  Buffer.alloc(scryptParameters.keyLength).toString("base64url")
].join("$");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(scryptParameters.saltLength);
  const derivedKey = await deriveKey(password, salt);
  return [
    PASSWORD_HASH_VERSION,
    scryptParameters.cost,
    scryptParameters.blockSize,
    scryptParameters.parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url")
  ].join("$");
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) {
    return false;
  }

  const candidate = await deriveKey(password, parsed.salt);
  return timingSafeEqual(candidate, parsed.derivedKey);
}

function parsePasswordHash(
  value: string
): { salt: Buffer; derivedKey: Buffer } | null {
  const [version, cost, blockSize, parallelization, encodedSalt, encodedKey, ...rest] =
    value.split("$");
  if (
    rest.length > 0 ||
    version !== PASSWORD_HASH_VERSION ||
    cost !== String(scryptParameters.cost) ||
    blockSize !== String(scryptParameters.blockSize) ||
    parallelization !== String(scryptParameters.parallelization) ||
    !encodedSalt ||
    !encodedKey
  ) {
    return null;
  }

  const salt = decodeBase64Url(encodedSalt);
  const derivedKey = decodeBase64Url(encodedKey);
  if (
    !salt ||
    !derivedKey ||
    salt.length !== scryptParameters.saltLength ||
    derivedKey.length !== scryptParameters.keyLength
  ) {
    return null;
  }
  return { salt, derivedKey };
}

function decodeBase64Url(value: string): Buffer | null {
  try {
    const decoded = Buffer.from(value, "base64url");
    return decoded.toString("base64url") === value ? decoded : null;
  } catch {
    return null;
  }
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      scryptParameters.keyLength,
      {
        N: scryptParameters.cost,
        r: scryptParameters.blockSize,
        p: scryptParameters.parallelization,
        maxmem: scryptParameters.maxMemory
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

import { z } from "zod";
import { preRegisterPasswordAuthUser } from "@/lib/server/auth";
import { PostgresPitchForgeRepository } from "@/lib/server/db/postgres-db";
import { safeErrorMessage } from "@/lib/server/security";

const inputSchema = z.object({
  uid: z.string().min(1).max(128),
  loginId: z.string().trim().min(1).max(128),
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(128)
});

async function main() {
  if (process.stdin.isTTY) {
    throw new Error("Password must be piped through standard input");
  }

  const [uid, loginId, email, displayName] = process.argv.slice(2);
  const input = inputSchema.parse({ uid, loginId, email, displayName });
  const password = (await readPasswordFromStdin()).replace(/\r?\n$/, "");
  if (password.length < 20 || Buffer.byteLength(password, "utf8") > 256) {
    throw new Error("Password does not meet the provisioning policy");
  }

  const repo = new PostgresPitchForgeRepository();
  try {
    await repo.migrate();
    if (await repo.findPasswordAuthUser(input.loginId)) {
      throw new Error("Password account already exists");
    }
    await preRegisterPasswordAuthUser(
      {
        ...input,
        password,
        isAdmin: false,
        isActive: true
      },
      repo
    );
    process.stdout.write("Password account provisioned.\n");
  } finally {
    await repo.close();
  }
}

async function readPasswordFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > 258) {
      throw new Error("Password does not meet the provisioning policy");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

main().catch((error) => {
  process.stderr.write(`Password account provisioning failed: ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});

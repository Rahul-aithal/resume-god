import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const HKDF_INFO = "resume-god:user-api-keys:v1";

function deriveKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "", HKDF_INFO, 32));
}

/**
 * AES-256-GCM. `context` (owner + provider) is authenticated but not stored
 * in the blob, so a ciphertext copied to another user's row fails to decrypt.
 */
export function encryptApiKey(
  plaintext: string,
  secret: string,
  context: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), body]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

/** Null when the blob can't be read (rotated secret, tampering, bad format). */
export function decryptApiKey(
  stored: string,
  secret: string,
  context: string,
): string | null {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || body === undefined) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

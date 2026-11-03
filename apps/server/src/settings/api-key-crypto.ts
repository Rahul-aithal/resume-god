import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import {
  API_KEY_CIPHER,
  API_KEY_DERIVED_KEY_BYTES,
  API_KEY_FORMAT_VERSION,
  API_KEY_HKDF_DIGEST,
  API_KEY_HKDF_INFO,
  API_KEY_IV_BYTES,
} from "./constants/settings.constants";

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      API_KEY_HKDF_DIGEST,
      secret,
      "",
      API_KEY_HKDF_INFO,
      API_KEY_DERIVED_KEY_BYTES,
    ),
  );
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
  const iv = randomBytes(API_KEY_IV_BYTES);
  const cipher = createCipheriv(API_KEY_CIPHER, deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [API_KEY_FORMAT_VERSION, iv, cipher.getAuthTag(), body]
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
  if (version !== API_KEY_FORMAT_VERSION || !iv || !tag || body === undefined)
    return null;
  try {
    const decipher = createDecipheriv(
      API_KEY_CIPHER,
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

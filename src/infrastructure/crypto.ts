import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
export function newToken(): string {
  return randomBytes(32).toString("hex");
}
function keyBuffer(key: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Invalid encryption key");
  return Buffer.from(key, "hex");
}
export function encryptSecret(
  plaintext: string,
  key: string,
  context: string,
): string {
  if (!context) throw new Error("Encryption context required");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(key), nonce);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    nonce.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptSecret(
  envelope: string,
  key: string,
  context: string,
): string {
  const [version, iv, tag, data, extra] = envelope.split(".");
  if (
    !context ||
    version !== "v1" ||
    extra !== undefined ||
    !iv ||
    !tag ||
    data === undefined
  )
    throw new Error("Invalid encrypted secret");
  const nonce = Buffer.from(iv, "base64url"),
    authTag = Buffer.from(tag, "base64url");
  if (nonce.length !== 12 || authTag.length !== 16)
    throw new Error("Invalid encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(key), nonce);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

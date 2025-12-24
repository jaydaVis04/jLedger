import crypto from "crypto";

export function generateRefreshToken(): string {
  const bytes = crypto.randomBytes(32);
  return bytes.toString("base64url");
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

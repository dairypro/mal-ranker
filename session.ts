import crypto from "crypto";

export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex"); // raw token stored in cookie
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex"); // stored in DB
}

import crypto from "node:crypto";

export function hmacSha256HexNode(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}


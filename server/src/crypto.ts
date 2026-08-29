/**
 * All randomness and hashing for the dice game. Node `crypto` only — no external deps.
 *
 * Commit-reveal scheme (industry standard):
 *   server_seed   = 64-char hex string (32 random bytes)
 *   commitment    = sha256(utf8(server_seed))          ← stored on-chain BEFORE play
 *   roll          = HMAC_SHA256(key = utf8(server_seed), msg = `${client_seed}:${nonce}`)
 *                   → first 4 bytes → uint32 BE → (u32 % 10000) / 100   (0.00 … 99.99)
 * The exact same functions run in the browser (WebCrypto) and in the watchdog, so every roll
 * can be re-derived by anyone once the seed is revealed.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

export function sha256(data: Buffer | string): Buffer {
  return createHash("sha256").update(data).digest();
}

export function sha256Hex(data: Buffer | string): string {
  return sha256(data).toString("hex");
}

export function newServerSeed(): string {
  return randomBytes(32).toString("hex");
}

/** The bytes that get hashed on-chain and used as the HMAC key: the hex STRING's UTF-8 bytes. */
export function seedBytes(serverSeedHex: string): Buffer {
  return Buffer.from(serverSeedHex, "utf8");
}

export function commitmentHex(serverSeedHex: string): string {
  return sha256Hex(seedBytes(serverSeedHex));
}

export function rollFor(serverSeedHex: string, clientSeed: string, nonce: number): number {
  const mac = createHmac("sha256", seedBytes(serverSeedHex)).update(`${clientSeed}:${nonce}`).digest();
  const u32 = mac.readUInt32BE(0);
  return (u32 % 10000) / 100;
}

/** Canonical JSON: keys sorted recursively, no whitespace. The Merkle leaf is sha256 of this. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

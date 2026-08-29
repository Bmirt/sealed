/** Browser re-derivation with WebCrypto — mirrors server/src/crypto.ts and merkle.ts exactly. */
import type { ProofStep, RoundRecord } from "./types";

const enc = new TextEncoder();
export const toHex = (u: ArrayBuffer | Uint8Array): string => Array.from(new Uint8Array(u), (b) => b.toString(16).padStart(2, "0")).join("");
export const fromHex = (h: string): Uint8Array => new Uint8Array((h.match(/.{2}/g) ?? []).map((x) => parseInt(x, 16)));

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  return toHex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function rollFor(seedHex: string, clientSeed: string, nonce: number): Promise<number> {
  const key = await crypto.subtle.importKey("raw", enc.encode(seedHex), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${clientSeed}:${nonce}`)));
  const u32 = ((mac[0]! << 24) >>> 0) + (mac[1]! << 16) + (mac[2]! << 8) + mac[3]!;
  return (u32 % 10000) / 100;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const leafHex = (r: RoundRecord): Promise<string> => sha256Hex(canonicalJson(r));

async function parentHex(a: string, b: string): Promise<string> {
  const buf = new Uint8Array(64);
  buf.set(fromHex(a), 0);
  buf.set(fromHex(b), 32);
  return sha256Hex(buf);
}

export async function merkleRootHex(leaves: string[]): Promise<string> {
  if (leaves.length === 0) return "0".repeat(64);
  let level = leaves;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) next.push(await parentHex(level[i]!, level[i + 1] ?? level[i]!));
    level = next;
  }
  return level[0]!;
}

export async function verifyProofHex(leaf: string, proof: ProofStep[], root: string): Promise<boolean> {
  let h = leaf;
  for (const s of proof) h = s.side === "right" ? await parentHex(h, s.hash) : await parentHex(s.hash, h);
  return h === root;
}

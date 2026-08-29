/**
 * Standard pairwise SHA-256 Merkle tree. Leaf = sha256(canonical JSON of the round record).
 * Odd levels duplicate the last node. Empty set → 32 zero bytes.
 */
import { canonicalJson, sha256 } from "./crypto.js";

export interface ProofStep {
  /** Sibling hash (hex). */
  hash: string;
  /** Which side the sibling sits on. */
  side: "left" | "right";
}

export const ZERO_ROOT = Buffer.alloc(32, 0);

export function leafHash(record: unknown): Buffer {
  return sha256(canonicalJson(record));
}

function parent(a: Buffer, b: Buffer): Buffer {
  return sha256(Buffer.concat([a, b]));
}

function levels(leaves: readonly Buffer[]): Buffer[][] {
  if (leaves.length === 0) return [[]];
  const out: Buffer[][] = [[...leaves]];
  while ((out[out.length - 1] as Buffer[]).length > 1) {
    const cur = out[out.length - 1] as Buffer[];
    const next: Buffer[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i] as Buffer;
      const right = (cur[i + 1] ?? cur[i]) as Buffer; // duplicate last when odd
      next.push(parent(left, right));
    }
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: readonly Buffer[]): Buffer {
  if (leaves.length === 0) return ZERO_ROOT;
  const lv = levels(leaves);
  return (lv[lv.length - 1] as Buffer[])[0] as Buffer;
}

export function merkleProof(leaves: readonly Buffer[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new RangeError(`leaf index ${index} out of range`);
  const lv = levels(leaves);
  const proof: ProofStep[] = [];
  let i = index;
  for (let depth = 0; depth < lv.length - 1; depth++) {
    const level = lv[depth] as Buffer[];
    const siblingIndex = i % 2 === 0 ? i + 1 : i - 1;
    const sibling = (level[siblingIndex] ?? level[i]) as Buffer;
    proof.push({ hash: sibling.toString("hex"), side: i % 2 === 0 ? "right" : "left" });
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf: Buffer, proof: readonly ProofStep[], root: Buffer): boolean {
  let h = leaf;
  for (const step of proof) {
    const s = Buffer.from(step.hash, "hex");
    h = step.side === "right" ? parent(h, s) : parent(s, h);
  }
  return h.equals(root);
}

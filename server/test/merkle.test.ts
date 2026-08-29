import { describe, expect, it } from "vitest";
import { sha256 } from "../src/crypto.js";
import { ZERO_ROOT, leafHash, merkleProof, merkleRoot, verifyProof } from "../src/merkle.js";

const L = (s: string): Buffer => sha256(s);

describe("merkle", () => {
  it("empty → zero root; single leaf → the leaf", () => {
    expect(merkleRoot([]).equals(ZERO_ROOT)).toBe(true);
    expect(merkleRoot([L("a")]).equals(L("a"))).toBe(true);
  });
  it("two leaves → sha256(a||b)", () => {
    expect(merkleRoot([L("a"), L("b")]).equals(sha256(Buffer.concat([L("a"), L("b")])))).toBe(true);
  });
  it("odd count duplicates the last leaf", () => {
    const ab = sha256(Buffer.concat([L("a"), L("b")]));
    const cc = sha256(Buffer.concat([L("c"), L("c")]));
    expect(merkleRoot([L("a"), L("b"), L("c")]).equals(sha256(Buffer.concat([ab, cc])))).toBe(true);
  });
  it("proofs verify for every index and fail on tampering", () => {
    const leaves = [1, 2, 3, 4, 5, 6, 7].map((n) => leafHash({ round_index: n, roll: n * 1.5 }));
    const root = merkleRoot(leaves);
    leaves.forEach((leaf, i) => {
      expect(verifyProof(leaf, merkleProof(leaves, i), root)).toBe(true);
    });
    const tampered = leafHash({ round_index: 3, roll: 4.51 });
    expect(verifyProof(tampered, merkleProof(leaves, 2), root)).toBe(false);
  });
  it("leaf hash is canonical (key order does not matter)", () => {
    expect(leafHash({ a: 1, b: 2 }).equals(leafHash({ b: 2, a: 1 }))).toBe(true);
  });
});

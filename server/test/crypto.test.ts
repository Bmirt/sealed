import { describe, expect, it } from "vitest";
import { canonicalJson, commitmentHex, rollFor, sha256Hex } from "../src/crypto.js";

describe("crypto", () => {
  it("sha256 matches the known vector", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("commitment hashes the hex string's UTF-8 bytes", () => {
    const seed = "a".repeat(64);
    expect(commitmentHex(seed)).toBe(sha256Hex(Buffer.from(seed, "utf8")));
  });
  it("rolls are deterministic, in range, and change with nonce/client seed (pinned vector)", () => {
    const seed = "0123456789abcdef".repeat(4);
    const r0 = rollFor(seed, "client", 0);
    expect(r0).toBe(rollFor(seed, "client", 0));
    expect(r0).toBeGreaterThanOrEqual(0);
    expect(r0).toBeLessThan(100);
    expect(rollFor(seed, "client", 1)).not.toBe(r0);
    expect(rollFor(seed, "other", 0)).not.toBe(r0);
    // Pinned so any change to the derivation is caught.
    expect(rollFor("a".repeat(64), "alice", 7)).toBe(63.36);
  });
  it("canonical JSON sorts keys recursively without whitespace", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: "x" } })).toBe('{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  });
});

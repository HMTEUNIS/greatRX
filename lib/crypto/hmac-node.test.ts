import { describe, it, expect } from "vitest";
import { hmacSha256HexNode } from "./hmac-node";

describe("hmacSha256HexNode", () => {
  it("matches known test vector", () => {
    // Test vector: HMAC-SHA256(key="key", msg="The quick brown fox jumps over the lazy dog")
    // Expected computed hex (standard reference).
    const key = "key";
    const msg = "The quick brown fox jumps over the lazy dog";
    const got = hmacSha256HexNode(key, msg);
    expect(got).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });
});


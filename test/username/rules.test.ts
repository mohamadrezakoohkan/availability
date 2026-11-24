import { describe, expect, it } from "vitest";
import { type InvalidReason, validateUsername } from "../../src/username/rules";

const LIMITS = { min: 3, max: 30 };

describe("validateUsername", () => {
  it.each([
    ["alice", "alice"],
    ["Alice", "alice"],
    ["ALICE-99", "alice-99"],
    ["a1b", "a1b"],
    ["a-b", "a-b"],
    ["123", "123"],
    ["a".repeat(30), "a".repeat(30)],
    ["a-b-c-d", "a-b-c-d"],
  ])("accepts %s as %s", (input, expected) => {
    expect(validateUsername(input, LIMITS)).toEqual({ ok: true, username: expected });
  });

  const rejected: [string, string, InvalidReason][] = [
    ["too short", "ab", "too_short"],
    ["too long", "a".repeat(31), "too_long"],
    ["a space", "al ice", "characters"],
    ["an underscore", "al_ice", "characters"],
    ["a dot", "alice.b", "characters"],
    ["an at sign", "@alice", "characters"],
    ["a slash", "al/ice", "characters"],
    ["empty", "", "characters"],
    ["an accented letter", "alicé", "characters"],
    ["a Cyrillic look-alike of a", "аlice", "characters"],
    ["the Kelvin sign, which lowercases to k", "Kevin", "characters"],
    ["a fullwidth letter", "ａlice", "characters"],
    ["a newline", "alice\n", "characters"],
    ["a leading hyphen", "-alice", "shape"],
    ["a trailing hyphen", "alice-", "shape"],
    ["a double hyphen", "al--ice", "shape"],
  ];
  it.each(rejected)("rejects %s", (_name, input, reason) => {
    expect(validateUsername(input, LIMITS)).toEqual({ ok: false, reason });
  });

  it("applies the limits it is given", () => {
    expect(validateUsername("abcd", { min: 5, max: 10 })).toEqual({
      ok: false,
      reason: "too_short",
    });
    expect(validateUsername("abcdefghijk", { min: 5, max: 10 })).toEqual({
      ok: false,
      reason: "too_long",
    });
    expect(validateUsername("abcde", { min: 5, max: 10 })).toEqual({ ok: true, username: "abcde" });
  });
});

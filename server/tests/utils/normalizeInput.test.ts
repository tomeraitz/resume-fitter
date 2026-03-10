import { describe, it, expect } from "vitest";
import { normalizeInput } from "../../src/utils/normalizeInput.js";

describe("normalizeInput", () => {
  it("should strip zero-width characters", () => {
    // U+200B  zero-width space
    // U+200C  zero-width non-joiner
    // U+200D  zero-width joiner
    // U+FEFF  BOM / zero-width no-break space
    // U+00AD  soft hyphen
    const input = "ig\u200Bn\u200Co\u200Dr\uFEFFe\u00AD";
    expect(normalizeInput(input)).toBe("ignore");
  });

  it("should normalize NFKC (full-width to ASCII, ligatures)", () => {
    // Full-width letters: ｉｇｎｏｒｅ → ignore
    expect(normalizeInput("\uFF49\uFF47\uFF4E\uFF4F\uFF52\uFF45")).toBe("ignore");
    // Ligature: ﬁ → fi
    expect(normalizeInput("\uFB01nd")).toBe("find");
  });

  it("should map Cyrillic homoglyphs to Latin equivalents", () => {
    // Cyrillic а→a, е→e, о→o, р→p, с→c
    expect(normalizeInput("\u0430\u0435\u043E\u0440\u0441")).toBe("aeopc");
    // Uppercase: А→A, Е→E, О→O, Р→P, С→C
    expect(normalizeInput("\u0410\u0415\u041E\u0420\u0421")).toBe("AEOPC");
    // х→x, у→y, к→k
    expect(normalizeInput("\u0445\u0443\u043A")).toBe("xyk");
  });

  it("should map Greek homoglyphs to Latin equivalents", () => {
    // Greek ο→o, α→a, Ο→O, Α→A
    expect(normalizeInput("\u03BF\u03B1")).toBe("oa");
    expect(normalizeInput("\u039F\u0391")).toBe("OA");
  });

  it("should strip BiDi override characters", () => {
    // U+202A–U+202E
    const bidiOverrides = "\u202Ahello\u202E";
    expect(normalizeInput(bidiOverrides)).toBe("hello");
    // U+2066–U+2069
    const bidiIsolates = "\u2066world\u2069";
    expect(normalizeInput(bidiIsolates)).toBe("world");
  });

  it("should collapse multiple whitespace to single space", () => {
    expect(normalizeInput("hello   world")).toBe("hello world");
    expect(normalizeInput("  leading and trailing  ")).toBe("leading and trailing");
    expect(normalizeInput("tab\there")).toBe("tab here");
    expect(normalizeInput("new\nline")).toBe("new line");
  });

  it("should handle empty string", () => {
    expect(normalizeInput("")).toBe("");
  });

  it("should handle string with only zero-width characters", () => {
    expect(normalizeInput("\u200B\u200C\u200D\uFEFF\u00AD")).toBe("");
  });

  it("should preserve legitimate Unicode (Hebrew, Arabic, Chinese text)", () => {
    expect(normalizeInput("שלום עולם")).toBe("שלום עולם");
    expect(normalizeInput("مرحبا بالعالم")).toBe("مرحبا بالعالم");
    expect(normalizeInput("你好世界")).toBe("你好世界");
  });

  it("should apply all layers together", () => {
    // Combine zero-width + Cyrillic homoglyphs + extra whitespace
    const input = "\u200Bign\u043Ere  \u0430ll";
    expect(normalizeInput(input)).toBe("ignore all");
  });
});

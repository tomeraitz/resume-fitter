/**
 * Normalizes user input to neutralize Unicode-based prompt injection tricks.
 *
 * Layers:
 *  1. Strip zero-width / invisible characters
 *  2. NFKC normalization (collapses full-width, ligatures)
 *  3. Homoglyph-to-ASCII mapping (Cyrillic/Greek lookalikes NFKC misses)
 *  4. Strip BiDi override characters
 *  5. Collapse whitespace & trim
 */

// ── Zero-width / invisible characters ────────────────────────────────────────
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF\u00AD]/g;

// ── BiDi override characters (U+202A–U+202E, U+2066–U+2069) ─────────────────
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g;

// ── Homoglyph map: Cyrillic / Greek → ASCII ──────────────────────────────────
// Only the most common Latin lookalikes that NFKC does NOT resolve.
const HOMOGLYPH_MAP: Record<string, string> = {
  // Cyrillic
  "\u0410": "A", // А
  "\u0430": "a", // а
  "\u0412": "B", // В
  "\u0435": "e", // е
  "\u0415": "E", // Е
  "\u043E": "o", // о
  "\u041E": "O", // О
  "\u0440": "p", // р
  "\u0420": "P", // Р
  "\u0441": "c", // с
  "\u0421": "C", // С
  "\u0445": "x", // х
  "\u0425": "X", // Х
  "\u0443": "y", // у
  "\u041C": "M", // М
  "\u0422": "T", // Т
  "\u041D": "H", // Н
  "\u043A": "k", // к
  "\u0456": "i", // і (Ukrainian)
  "\u0406": "I", // І
  "\u0455": "s", // ѕ (Macedonian)
  "\u0405": "S", // Ѕ
  "\u0458": "j", // ј
  "\u0408": "J", // Ј
  // Greek
  "\u03BF": "o", // ο
  "\u039F": "O", // Ο
  "\u03B1": "a", // α (visually close)
  "\u0391": "A", // Α
};

const HOMOGLYPH_RE = new RegExp(
  `[${Object.keys(HOMOGLYPH_MAP).join("")}]`,
  "g",
);

// ── Repeated whitespace ──────────────────────────────────────────────────────
const WHITESPACE_RE = /\s+/g;

export function normalizeInput(text: string): string {
  let result = text;

  // 1. Strip zero-width / invisible characters
  result = result.replace(ZERO_WIDTH_RE, "");

  // 2. NFKC normalization
  result = result.normalize("NFKC");

  // 3. Homoglyph → ASCII
  result = result.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPH_MAP[ch] ?? ch);

  // 4. Strip BiDi overrides
  result = result.replace(BIDI_RE, "");

  // 5. Collapse whitespace & trim
  result = result.replace(WHITESPACE_RE, " ").trim();

  return result;
}

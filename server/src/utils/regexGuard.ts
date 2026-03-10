/**
 * Fast regex-based pre-filter for common prompt-injection patterns.
 * Runs on already-normalized text (see normalizeInput).
 */

export interface RegexGuardResult {
  blocked: boolean;
  pattern?: string;
}

// ── Blocked patterns (case-insensitive) ──────────────────────────────────────

const BLOCKED_PATTERNS: { re: RegExp; id: string }[] = [
  // Instructional injection
  { re: /ignore\s+(all\s+)?(previous\s+)?instructions/i, id: "INJ-001" },
  { re: /disregard\s+(all\s+)?(previous\s+)?(instructions|rules|guidelines)/i, id: "INJ-002" },
  { re: /override\s+(all\s+)?(previous\s+)?(instructions|rules)/i, id: "INJ-003" },
  { re: /new\s+instructions\s*:/i, id: "INJ-004" },
  { re: /forget\s+(all\s+)?(previous\s+)?(instructions|context)/i, id: "INJ-005" },

  // Jailbreak / role hijack
  { re: /you\s+are\s+now\s+(DAN|unrestricted|jailbroken|a\s+(different|new)\s+(ai|assistant|model|chatbot))/i, id: "JBK-001" },
  { re: /act\s+as\s+(a\s+|an\s+)?(new|different|unrestricted)\s+(ai|assistant|model|chatbot)/i, id: "JBK-002" },
  { re: /enter\s+(debug|developer|admin|god)\s+mode/i, id: "JBK-003" },
  { re: /pretend\s+(you\s+are|to\s+be)\s+(a\s+|an\s+)?(different|unrestricted|evil)/i, id: "JBK-004" },

  // System prompt extraction
  { re: /(show|reveal|output|print|display|repeat)\s+(your\s+|the\s+)?(system\s+)?(prompt|instructions|rules)/i, id: "SPE-001" },
  { re: /what\s+(are|were)\s+your\s+(system\s+)?(instructions|rules|prompt)/i, id: "SPE-002" },

  // Structural delimiters
  { re: /<\/system>/i, id: "DLM-001" },
  { re: /<\|im_start\|>/i, id: "DLM-002" },
  { re: /<\|im_end\|>/i, id: "DLM-003" },
  { re: /\[INST\]/i, id: "DLM-004" },
  { re: /\[\/INST\]/i, id: "DLM-005" },
  { re: /<<SYS>>/i, id: "DLM-006" },
  { re: /###\s*System:/i, id: "DLM-007" },
  { re: /###\s*Human:/i, id: "DLM-008" },
  { re: /###\s*Assistant:/i, id: "DLM-009" },
];

export function regexGuard(normalizedText: string): RegexGuardResult {
  for (const { re, id } of BLOCKED_PATTERNS) {
    if (re.test(normalizedText)) {
      return { blocked: true, pattern: id };
    }
  }
  return { blocked: false };
}

/**
 * Utilities for detecting and processing absolute-positioned PDF-converted HTML.
 *
 * PDF-to-HTML converters produce one <span> per visual line, each with
 * hardcoded `top` / `left` pixel positions and `white-space:pre`. When an LLM
 * rewrites the CV it merges spans causing layout overflow. Option B avoids
 * sending raw HTML to the LLM: extract plain text by section → LLM rewrites
 * text only → re-inject text back into the original span slots.
 */

// A4 page width in points as used by pdf2htmlEX / similar tools
const PAGE_WIDTH_PX = 594.96;

// Vertical gap (px) between spans that still counts as the same section
const SECTION_GAP_PX = 20;

// Monospace-approximation factor: average char width = fontSize * 0.55
const CHAR_WIDTH_FACTOR = 0.55;

// Left column: left < this value; right column: left >= this value
const COLUMN_SPLIT_PX = 370;

// Tolerance (px) for grouping spans on the same visual line
const INLINE_TOP_TOLERANCE_PX = 1;

// Contact info: spans with top below this value are always structural
const CONTACT_INFO_TOP_PX = 120;

// Section label keywords that are always structural
const STRUCTURAL_SECTION_LABELS = new Set([
  'about me',
  'experience',
  'education',
  'skills',
  'languages',
  'certification',
  'tools',
  'frontend',
  'back end',
  'ai/ml',
]);

// Date pattern: "2025 - current", "2020 – 2022", etc.
const DATE_PATTERN = /\d{4}\s*[-–]\s*(\d{4}|current)/i;

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpanInfo {
  /** Full original span HTML element as a string */
  element: string;
  /** Visible text content */
  text: string;
  /** Parsed `top` CSS value in px */
  top: number;
  /** Parsed `left` CSS value in px */
  left: number;
  /** Parsed `font-size` CSS value in px */
  fontSize: number;
  /** font-weight value (e.g. "bold", "700") */
  fontWeight: string;
  /** Estimated number of characters that fit on this line */
  charLimit: number;
  /**
   * If true this span is structural (header, date, contact, label).
   * Structural spans are never sent to the LLM and never overwritten.
   */
  isStructural: boolean;
  /**
   * Index of the inline group this span belongs to within its section.
   * Spans at the same top (±1px) in the same column share the same index.
   * The first span in the group receives the concatenated text; the rest get "".
   * -1 means the span is the sole span on its line (no inline group).
   */
  inlineGroup: number;
  /** True when this span is the first in its inline group (receives full text). */
  inlineGroupLeader: boolean;
}

export interface SpanGroup {
  /** e.g. "section-0", "section-1" */
  sectionLabel: string;
  spans: SpanInfo[];
}

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Returns true when the HTML uses absolute-positioned spans produced by a
 * PDF-to-HTML converter (each span has `position:absolute` and a `top:` value).
 */
export function isAbsolutePositionedHtml(html: string): boolean {
  return /position\s*:\s*absolute/i.test(html) && /\btop\s*:/i.test(html);
}

// ── Span parsing ─────────────────────────────────────────────────────────────

function parsePx(style: string, prop: string): number {
  const match = new RegExp(`\\b${prop}\\s*:\\s*([\\d.]+)\\s*px`, 'i').exec(style);
  return match ? parseFloat(match[1] ?? '0') : 0;
}

function parseFontWeight(style: string): string {
  const match = /font-weight\s*:\s*([^\s;]+)/i.exec(style);
  return match?.[1]?.toLowerCase() ?? 'normal';
}

function extractText(spanHtml: string): string {
  // Strip all inner tags, decode common HTML entities
  return spanHtml
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

// Colors that indicate structural/metadata spans (grey dates, teal company names, blue links)
const STRUCTURAL_COLORS = new Set([
  'rgb(85,85,85)',
  'rgb(85, 85, 85)',
  'rgb(20,184,166)',
  'rgb(20, 184, 166)',
  'rgb(0,0,238)',
  'rgb(0, 0, 238)',
]);

function parseColor(style: string): string {
  const match = /\bcolor\s*:\s*([^;]+)/i.exec(style);
  return match ? match[1]!.trim() : '';
}

/**
 * Returns true when a span is structural (must never be sent to the LLM).
 *
 * Only TWO types of content are rewritable:
 *  1. About Me paragraph — left column, top ~165–300px, font-size ≤11.5px, non-bold
 *  2. Experience bullet points — left column, indented (~58–59px left), non-bold
 *
 * Everything else is structural. This function determines if a span IS rewritable
 * (allowlist); if not, it is structural.
 */
function isStructuralSpan(span: {
  top: number;
  left: number;
  fontSize: number;
  fontWeight: string;
  text: string;
  style?: string;
}): boolean {
  // Right column (Education, Skills, Certification, Languages) — always structural
  if (span.left >= COLUMN_SPLIT_PX) return true;

  // Contact info area
  if (span.top < CONTACT_INFO_TOP_PX) return true;

  // Below the page
  if (span.top >= 820) return true;

  // Large font — section headers
  if (span.fontSize >= 14) return true;

  // Any bold weight (600/700/800/bold) — job titles, company names, education entries, skill labels
  const isBold =
    span.fontWeight === 'bold' ||
    span.fontWeight === 'bolder' ||
    (/^\d+$/.test(span.fontWeight) && parseInt(span.fontWeight, 10) >= 600);
  if (isBold) return true;

  // Structural colors: grey dates/metadata, teal company names, blue links
  if (span.style) {
    const color = parseColor(span.style);
    // Normalise spaces so "rgb(85, 85, 85)" and "rgb(85,85,85)" both match
    const colorNorm = color.replace(/\s+/g, '');
    if (
      STRUCTURAL_COLORS.has(color) ||
      STRUCTURAL_COLORS.has(colorNorm) ||
      colorNorm === 'rgb(85,85,85)' ||
      colorNorm === 'rgb(20,184,166)' ||
      colorNorm === 'rgb(0,0,238)'
    ) {
      return true;
    }
  }

  // Date patterns
  if (DATE_PATTERN.test(span.text)) return true;

  // Known section label keywords
  const lower = span.text.toLowerCase().trim();
  if (STRUCTURAL_SECTION_LABELS.has(lower)) return true;

  // Explicit allowlist: must be left column, body text size, non-bold, in content range
  // (top > 160 and font-size <= 11.5 covers About Me + bullet points)
  const isRewritable =
    span.left < COLUMN_SPLIT_PX &&
    span.fontSize <= 11.5 &&
    span.top > 160;

  return !isRewritable;
}

/** Parse all <span> elements from the HTML, preserving order. */
function parseAllSpans(html: string): Omit<SpanInfo, 'inlineGroup' | 'inlineGroupLeader'>[] {
  const spanRegex = /<span([^>]*)>([\s\S]*?)<\/span>/gi;
  const spans: Omit<SpanInfo, 'inlineGroup' | 'inlineGroupLeader'>[] = [];
  let match: RegExpExecArray | null;

  while ((match = spanRegex.exec(html)) !== null) {
    const fullElement = match[0] ?? '';
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';

    const styleMatch = /style\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const style = styleMatch?.[1] ?? '';

    const top = parsePx(style, 'top');
    const left = parsePx(style, 'left');
    const fontSize = parsePx(style, 'font-size') || 12;
    const fontWeight = parseFontWeight(style);
    const charLimit = Math.max(1, Math.floor((PAGE_WIDTH_PX - left) / (fontSize * CHAR_WIDTH_FACTOR)));
    const text = extractText(inner);
    const isStructural = isStructuralSpan({ top, left, fontSize, fontWeight, text, style });

    spans.push({ element: fullElement, text, top, left, fontSize, fontWeight, charLimit, isStructural });
  }

  return spans;
}

// ── Grouping ─────────────────────────────────────────────────────────────────

/**
 * Groups spans by column and vertical proximity.
 *
 * Algorithm:
 * 1. Split all spans into left-column (left < 370) and right-column (left >= 370).
 * 2. Within each column, group by top proximity (SECTION_GAP_PX threshold).
 * 3. Within each group, identify inline spans (same top ±1px) and assign
 *    a shared inlineGroup index. The first span in the inline group is the
 *    leader (receives the concatenated text on re-injection).
 * 4. Mark structural spans so they are excluded from LLM rewriting.
 */
export function extractSpanGroups(html: string): SpanGroup[] {
  const rawSpans = parseAllSpans(html);
  if (rawSpans.length === 0) return [];

  // Step 1: split into columns
  const leftCol = rawSpans.filter((s) => s.left < COLUMN_SPLIT_PX);
  const rightCol = rawSpans.filter((s) => s.left >= COLUMN_SPLIT_PX);

  const allGroups: SpanGroup[] = [];
  let sectionIndex = 0;

  for (const columnSpans of [leftCol, rightCol]) {
    if (columnSpans.length === 0) continue;

    // Step 2: group by vertical proximity within this column
    const columnGroups: Array<Omit<SpanInfo, 'inlineGroup' | 'inlineGroupLeader'>[]> = [];
    let currentGroup: Omit<SpanInfo, 'inlineGroup' | 'inlineGroupLeader'>[] = [];
    let prevTop = columnSpans[0]!.top;

    for (const span of columnSpans) {
      if (currentGroup.length > 0 && span.top - prevTop > SECTION_GAP_PX) {
        columnGroups.push(currentGroup);
        currentGroup = [];
      }
      currentGroup.push(span);
      prevTop = span.top;
    }
    if (currentGroup.length > 0) columnGroups.push(currentGroup);

    // Step 3: assign inlineGroup within each vertical group
    for (const group of columnGroups) {
      let inlineGroupCounter = 0;
      // Map from rounded top → { groupIndex, leaderAssigned }
      const topToInlineGroup = new Map<number, { groupIndex: number; leaderAssigned: boolean }>();

      const enriched: SpanInfo[] = group.map((span) => {
        // Round top to nearest integer for tolerance comparison
        // Find an existing inline group within ±1px
        let matchedKey: number | undefined;
        for (const [key] of topToInlineGroup) {
          if (Math.abs(span.top - key) <= INLINE_TOP_TOLERANCE_PX) {
            matchedKey = key;
            break;
          }
        }

        let inlineGroup: number;
        let inlineGroupLeader: boolean;

        if (matchedKey !== undefined) {
          // Join existing inline group as a follower
          const entry = topToInlineGroup.get(matchedKey)!;
          inlineGroup = entry.groupIndex;
          inlineGroupLeader = false;
        } else {
          // New inline group — this span is the leader
          inlineGroup = inlineGroupCounter++;
          topToInlineGroup.set(span.top, { groupIndex: inlineGroup, leaderAssigned: true });
          inlineGroupLeader = true;
        }

        return { ...span, inlineGroup, inlineGroupLeader };
      });

      allGroups.push({ sectionLabel: `section-${sectionIndex}`, spans: enriched });
      sectionIndex++;
    }
  }

  return allGroups;
}

// ── Word-wrap ─────────────────────────────────────────────────────────────────

/**
 * Wraps `text` into lines where each line's character count does not exceed
 * the charLimit of the corresponding span at that index. If there are more
 * spans than lines the remaining spans get an empty string. If there are more
 * lines than spans, trailing lines are silently truncated.
 */
function wrapTextIntoSpans(text: string, spans: SpanInfo[]): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let wordIndex = 0;

  for (let i = 0; i < spans.length; i++) {
    const limit = spans[i]!.charLimit;

    if (wordIndex >= words.length) {
      lines.push('');
      continue;
    }

    let line = '';
    while (wordIndex < words.length) {
      const word = words[wordIndex]!;
      const candidate = line.length === 0 ? word : `${line} ${word}`;
      if (candidate.length > limit && line.length > 0) break;
      line = candidate;
      wordIndex++;
    }
    lines.push(line);
  }

  return lines;
}

// ── Re-injection ──────────────────────────────────────────────────────────────

/**
 * Replaces the text content of each span in `originalHtml` with word-wrapped
 * lines from `rewrittenSections`. Only text nodes are changed — all CSS,
 * attributes, and structure are preserved exactly.
 *
 * Rules:
 * - Structural spans are never touched (their original text is preserved as-is).
 * - Inline group followers (inlineGroupLeader=false) are set to "" — the leader
 *   span receives the full concatenated line text.
 * - For each section, non-structural leader spans are collected in order and
 *   the rewritten text is word-wrapped across them.
 *
 * @param originalHtml       Full original HTML document
 * @param groups             Output of extractSpanGroups(originalHtml)
 * @param rewrittenSections  Map of sectionLabel → rewritten plain text
 */
export function reinjectText(
  originalHtml: string,
  groups: SpanGroup[],
  rewrittenSections: Record<string, string>,
): string {
  // Build a flat ordered list of (originalElement → replacementText)
  const replacements: Array<{ original: string; newText: string }> = [];

  for (const group of groups) {
    const rewritten = rewrittenSections[group.sectionLabel];

    if (rewritten === undefined) {
      // No rewrite for this section — keep all spans unchanged
      for (const span of group.spans) {
        replacements.push({ original: span.element, newText: span.text });
      }
      continue;
    }

    // Collect only the non-structural leader spans — these receive new text.
    // Structural spans and inline followers are handled separately below.
    const leaderSpans = group.spans.filter((s) => !s.isStructural && s.inlineGroupLeader);

    const lines = wrapTextIntoSpans(rewritten, leaderSpans);

    // Build a map from inlineGroup index → new text for that line
    // (used for leader spans); followers always get "".
    const groupIndexToText = new Map<number, string>();
    leaderSpans.forEach((s, i) => {
      groupIndexToText.set(s.inlineGroup, lines[i] ?? '');
    });

    for (const span of group.spans) {
      if (span.isStructural) {
        // Preserve exactly
        replacements.push({ original: span.element, newText: span.text });
      } else if (span.inlineGroupLeader) {
        // Leader: receives new text
        replacements.push({ original: span.element, newText: groupIndexToText.get(span.inlineGroup) ?? '' });
      } else {
        // Inline follower: cleared
        replacements.push({ original: span.element, newText: '' });
      }
    }
  }

  // Apply replacements in a single pass through the HTML string.
  let result = originalHtml;

  for (const { original, newText } of replacements) {
    const openTagMatch = /^(<span[^>]*>)([\s\S]*?)(<\/span>)$/.exec(original);
    if (!openTagMatch) continue;

    const openTag = openTagMatch[1] ?? '';
    const closeTag = openTagMatch[3] ?? '';
    const replacement = `${openTag}${escapeHtml(newText)}${closeTag}`;

    // Replace only the first occurrence to handle duplicate spans safely
    const idx = result.indexOf(original);
    if (idx === -1) continue;
    result = result.slice(0, idx) + replacement + result.slice(idx + original.length);
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

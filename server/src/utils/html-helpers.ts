/**
 * Strips HTML tags from a string, preserving whitespace between elements.
 * Intended ONLY for LLM prompt input — do NOT use for HTML rendering.
 * HTML entities (e.g. &lt; &gt;) are left encoded to prevent XSS if output
 * is ever re-inserted into an HTML context.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

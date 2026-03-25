import { PDFParse } from "pdf-parse";

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

/**
 * Convert a PDF buffer to HTML using pdf-parse (pure JS, no external binaries).
 *
 * pdf-parse extracts plain text; we wrap each paragraph in a <p> tag
 * so downstream consumers that expect HTML still get valid markup.
 */
export async function convertPdfToHtml(pdfBuffer: Buffer): Promise<string> {
  let parser: PDFParse | undefined;

  try {
    parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const result = await parser.getText();
    const text = result.text;

    if (!text || text.trim().length === 0) {
      throw new PdfConversionError(
        "PDF appears to contain no extractable text (possibly scanned/image-only)",
      );
    }

    return textToHtml(text);
  } catch (err) {
    if (err instanceof PdfConversionError) throw err;

    const message =
      err instanceof Error ? err.message : "Unknown PDF parsing error";
    throw new PdfConversionError(`PDF conversion failed: ${message}`);
  } finally {
    await parser?.destroy().catch(() => {});
  }
}

/**
 * Wrap plain text in minimal HTML structure.
 * Each paragraph (separated by blank lines) becomes a <p> element.
 * Consecutive non-blank lines within a paragraph are joined with <br>.
 */
function textToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/);

  const body = paragraphs
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const escaped = escapeHtml(p);
      const withBreaks = escaped.replace(/\n/g, "<br>\n");
      return `<p>${withBreaks}</p>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

import * as mupdf from "mupdf";

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

/**
 * Convert a PDF buffer to compact, styled HTML using MuPDF's structured text.
 *
 * Uses toStructuredText().asHTML() which preserves font names, sizes, colors,
 * bold/italic styling, and positioned layout — while producing compact output
 * (~16KB per page vs ~472KB for SVG). Link annotations are extracted separately
 * and overlaid as clickable anchors.
 */
export async function convertPdfToHtml(pdfBuffer: Buffer): Promise<string> {
  try {
    const doc = mupdf.Document.openDocument(
      new Uint8Array(pdfBuffer),
      "application/pdf",
    );

    const totalPages = doc.countPages();

    if (totalPages === 0) {
      throw new PdfConversionError("PDF contains no pages");
    }

    const pageHtmls: string[] = [];

    for (let i = 0; i < totalPages; i++) {
      const page = doc.loadPage(i);
      const bounds = page.getBounds();
      const width = bounds[2] - bounds[0];
      const height = bounds[3] - bounds[1];

      const stext = page.toStructuredText("preserve-whitespace");
      const stextHtml = stext.asHTML(i);

      // Extract link annotations and build transparent overlay anchors
      const links = page.getLinks();
      let linkOverlay = "";
      if (links.length > 0) {
        const anchors = links
          .filter((link) => link.isExternal())
          .map((link) => {
            const [x0, y0, x1, y1] = link.getBounds();
            const uri = link.getURI();
            const safeHref = sanitizeUri(uri);
            if (!safeHref) return "";
            const lx = x0 - bounds[0];
            const ly = y0 - bounds[1];
            const lw = x1 - x0;
            const lh = y1 - y0;
            return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="position:absolute;left:${lx}pt;top:${ly}pt;width:${lw}pt;height:${lh}pt;display:block;z-index:1"></a>`;
          })
          .filter(Boolean)
          .join("\n");
        if (anchors) {
          linkOverlay = `\n${anchors}`;
        }
      }

      pageHtmls.push(
        `<div class="pdf-page" style="position:relative;width:${Math.round(width)}pt;height:${Math.round(height)}pt;margin:0 auto 20px;overflow:hidden">\n${stextHtml}${linkOverlay}\n</div>`,
      );
    }

    return buildHtml(pageHtmls);
  } catch (err) {
    if (err instanceof PdfConversionError) throw err;

    const message =
      err instanceof Error ? err.message : "Unknown PDF parsing error";
    throw new PdfConversionError(`PDF conversion failed: ${message}`);
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Sanitize a URI from a PDF link annotation to prevent XSS via
 * dangerous schemes (e.g. javascript:, data:, vbscript:).
 * Returns the HTML-attribute-escaped URI if the scheme is safe,
 * or an empty string if the URI is invalid or uses a blocked scheme.
 */
function sanitizeUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (!SAFE_PROTOCOLS.has(parsed.protocol)) return "";
  } catch {
    return "";
  }
  return escapeAttr(uri);
}

function buildHtml(pages: string[]): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body { background: #f5f5f5; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
.pdf-page { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); position: relative; }
.pdf-page > div { position: relative; width: 100%; height: 100%; }
.pdf-page p { position: absolute; margin: 0; white-space: pre-wrap; }
.pdf-page a { cursor: pointer; }
@media print {
  body { background: white; padding: 0; }
  .pdf-page { box-shadow: none; margin: 0; page-break-after: always; }
}
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}

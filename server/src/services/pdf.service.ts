import * as mupdf from "mupdf";

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

/**
 * Convert a PDF buffer to high-fidelity HTML using MuPDF's WASM engine.
 *
 * Each page is rendered to SVG via MuPDF's DocumentWriter, which processes
 * the full page rendering pipeline — preserving backgrounds, lines, shapes,
 * colors, fonts, images, and all visual decorations. The SVGs are then
 * wrapped in an HTML document.
 *
 * This approach produces output that closely mirrors the original PDF's
 * visual appearance, unlike text-only extraction methods.
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

    const pageSvgs: string[] = [];

    for (let i = 0; i < totalPages; i++) {
      const page = doc.loadPage(i);
      const bounds = page.getBounds();
      const width = bounds[2] - bounds[0];
      const height = bounds[3] - bounds[1];

      // Render page to SVG via DocumentWriter (captures ALL visual elements)
      const outBuf = new mupdf.Buffer();
      const writer = new mupdf.DocumentWriter(outBuf, "svg", "");
      const device = writer.beginPage([bounds[0], bounds[1], bounds[2], bounds[3]]);
      page.run(device, mupdf.Matrix.identity);
      writer.endPage();
      writer.close();

      const svgContent = outBuf.asString();

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
            return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" style="position:absolute;left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px;display:block"></a>`;
          })
          .filter(Boolean)
          .join("\n");
        if (anchors) {
          linkOverlay = `\n<div class="pdf-links" style="position:absolute;top:0;left:0;width:100%;height:100%">\n${anchors}\n</div>`;
        }
      }

      pageSvgs.push(
        `<div class="pdf-page" style="position:relative;width:${Math.round(width)}px;height:${Math.round(height)}px;margin:0 auto 20px;overflow:hidden">\n${svgContent}${linkOverlay}\n</div>`,
      );
    }

    return buildHtml(pageSvgs);
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
body { background: #f5f5f5; margin: 0; padding: 20px; }
.pdf-page { background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.15); position: relative; }
.pdf-page svg { display: block; width: 100%; height: auto; }
.pdf-links { z-index: 1; }
.pdf-links a { cursor: pointer; }
</style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}

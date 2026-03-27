import { execFile } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.resolve(__dirname, "../..", "convert_pdf.py");

/**
 * Convert a PDF buffer to HTML by calling the PyMuPDF-based Python script.
 * The PDF is passed via stdin and HTML is returned via stdout.
 */
export async function convertPdfToHtml(pdfBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "python",
      [PYTHON_SCRIPT],
      { maxBuffer: 10 * 1024 * 1024, encoding: "utf-8" },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          reject(new PdfConversionError(`PDF conversion failed: ${msg}`));
          return;
        }
        if (!stdout.trim()) {
          reject(new PdfConversionError("PDF conversion returned empty output"));
          return;
        }
        resolve(stdout);
      },
    );

    child.stdin?.write(pdfBuffer);
    child.stdin?.end();
  });
}

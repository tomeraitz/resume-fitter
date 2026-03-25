import { execFile } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfConversionError";
  }
}

/**
 * Convert a PDF buffer to HTML using poppler's pdftohtml CLI.
 * Requires poppler-utils to be installed on the host system.
 */
export async function convertPdfToHtml(pdfBuffer: Buffer): Promise<string> {
  const id = randomUUID();
  const tempDir = tmpdir();
  const inputPath = join(tempDir, `${id}.pdf`);
  const outputPath = join(tempDir, `${id}.html`);

  await writeFile(inputPath, pdfBuffer);

  try {
    await runPdfToHtml(inputPath, outputPath);
    const html = await readFile(outputPath, "utf-8");
    return html;
  } finally {
    // Best-effort cleanup — don't let failures here mask real errors
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function runPdfToHtml(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -s: generate single HTML page
    // -i: ignore images (we only need text/structure)
    // -noframes: output single file instead of framed pages
    execFile(
      "pdftohtml",
      ["-s", "-i", "-noframes", inputPath, outputPath],
      { timeout: 30_000 },
      (error, _stdout, stderr) => {
        if (error) {
          const msg =
            error.killed
              ? "PDF conversion timed out"
              : `pdftohtml failed: ${stderr || error.message}`;
          reject(new PdfConversionError(msg));
          return;
        }
        resolve();
      },
    );
  });
}

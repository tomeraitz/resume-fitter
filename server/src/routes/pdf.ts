import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rateLimit.js";
import { convertPdfToHtml, PdfConversionError } from "../services/pdf.service.js";

export const pdfRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are accepted"));
      return;
    }
    cb(null, true);
  },
});

pdfRouter.post(
  "/",
  requireAuth,
  rateLimiter,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No PDF file provided" });
      return;
    }

    try {
      const html = await convertPdfToHtml(req.file.buffer);
      res.json({ html });
    } catch (err) {
      if (err instanceof PdfConversionError) {
        console.error("[pdf-to-html] conversion error:", err.message);
        res.status(422).json({ error: err.message });
        return;
      }
      console.error("[pdf-to-html] unexpected error:", err);
      res.status(500).json({ error: "PDF conversion failed" });
    }
  },
);

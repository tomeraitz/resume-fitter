import "dotenv/config";
import express from "express";
import { pipelineRouter } from "./routes/pipeline.js";
import { chatRouter } from "./routes/chat.js";
import { extractRouter } from "./routes/extract.js";
// Eagerly import so ModelService validates env vars at startup
import "./agents/orchestrator.js";
import "./routes/chat.js";

if (!process.env["SESSION_SECRET"]) {
  console.error("[server] SESSION_SECRET env var is required but not set");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "512kb" }));
app.use("/pipeline", pipelineRouter);
app.use("/chat", chatRouter);
app.use("/extract", extractRouter);

const port = process.env["PORT"] ?? "3001";
app.listen(Number(port), () => {
  console.log(`[server] listening on port ${port}`);
});

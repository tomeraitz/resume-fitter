import "dotenv/config";
import express from "express";
import { pipelineRouter } from "./routes/pipeline.js";
// Eagerly import orchestrator so ModelService validates env vars at startup,
// not on the first incoming request.
import "./agents/orchestrator.js";

if (!process.env["SESSION_SECRET"]) {
  console.error("[server] SESSION_SECRET env var is required but not set");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "512kb" }));
app.use("/pipeline", pipelineRouter);

const port = process.env["PORT"] ?? "3001";
app.listen(Number(port), () => {
  console.log(`[server] listening on port ${port}`);
});

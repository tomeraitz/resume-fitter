import "dotenv/config";
import express from "express";
import { pipelineRouter } from "./routes/pipeline.js";
// Eagerly import orchestrator so ModelService validates env vars at startup,
// not on the first incoming request.
import "./agents/orchestrator.js";

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use("/pipeline", pipelineRouter);

const port = process.env["PORT"] ?? "3001";
app.listen(Number(port), () => {
  console.log(`[server] listening on port ${port}`);
});

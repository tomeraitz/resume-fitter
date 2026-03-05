import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config(); // load .env before tests run

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 0,
  },
});

/** Thrown when a required env var (API key or MODEL_PROVIDER) is missing. */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

/**
 * Thrown when both primary and fallback fail, or primary fails with no fallback.
 * Uses ES2022 built-in Error.cause — cause is NOT redeclared as a class field.
 */
export class PipelineError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "PipelineError";
  }
}

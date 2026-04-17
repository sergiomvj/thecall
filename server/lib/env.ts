export const env = {
  get PORT() {
    return Number(process.env.PORT ?? 3001);
  },
  get APP_URL() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get DATABASE_URL() {
    return process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  },
  get OPENROUTER_API_KEY() {
    return process.env.OPENROUTER_API_KEY ?? "";
  },
  get OPENROUTER_MODEL() {
    return process.env.OPENROUTER_MODEL ?? "openrouter/free";
  },
  get OPENROUTER_FALLBACK_MODELS() {
    const configured =
      process.env.OPENROUTER_FALLBACK_MODELS ??
      [
        "qwen/qwen3.6-plus:free",
        "google/gemma-4-26b-a4b-it:free",
        "arcee-ai/trinity-large-preview:free",
        "meta-llama/llama-3.2-3b-instruct:free",
        "google/gemma-4-31b-it:free",
      ].join(",");

    return configured
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
  },
  get OPENROUTER_USE_LOW_COST_MODELS() {
    const value = process.env.OPENROUTER_USE_LOW_COST_MODELS ?? "true";
    return value.toLowerCase() !== "false";
  },
  get OPENROUTER_LOW_COST_MODELS() {
    const configured =
      process.env.OPENROUTER_LOW_COST_MODELS ??
      [
        "qwen/qwen3.5-9b",
        "google/gemma-4-26b-a4b-it",
        "mistralai/mistral-small-2603",
      ].join(",");

    return configured
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);
  },
  get GEMINI_API_KEY() {
    return process.env.GEMINI_API_KEY ?? "";
  },
  get GEMINI_AVATAR_MODEL() {
    return process.env.GEMINI_AVATAR_MODEL ?? "imagen-4.0-generate-001";
  },
};

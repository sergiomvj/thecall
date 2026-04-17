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
    return process.env.OPENROUTER_MODEL ?? "google/gemma-4-31b-it:free";
  },
  get GEMINI_API_KEY() {
    return process.env.GEMINI_API_KEY ?? "";
  },
  get GEMINI_AVATAR_MODEL() {
    return process.env.GEMINI_AVATAR_MODEL ?? "imagen-4.0-generate-001";
  },
};

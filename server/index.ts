import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

import { GoogleGenAI } from "@google/genai";

import { env } from "./lib/env.ts";
import { prisma } from "./lib/prisma.ts";
import {
  assessSimilarity,
  buildInputFingerprint,
  type CandidatePersona,
} from "./services/persona-similarity.ts";
import { generatePersonaProfile } from "./services/openrouter.ts";

loadEnv({ path: ".env.local", override: false });
loadEnv();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "storage", "avatars");

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(rootDir, "storage")));

function parseCompetencies(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function parseCompetenciesJson(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function toCandidatePersona(
  persona: Awaited<ReturnType<typeof prisma.persona.findMany>>[number]
): CandidatePersona {
  return {
    id: persona.id,
    name: persona.name,
    background: persona.background,
    role: persona.role,
    psychology: persona.psychology,
    behavior: persona.behavior,
    competencies: parseCompetenciesJson(persona.competenciesJson),
    fingerprint: persona.normalizedFingerprint,
  };
}

function toPersonaDto(persona: Awaited<ReturnType<typeof prisma.persona.findFirstOrThrow>>) {
  return {
    id: persona.id,
    name: persona.name,
    background: persona.background,
    role: persona.role,
    psychology: persona.psychology,
    behavior: persona.behavior,
    competencies: parseCompetenciesJson(persona.competenciesJson),
    status: persona.status,
    avatarUrl: persona.avatarUrl,
    similarityScoreMax: persona.similarityScoreMax,
    generationModel: persona.generationModel,
    avatarModel: persona.avatarModel,
    createdAt: persona.createdAt.toISOString(),
    updatedAt: persona.updatedAt.toISOString(),
  };
}

function buildPersonaSummary(personas: CandidatePersona[]): string {
  if (personas.length === 0) {
    return "No existing personas.";
  }

  return personas
    .slice(0, 8)
    .map(
      (persona, index) =>
        `${index + 1}. ${persona.name} | ${persona.background} | ${persona.role} | ${persona.competencies.join(", ")}`
    )
    .join("\n");
}

async function generateAvatarForPersona(personaId: string) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
  });

  if (!persona) {
    throw new Error("Persona not found.");
  }

  const competencies = parseCompetenciesJson(persona.competenciesJson);
  const avatarPrompt = [
    `Create a polished professional avatar portrait for a business profile.`,
    `Subject name: ${persona.name}.`,
    `Professional role: ${persona.role}.`,
    `Background and niche: ${persona.background}.`,
    `Core strengths: ${competencies.join(", ")}.`,
    `Psychological tone: ${persona.psychology.slice(0, 400)}.`,
    `Behavioral style: ${persona.behavior.slice(0, 240)}.`,
    `Visual direction: editorial headshot, natural skin texture, realistic lighting, clean wardrobe, confident posture, premium but believable, centered composition, neutral or office-inspired background, suitable for LinkedIn or executive bio.`,
    `Avoid: text, watermark, fantasy styling, exaggerated cinematic effects, distorted hands, duplicate faces, cartoon look, low resolution.`,
  ].join(" ");

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateImages({
    model: env.GEMINI_AVATAR_MODEL,
    prompt: avatarPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: "1:1",
    },
  });

  const imageBytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error("Gemini did not return image data.");
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const fileName = `${persona.id}-${Date.now()}.png`;
  const absolutePath = path.join(uploadsDir, fileName);
  await fs.writeFile(absolutePath, Buffer.from(imageBytes, "base64"));

  const updatedPersona = await prisma.$transaction(async (transaction) => {
    const nextPersona = await transaction.persona.update({
      where: { id: persona.id },
      data: {
        avatarUrl: `/uploads/avatars/${fileName}`,
        avatarPrompt,
        avatarModel: env.GEMINI_AVATAR_MODEL,
        status: "READY",
      },
    });

    await transaction.generationLog.create({
      data: {
        personaId: persona.id,
        kind: "avatar",
        provider: "google",
        model: env.GEMINI_AVATAR_MODEL,
        promptHash: hashPrompt(avatarPrompt),
        success: true,
        responseExcerpt: `/uploads/avatars/${fileName}`,
      },
    });

    return nextPersona;
  });

  return updatedPersona;
}

app.get("/api/health", async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ ok: true });
});

app.get("/api/personas", async (_request, response) => {
  const personas = await prisma.persona.findMany({
    orderBy: { createdAt: "desc" },
  });

  response.json({
    personas: personas.map((persona) => toPersonaDto(persona)),
  });
});

app.post("/api/personas", async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const background =
    typeof request.body?.background === "string"
      ? request.body.background.trim()
      : "";
  const competencies = parseCompetencies(request.body?.competencies);

  if (!name || !background) {
    response.status(400).json({
      error: "name and background are required.",
    });
    return;
  }

  const existingPersonas = await prisma.persona.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const candidateBase: CandidatePersona = {
    name,
    background,
    role: "",
    psychology: "",
    behavior: "",
    competencies,
    fingerprint: buildInputFingerprint({
      background,
      competencies,
    }),
  };

  const preSimilarity = assessSimilarity(
    candidateBase,
    existingPersonas.map((persona) => toCandidatePersona(persona))
  );

  if (preSimilarity.decision === "block") {
    response.status(409).json({
      error: "A entrada ficou parecida demais com personas ja existentes.",
      similarity: preSimilarity,
    });
    return;
  }

  const generation = await generatePersonaProfile({
    name,
    background,
    competencies,
    previousPersonasSummary: buildPersonaSummary(
      existingPersonas.map((persona) => toCandidatePersona(persona))
    ),
    diversityWarnings:
      preSimilarity.decision === "warn" ? preSimilarity.reasons : [],
  });

  const finalCandidate: CandidatePersona = {
    name,
    background,
    role: generation.role,
    psychology: generation.psychology,
    behavior: generation.behavior,
    competencies: generation.competencies,
    fingerprint: buildInputFingerprint({
      background,
      competencies: generation.competencies,
    }),
  };

  const finalSimilarity = assessSimilarity(
    finalCandidate,
    existingPersonas.map((persona) => toCandidatePersona(persona))
  );

  if (finalSimilarity.decision === "block") {
    response.status(409).json({
      error:
        "A persona gerada ficou muito semelhante ao historico salvo. Ajuste o briefing e tente novamente.",
      similarity: finalSimilarity,
    });
    return;
  }

  const promptHash = hashPrompt(generation.prompt);
  const createdPersona = await prisma.$transaction(async (transaction) => {
    const persona = await transaction.persona.create({
      data: {
        name,
        background,
        role: generation.role,
        psychology: generation.psychology,
        behavior: generation.behavior,
        competenciesJson: JSON.stringify(generation.competencies),
        sourcePrompt: generation.prompt,
        normalizedFingerprint: finalCandidate.fingerprint,
        similarityScoreMax: finalSimilarity.maxScore,
        status: env.GEMINI_API_KEY ? "AVATAR_PENDING" : "GENERATED",
        generationModel: env.OPENROUTER_MODEL,
      },
    });

    await transaction.generationLog.create({
      data: {
        personaId: persona.id,
        kind: "text",
        provider: "openrouter",
        model: env.OPENROUTER_MODEL,
        promptHash,
        success: true,
        responseExcerpt: JSON.stringify({
          role: generation.role,
          competencies: generation.competencies,
        }),
      },
    });

    if (finalSimilarity.matches.length > 0) {
      await transaction.personaSimilarity.createMany({
        data: finalSimilarity.matches.slice(0, 3).map((match) => ({
          sourcePersonaId: persona.id,
          comparedPersonaId: match.comparedPersonaId,
          score: match.score,
          reason: match.reason,
          blockingThreshold: 0.75,
        })),
      });
    }

    return persona;
  });

  response.status(201).json({
    persona: toPersonaDto(createdPersona),
    similarity: finalSimilarity,
  });
});

app.post("/api/personas/:id/avatar", async (request, response) => {
  const personaId = request.params.id;

  try {
    const updatedPersona = await generateAvatarForPersona(personaId);
    response.json({
      persona: toPersonaDto(updatedPersona),
    });
  } catch (error) {
    await prisma.persona.updateMany({
      where: { id: personaId },
      data: { status: "FAILED" },
    });

    if (await prisma.persona.count({ where: { id: personaId } })) {
      await prisma.generationLog.create({
        data: {
          personaId,
          kind: "avatar",
          provider: "google",
          model: env.GEMINI_AVATAR_MODEL,
          promptHash: hashPrompt(`avatar:${personaId}:${Date.now()}`),
          success: false,
          errorMessage:
            error instanceof Error ? error.message : "Unknown avatar failure",
        },
      });
    }

    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : "Avatar generation failed unexpectedly.",
    });
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
);

async function main() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await prisma.$connect();

  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

void main();

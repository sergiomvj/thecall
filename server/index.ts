import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
import { generatePersonaProfile } from "./services/openai.ts";

loadEnv({ path: ".env.local", override: false });
loadEnv();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const uploadsDir = path.join(rootDir, "storage", "avatars");
const distDir = path.join(rootDir, "dist");

app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.join(rootDir, "storage")));
app.use(express.static(distDir));

function asyncHandler(
  handler: (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ) => Promise<void>
) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

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

const personaExportColumns = [
  "nome",
  "personalidade",
  "perfilGeral",
  "carreira",
  "competenciasCentrais",
  "idade",
  "localMora",
  "estadoCivil",
  "idiomas",
  "aparencia",
  "estiloDeVestir",
  "hobbies",
  "descCurta",
  "lema",
  "nacionalidade",
  "formacao",
  "assuntosDomina",
  "ferramentasFamiliarizado",
  "input_name",
  "input_function",
  "input_skill_optional",
  "id",
  "name",
  "role",
  "psychology",
  "behavior",
  "competenciesJson",
  "background",
  "sourcePrompt",
  "normalizedFingerprint",
  "similarityScoreMax",
  "status",
  "createdAt",
  "updatedAt",
  "avatarUrl",
  "avatarPrompt",
  "generationModel",
  "avatarModel",
  "rejectionReason",
  "similarityDecision",
  "similarityReasons",
  "comparedPersonaId",
  "blockingThreshold",
  "provisioningReady",
] as const;

type ExportColumn = (typeof personaExportColumns)[number];

function getSimilarityDecision(score: number): "allow" | "warn" | "block" {
  if (score >= 0.75) {
    return "block";
  }

  if (score >= 0.55) {
    return "warn";
  }

  return "allow";
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const normalized =
    value instanceof Date ? value.toISOString() : typeof value === "string" ? value : String(value);

  return `"${normalized.replace(/"/g, '""')}"`;
}

async function ensureRuntimeSchema() {
  const columns = (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("Persona")`
  )).map((column) => column.name);

  if (!columns.includes("inputSkillOptional")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Persona" ADD COLUMN "inputSkillOptional" TEXT`
    );
  }

  const optionalColumns = [
    ["shortDescription", "TEXT"],
    ["motto", "TEXT"],
    ["age", "INTEGER"],
    ["city", "TEXT"],
    ["maritalStatus", "TEXT"],
    ["nationality", "TEXT"],
    ["languagesJson", "TEXT"],
    ["appearance", "TEXT"],
    ["clothingStyle", "TEXT"],
    ["hobbiesJson", "TEXT"],
    ["education", "TEXT"],
    ["masteredTopicsJson", "TEXT"],
    ["familiarToolsJson", "TEXT"],
  ] as const;

  for (const [columnName, columnType] of optionalColumns) {
    if (!columns.includes(columnName)) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "Persona" ADD COLUMN "${columnName}" ${columnType}`
      );
    }
  }
}

type PersonaRecord = {
  id: string;
  name: string;
  background: string;
  role: string;
  shortDescription: string | null;
  motto: string | null;
  age: number | null;
  city: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  languagesJson: string | null;
  psychology: string;
  behavior: string;
  appearance: string | null;
  clothingStyle: string | null;
  hobbiesJson: string | null;
  education: string | null;
  masteredTopicsJson: string | null;
  familiarToolsJson: string | null;
  competenciesJson: string;
  sourcePrompt: string;
  inputSkillOptional: string | null;
  normalizedFingerprint: string;
  similarityScoreMax: number;
  status: string;
  avatarUrl: string | null;
  avatarPrompt: string | null;
  generationModel: string | null;
  avatarModel: string | null;
  rejectionReason: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function buildCanonicalAvatarPrompt(persona: {
  name: string;
  role: string;
  age: number | null;
  city: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  appearance: string | null;
  clothingStyle: string | null;
  psychology: string;
  behavior: string;
  background: string;
  competenciesJson: string;
  languagesJson: string | null;
  hobbiesJson: string | null;
  shortDescription: string | null;
  motto: string | null;
}): string {
  const competencies = parseJsonArray(persona.competenciesJson);
  const languages = parseJsonArray(persona.languagesJson);
  const hobbies = parseJsonArray(persona.hobbiesJson);

  return [
    `Canonical visual identity for the agent "${persona.name}".`,
    `This description must define the same person consistently across solo portraits, workplace scenes, and group scenes with other agents.`,
    `Professional identity: ${persona.role}.`,
    `Business context: ${persona.background}.`,
    persona.shortDescription ? `Short description: ${persona.shortDescription}.` : "",
    persona.motto ? `Personal motto: ${persona.motto}.` : "",
    persona.age ? `Apparent age: ${persona.age} years old.` : "",
    persona.nationality ? `Nationality: ${persona.nationality}.` : "",
    persona.city ? `Lives in: ${persona.city}.` : "",
    persona.maritalStatus ? `Marital status: ${persona.maritalStatus}.` : "",
    languages.length > 0 ? `Languages: ${languages.join(", ")}.` : "",
    persona.appearance
      ? `Canonical physical appearance: ${persona.appearance}.`
      : "",
    persona.clothingStyle
      ? `Canonical clothing style: ${persona.clothingStyle}.`
      : "",
    competencies.length > 0
      ? `Professional strengths that should subtly inform posture and presence: ${competencies.join(", ")}.`
      : "",
    hobbies.length > 0
      ? `Personal interests that may lightly influence styling details without changing identity: ${hobbies.join(", ")}.`
      : "",
    `Psychological tone: ${persona.psychology.slice(0, 400)}.`,
    `Behavioral style: ${persona.behavior.slice(0, 320)}.`,
    `Guardrails: preserve the same facial identity, apparent age, skin tone, facial structure, hair characteristics, body presence, and wardrobe signature across all future image generations.`,
    `Output intent: realistic human professional, premium but believable, never cartoonish, never generic, never inconsistent between scenes.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function listPersonas(): Promise<PersonaRecord[]> {
  return prisma.$queryRawUnsafe<PersonaRecord[]>(
    `SELECT * FROM "Persona" ORDER BY "createdAt" DESC`
  );
}

async function getPersonaById(personaId: string): Promise<PersonaRecord | null> {
  const rows = await prisma.$queryRawUnsafe<PersonaRecord[]>(
    `SELECT * FROM "Persona" WHERE "id" = ? LIMIT 1`,
    personaId
  );

  return rows[0] ?? null;
}

function toCandidatePersona(
  persona: PersonaRecord
): CandidatePersona {
  return {
    id: persona.id,
    name: persona.name,
    background: persona.background,
    role: persona.role,
    psychology: persona.psychology,
    behavior: persona.behavior,
    competencies: parseJsonArray(persona.competenciesJson),
    fingerprint: persona.normalizedFingerprint,
  };
}

function toPersonaDto(persona: PersonaRecord) {
  return {
    id: persona.id,
    name: persona.name,
    background: persona.background,
    role: persona.role,
    psychology: persona.psychology,
    behavior: persona.behavior,
    competencies: parseJsonArray(persona.competenciesJson),
    status: persona.status,
    avatarUrl: persona.avatarUrl,
    similarityScoreMax: persona.similarityScoreMax,
    generationModel: persona.generationModel,
    avatarModel: persona.avatarModel,
    createdAt: toIsoString(persona.createdAt),
    updatedAt: toIsoString(persona.updatedAt),
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

  const persona = await getPersonaById(personaId);

  if (!persona) {
    throw new Error("Persona not found.");
  }

  const canonicalAvatarPrompt =
    persona.avatarPrompt ||
    buildCanonicalAvatarPrompt({
      name: persona.name,
      role: persona.role,
      age: persona.age,
      city: persona.city,
      maritalStatus: persona.maritalStatus,
      nationality: persona.nationality,
      appearance: persona.appearance,
      clothingStyle: persona.clothingStyle,
      psychology: persona.psychology,
      behavior: persona.behavior,
      background: persona.background,
      competenciesJson: persona.competenciesJson,
      languagesJson: persona.languagesJson,
      hobbiesJson: persona.hobbiesJson,
      shortDescription: persona.shortDescription,
      motto: persona.motto,
    });
  const avatarPrompt = [
    canonicalAvatarPrompt,
    `Scene: polished professional avatar portrait for a business profile.`,
    `Framing: editorial headshot, centered composition, direct and confident posture.`,
    `Rendering: natural skin texture, realistic lighting, premium but believable finish, neutral or office-inspired background, suitable for LinkedIn or executive bio.`,
    `Avoid: text, watermark, fantasy styling, exaggerated cinematic effects, distorted anatomy, duplicate faces, cartoon look, low resolution.`,
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
        avatarPrompt: canonicalAvatarPrompt,
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

    const rows = await transaction.$queryRawUnsafe<PersonaRecord[]>(
      `SELECT * FROM "Persona" WHERE "id" = ? LIMIT 1`,
      nextPersona.id
    );

    return rows[0];
  });

  return updatedPersona;
}

async function deleteFailedPersona(personaId: string) {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
  });

  if (!persona) {
    return { kind: "not_found" as const };
  }

  if (persona.status !== "FAILED") {
    return { kind: "invalid_status" as const, status: persona.status };
  }

  await prisma.persona.delete({
    where: { id: personaId },
  });

  if (persona.avatarUrl?.startsWith("/uploads/avatars/")) {
    const fileName = persona.avatarUrl.replace("/uploads/avatars/", "");
    const filePath = path.join(uploadsDir, fileName);

    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore missing files; the DB record is the source of truth here.
    }
  }

  return { kind: "deleted" as const };
}

app.get("/api/health", asyncHandler(async (_request, response) => {
  await prisma.$queryRaw`SELECT 1`;
  response.json({ ok: true });
}));

app.get("/api/personas", asyncHandler(async (_request, response) => {
  const personas = await listPersonas();

  response.json({
    personas: personas.map((persona) => toPersonaDto(persona)),
  });
}));

app.get("/api/personas/export.csv", asyncHandler(async (_request, response) => {
  const personas = await prisma.$queryRawUnsafe<
    Array<PersonaRecord & { comparedPersonaId: string | null; reason: string | null; blockingThreshold: number | null }>
  >(
    `SELECT
      p.*,
      ps."comparedPersonaId" AS "comparedPersonaId",
      ps."reason" AS "reason",
      ps."blockingThreshold" AS "blockingThreshold"
    FROM "Persona" p
    LEFT JOIN "PersonaSimilarity" ps
      ON ps."sourcePersonaId" = p."id"
      AND ps."id" = (
        SELECT ps2."id"
        FROM "PersonaSimilarity" ps2
        WHERE ps2."sourcePersonaId" = p."id"
        ORDER BY ps2."score" DESC
        LIMIT 1
      )
    WHERE p."status" IN ('GENERATED', 'AVATAR_PENDING', 'READY')
    ORDER BY p."createdAt" DESC`
  );

  const header = personaExportColumns.join(",");
  const rows = personas.map((persona) =>
    personaExportColumns
      .map((column) => {
        const similarityDecision = getSimilarityDecision(persona.similarityScoreMax);
        const provisioningReady =
          (persona.status === "GENERATED" ||
            persona.status === "AVATAR_PENDING" ||
            persona.status === "READY") &&
          similarityDecision !== "block";
        const competencies = parseJsonArray(persona.competenciesJson);
        const languages = parseJsonArray(persona.languagesJson).join(" | ");
        const hobbies = parseJsonArray(persona.hobbiesJson).join(" | ");
        const masteredTopics = parseJsonArray(persona.masteredTopicsJson).join(" | ");
        const familiarTools = parseJsonArray(persona.familiarToolsJson).join(" | ");

        const exportRow: Record<ExportColumn, unknown> = {
          nome: persona.name,
          personalidade: persona.psychology,
          perfilGeral: persona.behavior,
          carreira: persona.background,
          competenciasCentrais: competencies.join(" | "),
          idade: persona.age ?? "",
          localMora: persona.city ?? "",
          estadoCivil: persona.maritalStatus ?? "",
          idiomas: languages,
          aparencia: persona.appearance ?? "",
          estiloDeVestir: persona.clothingStyle ?? "",
          hobbies,
          descCurta: persona.shortDescription ?? "",
          lema: persona.motto ?? "",
          nacionalidade: persona.nationality ?? "",
          formacao: persona.education ?? "",
          assuntosDomina: masteredTopics,
          ferramentasFamiliarizado: familiarTools,
          input_name: persona.name,
          input_function: persona.background,
          input_skill_optional: persona.inputSkillOptional ?? "",
          id: persona.id,
          name: persona.name,
          role: persona.role,
          psychology: persona.psychology,
          behavior: persona.behavior,
          competenciesJson: persona.competenciesJson,
          background: persona.background,
          sourcePrompt: persona.sourcePrompt,
          normalizedFingerprint: persona.normalizedFingerprint,
          similarityScoreMax: persona.similarityScoreMax,
          status: persona.status,
          createdAt: toIsoString(persona.createdAt),
          updatedAt: toIsoString(persona.updatedAt),
          avatarUrl: persona.avatarUrl,
          avatarPrompt: persona.avatarPrompt,
          generationModel: persona.generationModel,
          avatarModel: persona.avatarModel,
          rejectionReason: persona.rejectionReason,
          similarityDecision,
          similarityReasons:
            persona.reason ??
            (similarityDecision === "allow"
              ? "Similarity is within an acceptable range"
              : ""),
          comparedPersonaId: persona.comparedPersonaId ?? "",
          blockingThreshold: persona.blockingThreshold ?? "",
          provisioningReady,
        };

        return escapeCsvValue(exportRow[column]);
      })
      .join(",")
  );

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    'attachment; filename="thecall-personas-export.csv"'
  );
  response.send([header, ...rows].join("\n"));
}));

app.post("/api/personas", asyncHandler(async (request, response) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const background =
    typeof request.body?.background === "string"
      ? request.body.background.trim()
      : "";
  const inputSkillOptional =
    typeof request.body?.competencies === "string"
      ? request.body.competencies.trim()
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
  }) as unknown as PersonaRecord[];
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
    const personaId = randomUUID();
    await transaction.$executeRawUnsafe(
      `INSERT INTO "Persona" (
        "id","name","background","role","shortDescription","motto","age","city","maritalStatus","nationality","languagesJson",
        "psychology","behavior","appearance","clothingStyle","hobbiesJson","education","masteredTopicsJson","familiarToolsJson",
        "competenciesJson","sourcePrompt","inputSkillOptional","normalizedFingerprint","similarityScoreMax","status","generationModel","avatarPrompt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      personaId,
      name,
      background,
      generation.role,
      generation.shortDescription,
      generation.motto,
      generation.age,
      generation.city,
      generation.maritalStatus,
      generation.nationality,
      JSON.stringify(generation.languages),
      generation.psychology,
      generation.behavior,
      generation.appearance,
      generation.clothingStyle,
      JSON.stringify(generation.hobbies),
      generation.education,
      JSON.stringify(generation.masteredTopics),
      JSON.stringify(generation.familiarTools),
      JSON.stringify(generation.competencies),
      generation.prompt,
      inputSkillOptional || null,
      finalCandidate.fingerprint,
      finalSimilarity.maxScore,
      env.GEMINI_API_KEY ? "AVATAR_PENDING" : "GENERATED",
      generation.model,
      buildCanonicalAvatarPrompt({
        name,
        role: generation.role,
        age: generation.age,
        city: generation.city,
        maritalStatus: generation.maritalStatus,
        nationality: generation.nationality,
        appearance: generation.appearance,
        clothingStyle: generation.clothingStyle,
        psychology: generation.psychology,
        behavior: generation.behavior,
        background,
        competenciesJson: JSON.stringify(generation.competencies),
        languagesJson: JSON.stringify(generation.languages),
        hobbiesJson: JSON.stringify(generation.hobbies),
        shortDescription: generation.shortDescription,
        motto: generation.motto,
      })
    );

    await transaction.generationLog.create({
      data: {
        personaId,
        kind: "text",
        provider: "openai",
        model: generation.model,
        promptHash,
        success: true,
        responseExcerpt: JSON.stringify({
          model: generation.model,
          role: generation.role,
          competencies: generation.competencies,
        }),
      },
    });

    if (finalSimilarity.matches.length > 0) {
      await transaction.personaSimilarity.createMany({
        data: finalSimilarity.matches.slice(0, 3).map((match) => ({
          sourcePersonaId: personaId,
          comparedPersonaId: match.comparedPersonaId,
          score: match.score,
          reason: match.reason,
          blockingThreshold: 0.75,
        })),
      });
    }

    const createdRows = await transaction.$queryRawUnsafe<PersonaRecord[]>(
      `SELECT * FROM "Persona" WHERE "id" = ? LIMIT 1`,
      personaId
    );

    return createdRows[0];
  });

  response.status(201).json({
    persona: toPersonaDto(createdPersona),
    similarity: finalSimilarity,
  });
}));

app.post("/api/personas/:id/avatar", async (request, response) => {
  const personaId = request.params.id;

  try {
    const updatedPersona = await generateAvatarForPersona(personaId);
    response.json({
      persona: toPersonaDto(updatedPersona),
    });
  } catch (error) {
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (persona) {
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

      await prisma.persona.update({
        where: { id: personaId },
        data: {
          status: persona.avatarUrl ? "READY" : "AVATAR_PENDING",
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

app.delete("/api/personas/:id", asyncHandler(async (request, response) => {
  const personaId = request.params.id;
  const result = await deleteFailedPersona(personaId);

  if (result.kind === "not_found") {
    response.status(404).json({
      error: "Persona not found.",
    });
    return;
  }

  if (result.kind === "invalid_status") {
    response.status(409).json({
      error: `Only FAILED personas can be deleted. Current status: ${result.status}.`,
    });
    return;
  }

  response.status(204).send();
}));

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

app.get("*", asyncHandler(async (request, response, next) => {
  if (request.path.startsWith("/api/")) {
    next();
    return;
  }

  try {
    await fs.access(path.join(distDir, "index.html"));
    response.sendFile(path.join(distDir, "index.html"));
  } catch {
    next();
  }
}));

async function main() {
  await fs.mkdir(uploadsDir, { recursive: true });
  await prisma.$connect();
  await ensureRuntimeSchema();

  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
}

void main();

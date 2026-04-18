import { env } from "../lib/env.ts";

interface GeneratePersonaProfileInput {
  name: string;
  background: string;
  competencies: string[];
  previousPersonasSummary: string;
  diversityWarnings: string[];
}

interface PersonaProfile {
  role: string;
  shortDescription: string;
  motto: string;
  age: number;
  city: string;
  maritalStatus: string;
  nationality: string;
  languages: string[];
  psychology: string;
  competencies: string[];
  behavior: string;
  appearance: string;
  clothingStyle: string;
  hobbies: string[];
  education: string;
  masteredTopics: string[];
  familiarTools: string[];
  prompt: string;
  model: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "Request timed out while waiting for OpenAI";
    }

    const causeMessage =
      typeof error.cause === "object" &&
      error.cause !== null &&
      "message" in error.cause &&
      typeof error.cause.message === "string"
        ? error.cause.message
        : null;

    return causeMessage ? `${error.message}: ${causeMessage}` : error.message;
  }

  return String(error);
}

function sanitizeCompetencies(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function sanitizeStringList(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseOpenAIError(responseBody: string): string {
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: {
        message?: string;
      };
    };

    return parsed.error?.message ?? responseBody;
  } catch {
    return responseBody;
  }
}

export async function generatePersonaProfile(
  input: GeneratePersonaProfileInput
): Promise<PersonaProfile> {
  const prompt = `
You generate differentiated professional personas for business, staffing, positioning, and virtual employee profile use.

Existing personas in the database:
${input.previousPersonasSummary}

If there are similarity warnings, avoid them explicitly:
${input.diversityWarnings.length > 0 ? input.diversityWarnings.join("; ") : "No active warnings."}

Create a persona using this exact user input:
- Name: ${input.name}
- Function: ${input.background}
- Optional skill input: ${input.competencies.join(", ") || "none provided"}

Requirements:
- Keep the persona business-ready and believable.
- Make the role distinct from existing personas.
- Create a complete professional and personal persona that can be provisioned by ARVA.
- The role must sound specific and professional, not generic.
- Psychology must be concrete, useful, and non-fluffy.
- Behavior must describe how the persona acts at work, makes decisions, communicates, and executes.
- Competencies must be practical, work-related, and internally coherent with the function.
- Age must be realistic for the function.
- City, nationality, marital status, languages, appearance, clothing style, hobbies, education, mastered topics, and familiar tools must all be coherent with the same person.
- shortDescription must be a concise one-paragraph summary.
- motto must be a short memorable line.
- Vary the niche, communication style, and strengths when similarity risk is high.
- Return data that matches the provided JSON schema exactly.
- Do not include extra keys.
- Do not use placeholders.
`.trim();

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a production persona generator. Always return structured JSON that matches the requested schema exactly.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "persona_profile",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                role: { type: "string" },
                shortDescription: { type: "string" },
                motto: { type: "string" },
                age: { type: "integer", minimum: 18, maximum: 80 },
                city: { type: "string" },
                maritalStatus: { type: "string" },
                nationality: { type: "string" },
                languages: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 5,
                },
                psychology: { type: "string" },
                competencies: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 5,
                  maxItems: 6,
                },
                behavior: { type: "string" },
                appearance: { type: "string" },
                clothingStyle: { type: "string" },
                hobbies: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 3,
                  maxItems: 6,
                },
                education: { type: "string" },
                masteredTopics: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 4,
                  maxItems: 8,
                },
                familiarTools: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 4,
                  maxItems: 8,
                },
              },
              required: [
                "role",
                "shortDescription",
                "motto",
                "age",
                "city",
                "maritalStatus",
                "nationality",
                "languages",
                "psychology",
                "competencies",
                "behavior",
                "appearance",
                "clothingStyle",
                "hobbies",
                "education",
                "masteredTopics",
                "familiarTools",
              ],
            },
          },
        },
      }),
      signal: AbortSignal.timeout(env.OPENAI_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`OpenAI network request failed: ${getErrorMessage(error)}`);
  }

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenAI request failed with status ${response.status}: ${parseOpenAIError(responseBody).slice(0, 400)}`
    );
  }

  const parsedResponse = JSON.parse(responseBody) as {
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };

  const outputText = parsedResponse.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;

  if (!outputText) {
    throw new Error("OpenAI returned an empty structured response.");
  }

  const payload = JSON.parse(outputText) as {
    role?: unknown;
    shortDescription?: unknown;
    motto?: unknown;
    age?: unknown;
    city?: unknown;
    maritalStatus?: unknown;
    nationality?: unknown;
    languages?: unknown;
    psychology?: unknown;
    competencies?: unknown;
    behavior?: unknown;
    appearance?: unknown;
    clothingStyle?: unknown;
    hobbies?: unknown;
    education?: unknown;
    masteredTopics?: unknown;
    familiarTools?: unknown;
  };

  const role = typeof payload.role === "string" ? payload.role.trim() : "";
  const shortDescription =
    typeof payload.shortDescription === "string"
      ? payload.shortDescription.trim()
      : "";
  const motto = typeof payload.motto === "string" ? payload.motto.trim() : "";
  const age = typeof payload.age === "number" ? payload.age : 0;
  const city = typeof payload.city === "string" ? payload.city.trim() : "";
  const maritalStatus =
    typeof payload.maritalStatus === "string" ? payload.maritalStatus.trim() : "";
  const nationality =
    typeof payload.nationality === "string" ? payload.nationality.trim() : "";
  const languages = sanitizeStringList(payload.languages, 5);
  const psychology =
    typeof payload.psychology === "string" ? payload.psychology.trim() : "";
  const behavior =
    typeof payload.behavior === "string" ? payload.behavior.trim() : "";
  const competencies = sanitizeCompetencies(payload.competencies);
  const appearance =
    typeof payload.appearance === "string" ? payload.appearance.trim() : "";
  const clothingStyle =
    typeof payload.clothingStyle === "string" ? payload.clothingStyle.trim() : "";
  const hobbies = sanitizeStringList(payload.hobbies, 6);
  const education =
    typeof payload.education === "string" ? payload.education.trim() : "";
  const masteredTopics = sanitizeStringList(payload.masteredTopics, 8);
  const familiarTools = sanitizeStringList(payload.familiarTools, 8);

  if (
    !role ||
    !shortDescription ||
    !motto ||
    age < 18 ||
    !city ||
    !maritalStatus ||
    !nationality ||
    languages.length < 1 ||
    !psychology ||
    !behavior ||
    competencies.length < 3 ||
    !appearance ||
    !clothingStyle ||
    hobbies.length < 3 ||
    !education ||
    masteredTopics.length < 4 ||
    familiarTools.length < 4
  ) {
    throw new Error("OpenAI returned an incomplete persona payload.");
  }

  return {
    role,
    shortDescription,
    motto,
    age,
    city,
    maritalStatus,
    nationality,
    languages,
    psychology,
    behavior,
    competencies,
    appearance,
    clothingStyle,
    hobbies,
    education,
    masteredTopics,
    familiarTools,
    prompt,
    model: env.OPENAI_MODEL,
  };
}

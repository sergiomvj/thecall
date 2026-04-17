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
  psychology: string;
  competencies: string[];
  behavior: string;
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
- The role must sound specific and professional, not generic.
- Psychology must be concrete, useful, and non-fluffy.
- Behavior must describe how the persona acts at work, makes decisions, communicates, and executes.
- Competencies must be practical, work-related, and internally coherent with the function.
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
                psychology: { type: "string" },
                competencies: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 5,
                  maxItems: 6,
                },
                behavior: { type: "string" },
              },
              required: ["role", "psychology", "competencies", "behavior"],
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
    psychology?: unknown;
    competencies?: unknown;
    behavior?: unknown;
  };

  const role = typeof payload.role === "string" ? payload.role.trim() : "";
  const psychology =
    typeof payload.psychology === "string" ? payload.psychology.trim() : "";
  const behavior =
    typeof payload.behavior === "string" ? payload.behavior.trim() : "";
  const competencies = sanitizeCompetencies(payload.competencies);

  if (!role || !psychology || !behavior || competencies.length < 3) {
    throw new Error("OpenAI returned an incomplete persona payload.");
  }

  return {
    role,
    psychology,
    behavior,
    competencies,
    prompt,
    model: env.OPENAI_MODEL,
  };
}

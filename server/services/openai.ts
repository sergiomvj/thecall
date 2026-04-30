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
  adjectives: string;
  communicationTone: string;
  underPressure: string;
  coreMotivation: string;
  beliefsPhilosophy: string;
  senseOfHumor: string;
  neverWouldDo: string;
  arvaLine: string;
  servesTo: string;
  mainObjective: string;
  responsibilities: string;
  notResponsibleFor: string;
  ninetyDayOutcome: string;
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
- adjectives must be a short comma-separated list of personality adjectives.
- communicationTone must describe how the persona speaks and writes professionally.
- underPressure must explain how the persona reacts under pressure.
- coreMotivation must explain the persona's internal driver.
- beliefsPhilosophy must summarize work philosophy or core beliefs.
- senseOfHumor must describe humor style in a professional context.
- neverWouldDo must define a clear ethical or operational red line.
- arvaLine must contain the ARVA line or operating lane this persona belongs to.
- servesTo must state who this persona primarily serves.
- mainObjective must define the main mission of the role.
- responsibilities must be a concise multiline-ready text listing key responsibilities.
- notResponsibleFor must define clear scope boundaries.
- ninetyDayOutcome must describe the expected outcome in the first 90 days.
- Competencies must be practical, work-related, and internally coherent with the function.
- Age must be realistic for the function.
- City, nationality, marital status, languages, appearance, clothing style, hobbies, education, mastered topics, and familiar tools must all be coherent with the same person.
- appearance MUST contain a detailed fisionomic description suitable for image generation (Midjourney-style prompt). It MUST follow this exact structure: "Person approximately [age] years old, [face shape], [skin tone], [eye type and color], [nose type], [mouth/lip type], [eyebrow type], [hair: color, texture, length and cut], [body type], [posture/expression], [fixed elements like glasses, beard, tattoo, scar or distinguishing mark]." Each bracket MUST be replaced with a concrete physical trait. Do NOT write vague or abstract descriptions. Do NOT describe clothing in the appearance field. Example: "Person approximately 34 years old, oval face, warm tan skin, deep-set dark brown eyes, straight narrow nose, full lips, thick arched eyebrows, black curly hair medium length side-parted, athletic build, confident relaxed posture, full well-groomed beard and thin rectangular glasses."
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
                adjectives: { type: "string" },
                communicationTone: { type: "string" },
                underPressure: { type: "string" },
                coreMotivation: { type: "string" },
                beliefsPhilosophy: { type: "string" },
                senseOfHumor: { type: "string" },
                neverWouldDo: { type: "string" },
                arvaLine: { type: "string" },
                servesTo: { type: "string" },
                mainObjective: { type: "string" },
                responsibilities: { type: "string" },
                notResponsibleFor: { type: "string" },
                ninetyDayOutcome: { type: "string" },
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
                "adjectives",
                "communicationTone",
                "underPressure",
                "coreMotivation",
                "beliefsPhilosophy",
                "senseOfHumor",
                "neverWouldDo",
                "arvaLine",
                "servesTo",
                "mainObjective",
                "responsibilities",
                "notResponsibleFor",
                "ninetyDayOutcome",
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
    adjectives?: unknown;
    communicationTone?: unknown;
    underPressure?: unknown;
    coreMotivation?: unknown;
    beliefsPhilosophy?: unknown;
    senseOfHumor?: unknown;
    neverWouldDo?: unknown;
    arvaLine?: unknown;
    servesTo?: unknown;
    mainObjective?: unknown;
    responsibilities?: unknown;
    notResponsibleFor?: unknown;
    ninetyDayOutcome?: unknown;
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
  const adjectives =
    typeof payload.adjectives === "string" ? payload.adjectives.trim() : "";
  const communicationTone =
    typeof payload.communicationTone === "string"
      ? payload.communicationTone.trim()
      : "";
  const underPressure =
    typeof payload.underPressure === "string" ? payload.underPressure.trim() : "";
  const coreMotivation =
    typeof payload.coreMotivation === "string" ? payload.coreMotivation.trim() : "";
  const beliefsPhilosophy =
    typeof payload.beliefsPhilosophy === "string"
      ? payload.beliefsPhilosophy.trim()
      : "";
  const senseOfHumor =
    typeof payload.senseOfHumor === "string" ? payload.senseOfHumor.trim() : "";
  const neverWouldDo =
    typeof payload.neverWouldDo === "string" ? payload.neverWouldDo.trim() : "";
  const arvaLine =
    typeof payload.arvaLine === "string" ? payload.arvaLine.trim() : "";
  const servesTo =
    typeof payload.servesTo === "string" ? payload.servesTo.trim() : "";
  const mainObjective =
    typeof payload.mainObjective === "string" ? payload.mainObjective.trim() : "";
  const responsibilities =
    typeof payload.responsibilities === "string"
      ? payload.responsibilities.trim()
      : "";
  const notResponsibleFor =
    typeof payload.notResponsibleFor === "string"
      ? payload.notResponsibleFor.trim()
      : "";
  const ninetyDayOutcome =
    typeof payload.ninetyDayOutcome === "string"
      ? payload.ninetyDayOutcome.trim()
      : "";
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
    !adjectives ||
    !communicationTone ||
    !underPressure ||
    !coreMotivation ||
    !beliefsPhilosophy ||
    !senseOfHumor ||
    !neverWouldDo ||
    !arvaLine ||
    !servesTo ||
    !mainObjective ||
    !responsibilities ||
    !notResponsibleFor ||
    !ninetyDayOutcome ||
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
    adjectives,
    communicationTone,
    underPressure,
    coreMotivation,
    beliefsPhilosophy,
    senseOfHumor,
    neverWouldDo,
    arvaLine,
    servesTo,
    mainObjective,
    responsibilities,
    notResponsibleFor,
    ninetyDayOutcome,
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

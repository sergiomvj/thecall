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
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
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

export async function generatePersonaProfile(
  input: GeneratePersonaProfileInput
): Promise<PersonaProfile> {
  const prompt = `
You generate differentiated professional personas for sales, positioning, and business profile use.

Existing personas in the database:
${input.previousPersonasSummary}

If there are similarity warnings, avoid them explicitly:
${input.diversityWarnings.length > 0 ? input.diversityWarnings.join("; ") : "No active warnings."}

Create a persona for:
- Name: ${input.name}
- Background: ${input.background}
- Candidate competencies: ${input.competencies.join(", ") || "none provided"}

Requirements:
- Keep the persona business-ready and believable.
- Make the role distinct from existing personas.
- Vary the niche, communication style, and strengths when similarity risk is high.
- Return valid JSON only.
- Use this exact schema:
{
  "role": "short professional title",
  "psychology": "2 compact paragraphs",
  "competencies": ["5 to 6 competencies"],
  "behavior": "1 paragraph"
}
`.trim();

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.APP_URL,
      "X-Title": "TheCall Persona Generator",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "You are a productized persona generator. Output JSON only and keep personas differentiated.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed with status ${response.status}: ${responseBody.slice(0, 300)}`
    );
  }

  const parsedBody = JSON.parse(responseBody) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = parsedBody.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned an empty completion.");
  }

  const payload = JSON.parse(extractJsonObject(content)) as {
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
    throw new Error("OpenRouter returned an incomplete persona payload.");
  }

  return {
    role,
    psychology,
    behavior,
    competencies,
    prompt,
  };
}

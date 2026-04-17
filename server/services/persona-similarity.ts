export interface CandidatePersona {
  id?: string;
  name: string;
  background: string;
  role: string;
  psychology: string;
  behavior: string;
  competencies: string[];
  fingerprint: string;
}

interface SimilarityMatch {
  comparedPersonaId: string;
  score: number;
  reason: string;
}

interface SimilarityResult {
  maxScore: number;
  decision: "allow" | "warn" | "block";
  reasons: string[];
  matches: SimilarityMatch[];
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );
}

function jaccard(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

function overlap(left: string[], right: string[]): number {
  const leftTokens = new Set(left.map(normalizeText).filter(Boolean));
  const rightTokens = new Set(right.map(normalizeText).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return union === 0 ? 0 : intersection / union;
}

export function buildInputFingerprint(input: {
  background: string;
  competencies: string[];
}) {
  const sortedCompetencies = [...input.competencies]
    .map(normalizeText)
    .filter(Boolean)
    .sort()
    .join("|");

  return [normalizeText(input.background), sortedCompetencies].join("::");
}

export function assessSimilarity(
  candidate: CandidatePersona,
  existingPersonas: CandidatePersona[]
): SimilarityResult {
  const matches: SimilarityMatch[] = existingPersonas
    .filter((persona) => persona.id !== candidate.id)
    .map((persona) => {
      const sameFingerprint = candidate.fingerprint === persona.fingerprint;
      const backgroundScore = jaccard(candidate.background, persona.background);
      const competencyScore = overlap(candidate.competencies, persona.competencies);
      const roleScore = jaccard(candidate.role, persona.role);
      const behaviorScore = jaccard(candidate.behavior, persona.behavior);
      const psychologyScore = jaccard(candidate.psychology, persona.psychology);

      const score = sameFingerprint
        ? 1
        : backgroundScore * 0.3 +
          competencyScore * 0.2 +
          roleScore * 0.2 +
          behaviorScore * 0.2 +
          psychologyScore * 0.1;

      const reasons: string[] = [];
      if (sameFingerprint) {
        reasons.push("Background and competencies match an existing fingerprint");
      }
      if (backgroundScore >= 0.7) {
        reasons.push("Background is highly similar");
      }
      if (competencyScore >= 0.7) {
        reasons.push("Competency stack overlaps heavily");
      }
      if (roleScore >= 0.6) {
        reasons.push("Role title is too close");
      }
      if (behaviorScore >= 0.6) {
        reasons.push("Behavioral profile is too close");
      }

      return {
        comparedPersonaId: persona.id ?? "unknown",
        score,
        reason: reasons.join("; ") || "General semantic overlap detected",
      };
    })
    .sort((left, right) => right.score - left.score);

  const maxScore = matches[0]?.score ?? 0;
  const decision: SimilarityResult["decision"] =
    maxScore >= 0.75 ? "block" : maxScore >= 0.55 ? "warn" : "allow";
  const reasons =
    matches[0] && maxScore >= 0.55
      ? [matches[0].reason]
      : ["Similarity is within an acceptable range"];

  return {
    maxScore,
    decision,
    reasons,
    matches,
  };
}

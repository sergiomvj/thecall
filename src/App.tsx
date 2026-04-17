import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Briefcase,
  Database,
  History,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type PersonaStatus =
  | "GENERATED"
  | "AVATAR_PENDING"
  | "READY"
  | "FAILED"
  | "REJECTED_SIMILAR";

interface Persona {
  id: string;
  name: string;
  background: string;
  role: string;
  psychology: string;
  competencies: string[];
  behavior: string;
  status: PersonaStatus;
  avatarUrl?: string | null;
  similarityScoreMax: number;
  generationModel?: string | null;
  avatarModel?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SimilarityPayload {
  maxScore: number;
  decision: "allow" | "warn" | "block";
  reasons: string[];
}

interface PersonaResponse {
  persona: Persona;
  similarity: SimilarityPayload;
}

const statusTone: Record<
  PersonaStatus,
  { label: string; className: string }
> = {
  GENERATED: {
    label: "TEXT READY",
    className: "text-[#4CAF50] border-[#4CAF50]/30 bg-[#4CAF50]/10",
  },
  AVATAR_PENDING: {
    label: "AVATAR PENDING",
    className: "text-[#F6C344] border-[#F6C344]/30 bg-[#F6C344]/10",
  },
  READY: {
    label: "READY",
    className: "text-[#4CAF50] border-[#4CAF50]/30 bg-[#4CAF50]/10",
  },
  FAILED: {
    label: "FAILED",
    className: "text-[#FF6B6B] border-[#FF6B6B]/30 bg-[#FF6B6B]/10",
  },
  REJECTED_SIMILAR: {
    label: "TOO SIMILAR",
    className: "text-[#FF9F43] border-[#FF9F43]/30 bg-[#FF9F43]/10",
  },
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: { error?: string; [key: string]: unknown } = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        error: text,
      };
    }
  }

  if (!response.ok) {
    const error = new Error(data.error ?? "Request failed") as Error & {
      status?: number;
      data?: unknown;
    };
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export default function App() {
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [similarityState, setSimilarityState] = useState<SimilarityPayload | null>(
    null
  );
  const [avatarLoadingIds, setAvatarLoadingIds] = useState<Record<string, boolean>>(
    {}
  );

  const selectedPersona =
    personas.find((persona) => persona.id === selectedPersonaId) ?? null;

  useEffect(() => {
    void loadPersonas();
  }, []);

  async function loadPersonas() {
    setIsLoading(true);
    try {
      const data = await apiFetch<{ personas: Persona[] }>("/api/personas");
      setPersonas(data.personas);
      setSelectedPersonaId((current) => current ?? data.personas[0]?.id ?? null);
      setErrorMessage(null);
    } catch (error) {
      console.error("Failed to load personas:", error);
      setErrorMessage("Nao foi possivel carregar as personas salvas.");
    } finally {
      setIsLoading(false);
    }
  }

  function upsertPersona(nextPersona: Persona) {
    setPersonas((current) => {
      const existing = current.some((persona) => persona.id === nextPersona.id);
      if (!existing) {
        return [nextPersona, ...current];
      }

      return current.map((persona) =>
        persona.id === nextPersona.id ? nextPersona : persona
      );
    });
  }

  async function triggerAvatar(personaId: string) {
    setAvatarLoadingIds((current) => ({ ...current, [personaId]: true }));
    setErrorMessage(null);

    try {
      const data = await apiFetch<{ persona: Persona }>(
        `/api/personas/${personaId}/avatar`,
        {
          method: "POST",
          body: JSON.stringify({ regenerate: true }),
        }
      );

      upsertPersona(data.persona);
      setSelectedPersonaId(data.persona.id);
    } catch (error) {
      console.error("Failed to generate avatar:", error);
      setErrorMessage("A persona foi criada, mas o avatar falhou. Tente novamente.");
      await loadPersonas();
    } finally {
      setAvatarLoadingIds((current) => ({ ...current, [personaId]: false }));
    }
  }

  async function generatePersona() {
    if (!name.trim() || !background.trim()) {
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setSimilarityState(null);

    try {
      const data = await apiFetch<PersonaResponse>("/api/personas", {
        method: "POST",
        body: JSON.stringify({
          name,
          background,
          competencies,
        }),
      });

      upsertPersona(data.persona);
      setSelectedPersonaId(data.persona.id);
      setSimilarityState(data.similarity);
      setName("");
      setBackground("");
      setCompetencies("");

      if (data.persona.status === "AVATAR_PENDING") {
        void triggerAvatar(data.persona.id);
      }
    } catch (error) {
      console.error("Generation failed:", error);
      const typedError = error as Error & {
        status?: number;
        data?: { similarity?: SimilarityPayload; error?: string };
      };

      if (typedError.status === 409 && typedError.data?.similarity) {
        setSimilarityState(typedError.data.similarity);
        setErrorMessage(
          typedError.data.error ??
            "A nova persona ficou parecida demais com registros existentes."
        );
      } else {
        setErrorMessage(
          typedError.message || "Nao foi possivel gerar a persona agora."
        );
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0F11] text-[#E0E0E6] font-mono selection:bg-[#F27D26] selection:text-white overflow-hidden flex flex-col">
      <header className="border-b border-[#26262B] p-4 flex items-center justify-between bg-[#15151A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F27D26] rounded flex items-center justify-center">
            <Brain className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-sm font-bold tracking-widest uppercase">
            Virtual Persona Generator <span className="text-[#F27D26] ml-2">v4.0.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-6 text-[10px] text-[#8E9299]">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3" />
            <span>PRISMA ONLINE</span>
          </div>
          <div className="flex items-center gap-2 text-[#4CAF50]">
            <ShieldCheck className="w-3 h-3" />
            <span>SERVER-SIDE AI</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-[#26262B] flex flex-col bg-[#111115]">
          <div className="p-4 border-b border-[#26262B] flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-tighter opacity-50 font-bold flex items-center gap-2">
              <History className="w-3 h-3" /> Archive
            </h2>
            <span className="text-[10px] bg-[#26262B] px-1.5 py-0.5 rounded">
              {personas.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {isLoading ? (
              <div className="p-3 text-[10px] opacity-50">Carregando base...</div>
            ) : personas.length === 0 ? (
              <div className="p-3 text-[10px] opacity-40">
                Nenhuma persona persistida ainda.
              </div>
            ) : (
              personas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  className={`w-full text-left p-3 rounded mb-1 transition-all group ${
                    selectedPersonaId === persona.id
                      ? "bg-[#26262B] border border-[#3A3A40]"
                      : "hover:bg-[#1A1A1E]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-bold truncate group-hover:text-[#F27D26] transition-colors">
                        {persona.name}
                      </div>
                      <div className="text-[9px] opacity-40 truncate">{persona.role}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] ${
                        statusTone[persona.status].className
                      }`}
                    >
                      {statusTone[persona.status].label}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex-1 flex flex-col overflow-hidden relative">
          <div className="bg-[#15151A] border-b border-[#26262B] p-4 flex justify-between items-center">
            <nav className="flex items-center gap-8 text-[11px]">
              <button className="text-[#F27D26] border-b border-[#F27D26] pb-1">
                OVERVIEW
              </button>
              <button className="opacity-40 hover:opacity-100 transition-opacity">
                PSYCHOLOGY
              </button>
              <button className="opacity-40 hover:opacity-100 transition-opacity">
                COMPETENCIES
              </button>
            </nav>
            <div className="text-[10px] opacity-40 italic">
              Last Sync: {new Date().toLocaleTimeString()}
            </div>
          </div>

          {(errorMessage || similarityState) && (
            <div className="border-b border-[#26262B] bg-[#17171D] px-4 py-3">
              {errorMessage && (
                <div className="flex items-start gap-2 text-[11px] text-[#FFB57A]">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
              {similarityState && (
                <div className="mt-2 text-[10px] text-[#B6BAC4]">
                  Similaridade: {(similarityState.maxScore * 100).toFixed(0)}% |{" "}
                  {similarityState.decision.toUpperCase()} |{" "}
                  {similarityState.reasons.join(" | ")}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[radial-gradient(circle_at_top,_rgba(242,125,38,0.12),_transparent_32%),linear-gradient(180deg,_rgba(21,21,26,0.96),_rgba(15,15,17,1))]">
            <AnimatePresence mode="wait">
              {selectedPersona ? (
                <motion.div
                  key={selectedPersona.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-4xl mx-auto space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 bg-[#15151A] border border-[#26262B] p-6 rounded relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#F27D26]/5 rounded-bl-full -mr-12 -mt-12 group-hover:bg-[#F27D26]/10 transition-colors" />
                      <div className="w-28 h-28 bg-[#26262B] rounded-full overflow-hidden flex items-center justify-center mb-4 border border-[#3A3A40]">
                        {selectedPersona.avatarUrl ? (
                          <img
                            src={selectedPersona.avatarUrl}
                            alt={selectedPersona.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-10 h-10 text-[#F27D26]" />
                        )}
                      </div>
                      <h2 className="text-xl font-bold tracking-tight mb-1">
                        {selectedPersona.name}
                      </h2>
                      <div className="text-[10px] text-[#F27D26] uppercase font-bold tracking-[0.2em] mb-2">
                        {selectedPersona.role}
                      </div>
                      <div className="text-[10px] opacity-50 mb-4">
                        {selectedPersona.background}
                      </div>
                      <div className="mb-4 flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded border px-2 py-1 text-[9px] ${
                            statusTone[selectedPersona.status].className
                          }`}
                        >
                          {statusTone[selectedPersona.status].label}
                        </span>
                        <span className="rounded border border-[#2E2E34] px-2 py-1 text-[9px] text-[#8E9299]">
                          SIM {(selectedPersona.similarityScoreMax * 100).toFixed(0)}%
                        </span>
                      </div>
                      <button
                        onClick={() => void triggerAvatar(selectedPersona.id)}
                        disabled={avatarLoadingIds[selectedPersona.id]}
                        className="w-full mb-4 bg-[#1A1A1F] border border-[#26262B] h-9 rounded text-[10px] font-bold tracking-wider hover:border-[#F27D26] transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {avatarLoadingIds[selectedPersona.id] ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            GENERATING AVATAR
                          </>
                        ) : selectedPersona.avatarUrl ? (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            REGENERATE AVATAR
                          </>
                        ) : (
                          <>
                            <ImagePlus className="w-4 h-4" />
                            GENERATE AVATAR
                          </>
                        )}
                      </button>
                      <div className="space-y-2 mt-auto">
                        <div className="flex items-center justify-between text-[10px] border-b border-[#26262B] pb-1">
                          <span className="opacity-40">GEN_ID</span>
                          <span>{selectedPersona.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] border-b border-[#26262B] pb-1">
                          <span className="opacity-40">SYNC_DATE</span>
                          <span>
                            {new Date(selectedPersona.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] border-b border-[#26262B] pb-1">
                          <span className="opacity-40">TEXT_MODEL</span>
                          <span className="truncate ml-3 text-right">
                            {selectedPersona.generationModel ?? "n/a"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] pb-1">
                          <span className="opacity-40">IMG_MODEL</span>
                          <span className="truncate ml-3 text-right">
                            {selectedPersona.avatarModel ?? "pending"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                      <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                          <Brain className="w-3 h-3" /> Core Psychology
                        </h3>
                        <p className="text-sm leading-relaxed text-[#B0B0B8] whitespace-pre-line">
                          {selectedPersona.psychology}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                            <Briefcase className="w-3 h-3" /> Behavioral Model
                          </h3>
                          <p className="text-xs leading-relaxed text-[#B0B0B8] whitespace-pre-line">
                            {selectedPersona.behavior}
                          </p>
                        </div>
                        <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Competencies
                          </h3>
                          <ul className="space-y-2">
                            {selectedPersona.competencies.map((competency, index) => (
                              <li key={competency} className="text-[10px] flex items-center gap-2">
                                <span className="text-[#F27D26]">
                                  {String(index + 1).padStart(2, "0")}
                                </span>
                                {competency}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <Terminal className="w-12 h-12 mb-4" />
                  <p className="text-xs">
                    {isLoading ? "Loading personas..." : "No active persona in buffer"}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-[#26262B] bg-[#111115] p-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">
                    Subject Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. Elias Thorne"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">
                    Background
                  </label>
                  <input
                    type="text"
                    value={background}
                    onChange={(event) => setBackground(event.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. B2B SaaS Growth Strategist"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">
                    Skills (Optional)
                  </label>
                  <input
                    type="text"
                    value={competencies}
                    onChange={(event) => setCompetencies(event.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. CRM, GTM, Negotiation"
                  />
                </div>
                <button
                  onClick={() => void generatePersona()}
                  disabled={isGenerating || !name.trim() || !background.trim()}
                  className="bg-[#F27D26] text-black h-9 flex items-center justify-center gap-2 font-bold text-[11px] disabled:opacity-30 hover:bg-[#ff8c3a] transition-colors rounded shadow-[0_0_15px_rgba(242,125,38,0.2)]"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      GENERATING...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-black" />
                      GENERATE IDENTITY
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #26262B;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #3A3A40;
        }
      `}</style>
    </div>
  );
}

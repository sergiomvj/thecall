import React, { useState, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  User, 
  Brain, 
  Briefcase, 
  Zap, 
  Terminal, 
  Loader2, 
  Plus, 
  History,
  ShieldCheck,
  ChevronRight,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

interface Persona {
  id: string;
  name: string;
  role: string;
  psychology: string;
  competencies: string[];
  behavior: string;
  timestamp: string;
}

export default function App() {
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [competencies, setCompetencies] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("personas");
    if (saved) {
      const parsed = JSON.parse(saved);
      setPersonas(parsed);
      if (parsed.length > 0) setSelectedPersona(parsed[0]);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("personas", JSON.stringify(personas));
  }, [personas]);

  const generatePersona = async () => {
    if (!name || !background) return;
    setIsGenerating(true);
    
    try {
      const prompt = `Generate a detailed virtual persona profile based on the following:
      Name: ${name}
      Background: ${background}
      Competencies: ${competencies}

      Return a JSON object with the following fields:
      - role: A concise professional role or title
      - psychology: A deep psychological profile (2-3 paragraphs)
      - competencies: An array of 5 specific high-level skills/competencies
      - behavior: A description of typical behavioral tendencies and communication style
      
      Response must be ONLY the JSON object.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-latest",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || "{}");
      
      const newPersona: Persona = {
        id: crypto.randomUUID(),
        name,
        timestamp: new Date().toISOString(),
        ...data
      };

      setPersonas(prev => [newPersona, ...prev]);
      setSelectedPersona(newPersona);
      setName("");
      setBackground("");
      setCompetencies("");
      
    } catch (error) {
      console.error("Generation failed:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F0F11] text-[#E0E0E6] font-mono selection:bg-[#F27D26] selection:text-white overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-[#26262B] p-4 flex items-center justify-between bg-[#15151A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#F27D26] rounded flex items-center justify-center">
            <Brain className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-sm font-bold tracking-widest uppercase">
            Virtual Persona Generator <span className="text-[#F27D26] ml-2">v3.1.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-6 text-[10px] text-[#8E9299]">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3" />
            <span>SYSTEM READY</span>
          </div>
          <div className="flex items-center gap-2 text-[#4CAF50]">
            <ShieldCheck className="w-3 h-3" />
            <span>ENCRYPTED</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - History */}
        <aside className="w-64 border-r border-[#26262B] flex flex-col bg-[#111115]">
          <div className="p-4 border-b border-[#26262B] flex items-center justify-between">
            <h2 className="text-[10px] uppercase tracking-tighter opacity-50 font-bold flex items-center gap-2">
              <History className="w-3 h-3" /> Archive
            </h2>
            <span className="text-[10px] bg-[#26262B] px-1.5 py-0.5 rounded">{personas.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPersona(p)}
                className={`w-full text-left p-3 rounded mb-1 transition-all group ${
                  selectedPersona?.id === p.id 
                    ? "bg-[#26262B] border border-[#3A3A40]" 
                    : "hover:bg-[#1A1A1E]"
                }`}
              >
                <div className="text-[11px] font-bold truncate group-hover:text-[#F27D26] transition-colors">
                  {p.name}
                </div>
                <div className="text-[9px] opacity-40 truncate">{p.role}</div>
              </button>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <section className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top Bar - Form Toggle or Status */}
          <div className="bg-[#15151A] border-b border-[#26262B] p-4 flex justify-between items-center">
            <nav className="flex items-center gap-8 text-[11px]">
              <button className="text-[#F27D26] border-b border-[#F27D26] pb-1">OVERVIEW</button>
              <button className="opacity-40 hover:opacity-100 transition-opacity">PSYCHOLOGY</button>
              <button className="opacity-40 hover:opacity-100 transition-opacity">COMPETENCIES</button>
            </nav>
            <div className="text-[10px] opacity-40 italic">
              Terminal Session: {new Date().toLocaleTimeString()}
            </div>
          </div>

          {/* Main Visualizer */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat">
            <AnimatePresence mode="wait">
              {selectedPersona ? (
                <motion.div
                  key={selectedPersona.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-4xl mx-auto space-y-6"
                >
                  {/* Persona Identity Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 bg-[#15151A] border border-[#26262B] p-6 rounded relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#F27D26]/5 rounded-bl-full -mr-12 -mt-12 group-hover:bg-[#F27D26]/10 transition-colors" />
                      <div className="w-16 h-16 bg-[#26262B] rounded-full flex items-center justify-center mb-4 border border-[#3A3A40]">
                        <User className="w-8 h-8 text-[#F27D26]" />
                      </div>
                      <h2 className="text-xl font-bold tracking-tight mb-1">{selectedPersona.name}</h2>
                      <div className="text-[10px] text-[#F27D26] uppercase font-bold tracking-[0.2em] mb-4">
                        {selectedPersona.role}
                      </div>
                      <div className="space-y-2 mt-auto">
                        <div className="flex items-center justify-between text-[10px] border-b border-[#26262B] pb-1">
                          <span className="opacity-40">GEN_ID</span>
                          <span>{selectedPersona.id.slice(0, 8)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] border-b border-[#26262B] pb-1">
                          <span className="opacity-40">SYNC_DATE</span>
                          <span>{new Date(selectedPersona.timestamp).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-6">
                      <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                          <Brain className="w-3 h-3" /> Core Psychology
                        </h3>
                        <p className="text-sm leading-relaxed text-[#B0B0B8]">
                          {selectedPersona.psychology}
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                            <Briefcase className="w-3 h-3" /> Behavioral Model
                          </h3>
                          <p className="text-xs leading-relaxed text-[#B0B0B8]">
                            {selectedPersona.behavior}
                          </p>
                        </div>
                        <div className="bg-[#15151A] border border-[#26262B] p-6 rounded">
                          <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#8E9299] mb-4 flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Competencies
                          </h3>
                          <ul className="space-y-2">
                            {selectedPersona.competencies.map((c, i) => (
                              <li key={i} className="text-[10px] flex items-center gap-2">
                                <span className="text-[#F27D26]">0{i+1}</span> {c}
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
                  <p className="text-xs">No active persona in buffer</p>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Fab/Input Drawer */}
          <div className="border-t border-[#26262B] bg-[#111115] p-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">Subject Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. Elias Thorne"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">Background</label>
                  <input
                    type="text"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. Cyberpunk Noir Specialist"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-[9px] font-bold uppercase mb-2 block opacity-40">Skills (Optional)</label>
                  <input
                    type="text"
                    value={competencies}
                    onChange={(e) => setCompetencies(e.target.value)}
                    className="w-full bg-[#1A1A1F] border border-[#26262B] p-2 text-xs focus:border-[#F27D26] outline-none rounded"
                    placeholder="e.g. Hacking, Social Engineering"
                  />
                </div>
                <button
                  onClick={generatePersona}
                  disabled={isGenerating || !name || !background}
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

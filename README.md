<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TheCall Persona Generator

App React + Express para gerar personas profissionais com:

- texto via OpenRouter com `openrouter/free`, fallback automatico para outros modelos free e opcionalmente modelos de baixo custo
- persistencia com Prisma + SQLite
- protecao basica contra perfis excessivamente semelhantes
- avatar profissional gerado via Gemini no backend

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example`
3. Set:
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` opcional, default `openrouter/free`
   - `OPENROUTER_FALLBACK_MODELS` opcional, lista separada por virgula
   - `OPENROUTER_USE_LOW_COST_MODELS` opcional, default `true`
   - `OPENROUTER_LOW_COST_MODELS` opcional, lista separada por virgula
   - `GEMINI_API_KEY`
   - `DATABASE_URL`
4. Generate Prisma client:
   `npm run db:generate`
5. Initialize the SQLite database:
   `npm run db:init`
6. Start frontend + backend:
   `npm run dev`

Client runs on `http://localhost:3000` and the API on `http://localhost:3001`.

## OpenRouter fallback order

1. modelo principal configurado em `OPENROUTER_MODEL`
2. modelos free em `OPENROUTER_FALLBACK_MODELS`
3. modelos de baixo custo em `OPENROUTER_LOW_COST_MODELS` quando `OPENROUTER_USE_LOW_COST_MODELS=true`

Isso ajuda quando os modelos free ficam saturados, mas a terceira camada pode gerar cobranca na conta OpenRouter.

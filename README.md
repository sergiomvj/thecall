<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# TheCall Persona Generator

App React + Express para gerar personas profissionais com:

- texto via OpenRouter com `google/gemma-4-31b-it:free`
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
   - `GEMINI_API_KEY`
   - `DATABASE_URL`
4. Generate Prisma client:
   `npm run db:generate`
5. Initialize the SQLite database:
   `npm run db:init`
6. Start frontend + backend:
   `npm run dev`

Client runs on `http://localhost:3000` and the API on `http://localhost:3001`.

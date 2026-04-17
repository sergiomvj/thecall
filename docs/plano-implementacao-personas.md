# Plano de Implementacao: Personas com OpenRouter, Prisma e Avatar Profissional

> Status: draft tecnico executavel
> Baseado no estado atual do projeto em `src/App.tsx`, sem documentos canonicos `fbr-arquitetura.md`, `securitycoderules.md` ou `DESIGN_STANDARDS.md` presentes no workspace.
> Consequencia: este plano e detalhado o suficiente para execucao, mas deve ser alinhado antes da implementacao final caso exista uma arquitetura FBR oficial fora deste repositorio.

## 1. Definicao de Sistema

```text
SISTEMA: TheCall Persona Generator
PROPOSITO: gerar, persistir e diferenciar personas profissionais com texto e avatar visual
TIPO: Modulo Interno
CANAL FBR-CLICK: N/A
OWNER: Full-stack app owner
```

## 2. Objetivo das Mudancas

O sistema atual gera personas diretamente no frontend usando `@google/genai`, persiste os dados somente em `localStorage` e nao possui pipeline de imagem. As mudancas propostas introduzem:

1. geracao de texto via OpenRouter usando o modelo `google/gemma-4-31b-it:free`
2. persistencia relacional simples com Prisma para historico e comparacao entre personas
3. geracao de avatar profissional com Gemini, usando um fluxo dedicado de prompt de imagem
4. mecanismos concretos para reduzir perfis excessivamente semelhantes

## 3. Estado Atual do Projeto

### 3.1 Componentes existentes

- App React/Vite single-page em `src/App.tsx`
- chamada direta de IA no cliente
- armazenamento local em `localStorage`
- ausencia de backend dedicado para orquestracao de IA
- ausencia de banco de dados, migrations e camada de repositorio
- ausencia de pipeline de upload, armazenamento ou exibicao de avatar

### 3.2 Problemas tecnicos atuais

- segredo de IA nao deve permanecer acessivel no frontend
- nao existe fonte de verdade compartilhada entre sessoes/dispositivos
- nao existe comparacao semantica entre personas geradas
- nao existe trilha de auditoria de prompts, resposta, falhas e versoes de modelo
- nao existe estrutura para imagens derivadas do perfil

## 4. Escopo das Implementacoes

### 4.1 Em escopo

- mover a geracao textual para backend/server route
- integrar OpenRouter com `google/gemma-4-31b-it:free`
- adicionar Prisma com schema minimo e migrations
- persistir personas, metadados de geracao e sinais de similaridade
- criar heuristica para bloquear ou alertar perfis muito parecidos
- gerar avatar profissional com Gemini em etapa separada ou encadeada
- atualizar UI para consumir API propria em vez de SDK direto no browser
- exibir avatar, status de geracao e feedback de similaridade

### 4.2 Fora de escopo

- autenticacao multiusuario completa
- billing, quotas por usuario e rate-limit distribuido
- busca vetorial externa com pgvector, Pinecone ou equivalente
- workflow complexo de aprovacao editorial
- armazenamento definitivo em cloud bucket com CDN, salvo se for requisito da implantacao

## 5. Arquitetura Alvo

## 5.1 Visao em camadas

```text
Frontend React
  -> chama API interna /api/personas
API interna
  -> modulo de validacao e normalizacao de input
  -> modulo de similaridade
  -> modulo de geracao textual via OpenRouter
  -> modulo de geracao de avatar via Gemini
  -> modulo de persistencia Prisma
Banco relacional via Prisma
  -> personas
  -> logs/artefatos de geracao
  -> sinais de similaridade
Armazenamento de avatar
  -> inicialmente arquivo local ou data URL persistida
  -> opcionalmente migravel para objeto externo depois
```

## 5.2 Decisao principal de arquitetura

Toda chamada para modelos deve sair do frontend e ir para um backend proprio, mesmo que inicialmente seja um servidor Express simples dentro do mesmo projeto. Isso reduz exposicao de segredo, permite validacao, logging e aplicacao das regras anti-duplicidade antes de persistir o registro.

## 6. Entidades Centrais

### 6.1 Entidade Persona

```text
ENTIDADE: Persona
ATRIBUTOS OBRIGATORIOS:
  id: String
  name: String
  role: String
  psychology: String
  behavior: String
  competenciesJson: Json
  background: String
  sourcePrompt: String
  normalizedFingerprint: String
  similarityScoreMax: Float
  status: String
  createdAt: DateTime
  updatedAt: DateTime
ATRIBUTOS OPCIONAIS:
  avatarUrl?: String
  avatarPrompt?: String
  generationModel?: String
  avatarModel?: String
  rejectionReason?: String
INVARIANTES:
  - toda persona persistida possui nome, background e texto gerado validado
  - competenciesJson sempre contem uma lista serializavel
  - normalizedFingerprint sempre e derivado de campos textuais normalizados
  - status pertence ao conjunto DRAFT | GENERATED | REJECTED_SIMILAR | AVATAR_PENDING | READY | FAILED
RELACIONAMENTOS:
  - Persona ->[1:N]-> PersonaSimilarity via sourcePersonaId
  - Persona ->[1:N]-> GenerationLog via personaId
CICLO DE VIDA: [DRAFT -> GENERATED -> AVATAR_PENDING -> READY]
```

### 6.2 Entidade PersonaSimilarity

```text
ENTIDADE: PersonaSimilarity
ATRIBUTOS OBRIGATORIOS:
  id: String
  sourcePersonaId: String
  comparedPersonaId: String
  score: Float
  reason: String
  createdAt: DateTime
ATRIBUTOS OPCIONAIS:
  blockingThreshold?: Float
INVARIANTES:
  - score sempre entre 0 e 1
  - sourcePersonaId nunca e igual a comparedPersonaId
RELACIONAMENTOS:
  - PersonaSimilarity ->[N:1]-> Persona via sourcePersonaId
  - PersonaSimilarity ->[N:1]-> Persona via comparedPersonaId
CICLO DE VIDA: [CREATED]
```

### 6.3 Entidade GenerationLog

```text
ENTIDADE: GenerationLog
ATRIBUTOS OBRIGATORIOS:
  id: String
  personaId: String
  kind: String
  provider: String
  model: String
  promptHash: String
  success: Boolean
  createdAt: DateTime
ATRIBUTOS OPCIONAIS:
  responseExcerpt?: String
  errorMessage?: String
  latencyMs?: Int
INVARIANTES:
  - nenhum secret e persistido no log
  - promptHash e derivado do prompt bruto sem expor o conteudo sensivel por padrao
RELACIONAMENTOS:
  - GenerationLog ->[N:1]-> Persona via personaId
CICLO DE VIDA: [CREATED]
```

## 7. Fluxos Algoritmicos

### 7.1 Fluxo de Geracao de Persona

```text
FLUXO: GeneratePersona
TRIGGER: POST /api/personas
PRE-CONDICOES:
  - name foi informado
  - background foi informado
  - OPENROUTER_API_KEY esta configurada
PASSOS:
  1. Receber payload com name, background e competencies opcionais.
  2. Validar tamanho, caracteres invalidos e campos obrigatorios.
  3. Normalizar os campos textuais para comparacao interna.
  4. Buscar personas recentes no banco para comparacao.
  5. Calcular fingerprint textual e score de similaridade preliminar.
  6. SE score >= limiar de bloqueio ENTAO abortar com alerta de similaridade.
  7. Montar prompt estruturado para OpenRouter exigindo JSON estrito.
  8. CHAMAR OpenRouter chat completion com modelo `google/gemma-4-31b-it:free`.
  9. Validar JSON retornado e aplicar fallback/retry se vier malformado.
  10. Recalcular similaridade agora usando campos gerados.
  11. SE score final >= limiar de bloqueio ENTAO persistir como REJECTED_SIMILAR ou retornar bloqueio sem salvar como pronta.
  12. Persistir persona com status GENERATED ou AVATAR_PENDING.
  13. Persistir logs e relacoes de similaridade.
  14. Retornar payload da persona para o frontend.
POS-CONDICOES:
  - existe um registro persistido ou uma rejeicao deterministica
  - o frontend recebe um resultado estruturado
CASOS DE FALHA:
  - SE OpenRouter falhar: registrar log, retornar erro controlado 502/500
  - SE JSON invalido: aplicar no maximo N retries e falhar com erro explicito
  - SE banco falhar: nao retornar sucesso parcial enganoso
INVARIANTES DE SEGURANCA:
  - a chave OpenRouter nunca chega ao cliente
  - prompts e respostas sao sanitizados antes de logar
```

### 7.2 Fluxo de Geracao de Avatar

```text
FLUXO: GenerateAvatar
TRIGGER: POST /api/personas/:id/avatar ou etapa encadeada apos persona gerada
PRE-CONDICOES:
  - persona existe
  - Gemini API key esta configurada
  - persona possui role, psychology e background suficientes
PASSOS:
  1. Ler dados da persona.
  2. Construir prompt visual profissional com restricoes de realismo, enquadramento e branding humano.
  3. Incluir lista de proibicoes visuais para evitar resultado caricatural ou amador.
  4. CHAMAR Gemini image generation para obter avatar.
  5. Converter o resultado para formato persistivel.
  6. Salvar artefato de avatar e URL associada.
  7. Atualizar persona para READY.
  8. Registrar log de geracao de imagem.
POS-CONDICOES:
  - persona passa a ter avatarUrl valido
CASOS DE FALHA:
  - SE geracao de imagem falhar: manter persona sem avatar e status AVATAR_PENDING ou FAILED
INVARIANTES DE SEGURANCA:
  - nenhum binario bruto e salvo sem validacao de tipo/tamanho
```

### 7.3 Fluxo de Prevencao de Similaridade Excessiva

```text
FLUXO: PreventOverSimilarity
TRIGGER: antes e depois da geracao textual
PRE-CONDICOES:
  - existe um conjunto de personas persistidas para comparar
PASSOS:
  1. Normalizar name, background, competencies e texto gerado.
  2. Construir fingerprint deterministico usando campos canonicos.
  3. Comparar por:
     a. igualdade exata de nome/background normalizados
     b. sobreposicao forte de competencias
     c. distancia textual simples em role/behavior
     d. heuristica ponderada final
  4. Classificar em:
     - baixo risco
     - alerta
     - bloqueio
  5. Persistir scores relevantes para auditoria.
POS-CONDICOES:
  - toda persona tem scoreMax calculado
CASOS DE FALHA:
  - SE nao houver base suficiente: seguir com heuristica minima
INVARIANTES DE SEGURANCA:
  - a regra de bloqueio deve ser explicavel e reproduzivel
```

## 8. Contratos de Interface

### 8.1 Criar persona

```text
CONTRATO: CreatePersona
TIPO: REST
DIRECAO: Frontend -> API interna
AUTENTICACAO: N/A na primeira iteracao
PAYLOAD:
  {
    name: string,
    background: string,
    competencies?: string
  }
RESPOSTA_SUCESSO:
  201 {
    persona: PersonaDTO,
    similarity: {
      maxScore: number,
      decision: "allow" | "warn" | "block",
      reasons: string[]
    }
  }
RESPOSTA_ERRO:
  400 validacao
  409 similaridade bloqueante
  500/502 integracao externa
IDEMPOTENTE: NAO
RATE_LIMIT: NAO na primeira iteracao
```

### 8.2 Listar personas

```text
CONTRATO: ListPersonas
TIPO: REST
DIRECAO: Frontend -> API interna
AUTENTICACAO: N/A na primeira iteracao
PAYLOAD: {}
RESPOSTA_SUCESSO:
  200 {
    personas: PersonaDTO[]
  }
RESPOSTA_ERRO:
  500
IDEMPOTENTE: SIM
RATE_LIMIT: NAO
```

### 8.3 Gerar avatar

```text
CONTRATO: GeneratePersonaAvatar
TIPO: REST
DIRECAO: Frontend -> API interna
AUTENTICACAO: N/A na primeira iteracao
PAYLOAD:
  {
    regenerate?: boolean
  }
RESPOSTA_SUCESSO:
  200 {
    personaId: string,
    avatarUrl: string,
    status: string
  }
RESPOSTA_ERRO:
  404
  409 se persona ainda nao esta apta
  500/502 integracao externa
IDEMPOTENTE: NAO
RATE_LIMIT: NAO
```

## 9. Modelagem Prisma Proposta

## 9.1 Schema inicial

```prisma
model Persona {
  id                    String             @id @default(cuid())
  name                  String
  background            String
  role                  String
  psychology            String             @db.Text
  behavior              String             @db.Text
  competenciesJson      Json
  sourcePrompt          String             @db.Text
  normalizedFingerprint String
  similarityScoreMax    Float              @default(0)
  status                String
  avatarUrl             String?
  avatarPrompt          String?            @db.Text
  generationModel       String?
  avatarModel           String?
  rejectionReason       String?            @db.Text
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  generationLogs        GenerationLog[]
  similaritiesFrom      PersonaSimilarity[] @relation("SimilaritySource")
  similaritiesTo        PersonaSimilarity[] @relation("SimilarityTarget")

  @@index([createdAt])
  @@index([normalizedFingerprint])
  @@index([status])
}

model PersonaSimilarity {
  id                String   @id @default(cuid())
  sourcePersonaId   String
  comparedPersonaId String
  score             Float
  reason            String
  blockingThreshold Float?
  createdAt         DateTime @default(now())

  sourcePersona     Persona  @relation("SimilaritySource", fields: [sourcePersonaId], references: [id])
  comparedPersona   Persona  @relation("SimilarityTarget", fields: [comparedPersonaId], references: [id])

  @@index([sourcePersonaId])
  @@index([comparedPersonaId])
}

model GenerationLog {
  id              String   @id @default(cuid())
  personaId       String
  kind            String
  provider        String
  model           String
  promptHash      String
  success         Boolean
  responseExcerpt String?  @db.Text
  errorMessage    String?  @db.Text
  latencyMs       Int?
  createdAt       DateTime @default(now())

  persona         Persona  @relation(fields: [personaId], references: [id])

  @@index([personaId, createdAt])
}
```

## 9.2 Banco recomendado

- desenvolvimento inicial: SQLite com Prisma para reduzir atrito
- evolucao previsivel: Postgres sem trocar modelo conceitual
- decisao: iniciar com SQLite se o objetivo for iteracao rapida local, mantendo campos e indexes compatveis com migracao futura

## 10. Estrategia Anti-Perfis Semelhantes

## 10.1 Objetivo

Evitar que o sistema gere varias personas com o mesmo papel, tom psicologico e pacote de competencias, apenas com nomes cosmeticamente diferentes.

## 10.2 Estrategia em camadas

### Camada A: pre-checagem deterministica

- normalizar caixa, acentos, espacos e pontuacao
- gerar assinatura a partir de `name + background + competencias`
- bloquear duplicatas exatas

### Camada B: score heuristico ponderado

Calcular score final entre `0` e `1`:

- `0.30` para semelhanca de `background`
- `0.20` para sobreposicao de `competencies`
- `0.20` para semelhanca de `role`
- `0.20` para semelhanca de `behavior`
- `0.10` para semelhanca de `psychology`

### Camada C: thresholds operacionais

- `< 0.55`: permitir
- `>= 0.55 e < 0.75`: permitir com alerta
- `>= 0.75`: bloquear ou exigir regeneracao

### Camada D: variacao guiada por prompt

Quando houver alerta de similaridade, o prompt do modelo deve incluir instrucoes explicitas como:

- variar senioridade
- variar combinacao de competencias
- variar estilo comunicacional
- variar nicho de atuacao
- evitar arquetipos ja existentes na base

## 10.3 Evolucao futura opcional

Se a heuristica simples se mostrar insuficiente, adicionar embeddings depois, sem tornar isso pre-requisito do primeiro release.

## 11. Integracao OpenRouter

## 11.1 Decisao tecnica

Substituir a chamada atual `GoogleGenAI` no frontend por uma chamada server-side para OpenRouter usando fetch HTTP padrao.

## 11.2 Requisitos

- usar `OPENROUTER_API_KEY` somente no servidor
- definir `HTTP-Referer` e `X-Title` quando recomendavel
- exigir resposta em JSON estrito
- implementar timeout, retry curto e tratamento de erro sem vazar segredo

## 11.3 Payload esperado

Endpoint OpenRouter:

- `POST https://openrouter.ai/api/v1/chat/completions`

Campos principais:

- `model: "google/gemma-4-31b-it:free"`
- `messages`
- `response_format` se suportado pelo fluxo adotado
- `temperature` moderada para diversidade controlada

## 11.4 Estrutura de modulo sugerida

```text
server/
  app.ts
  routes/personas.ts
  services/openrouter.ts
  services/gemini-avatar.ts
  services/persona-similarity.ts
  services/persona-repository.ts
  lib/env.ts
  lib/prisma.ts
```

## 12. Integracao Gemini para Avatar

## 12.1 Objetivo visual

Gerar uma imagem de apresentacao profissional coerente com a persona, com aparencia de retrato de negocio/editorial, evitando estilo fantasioso, sexualizado, meme ou caricatura.

## 12.2 Especificacao do prompt visual

O prompt deve derivar de:

- role
- background
- psychology em termos resumidos
- competencias principais
- direcionamento visual profissional

Restricoes recomendadas:

- headshot ou bust portrait
- fundo limpo ou corporativo discreto
- iluminacao editorial
- roupa profissional coerente com o nicho
- sem texto na imagem
- sem watermark
- sem exagero cinematografico inutil

## 12.3 Persistencia do avatar

Primeira iteracao:

- salvar em disco local controlado pelo backend ou persistir string/base64 com caminho derivado

Evolucao posterior:

- mover para bucket e salvar somente URL final

## 12.4 UX de avatar

- gerar avatar automaticamente apos a persona ou por botao separado
- exibir estado `gerando avatar`
- permitir regeneracao manual
- exibir fallback visual enquanto nao houver imagem

## 13. Mudancas de Frontend

## 13.1 Refactor obrigatorio

- remover uso direto de `@google/genai` do `src/App.tsx`
- substituir `localStorage` como fonte primaria por chamadas a API
- carregar personas via `GET /api/personas`
- gerar persona via `POST /api/personas`
- gerar avatar via endpoint dedicado

## 13.2 Ajustes de interface

- adicionar preview de avatar no card principal
- mostrar status do registro: `READY`, `AVATAR_PENDING`, `REJECTED_SIMILAR`, `FAILED`
- mostrar alerta de similaridade quando houver
- mostrar provider/modelo em detalhes tecnicos opcionais
- adicionar estado de erro claro para falhas de IA e banco

## 13.3 Estrutura de estado sugerida

- `personas`
- `selectedPersonaId`
- `createStatus`
- `avatarStatusByPersona`
- `errorBanner`

## 14. Configuracao e Ambiente

## 14.1 Variaveis de ambiente

- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `DATABASE_URL`
- `APP_URL` opcional para metadados do provider

## 14.2 Medidas obrigatorias

- remover qualquer segredo real commitado em arquivos versionados
- manter `.env.example` sem chaves reais
- carregar env apenas no servidor

## 15. Plano de Batches

### BATCH: 1 - Fundacao Server-Side
```text
DIAS: 1-2
PARALELO_COM: N/A
OBJETIVO_ALGORITMICO: mover geracao e persistencia basica para backend

PRE-REQUISITOS:
  - definicao do runtime de servidor no projeto Vite

ESCOPO:
  - criar servidor Express
  - criar camada de env
  - criar endpoints iniciais de persona
  - remover chamada direta do modelo no browser

FORA DE ESCOPO:
  - avatar final
  - refinamento avancado de similaridade

CRITERIOS DE DONE DO BATCH:
  [ ] frontend nao usa mais segredo de IA
  [ ] persona pode ser gerada via API interna
  [ ] erros sao retornados de forma controlada
```

### BATCH: 2 - Prisma e Persistencia
```text
DIAS: 2-3
PARALELO_COM: Batch 3
OBJETIVO_ALGORITMICO: persistir personas, logs e scores

PRE-REQUISITOS:
  - batch 1 concluido

ESCOPO:
  - adicionar prisma
  - criar schema inicial
  - criar migration
  - substituir localStorage como fonte principal

FORA DE ESCOPO:
  - embeddings

CRITERIOS DE DONE DO BATCH:
  [ ] personas persistem no banco
  [ ] listagem vem do banco
  [ ] logs de geracao sao armazenados
```

### BATCH: 3 - Anti-Similaridade
```text
DIAS: 3-4
PARALELO_COM: Batch 2
OBJETIVO_ALGORITMICO: detectar e reduzir perfis excessivamente parecidos

PRE-REQUISITOS:
  - acesso a personas persistidas

ESCOPO:
  - fingerprint normalizado
  - score heuristico
  - threshold de alerta/bloqueio
  - feedback no frontend

FORA DE ESCOPO:
  - busca vetorial externa

CRITERIOS DE DONE DO BATCH:
  [ ] duplicatas exatas sao bloqueadas
  [ ] scores ficam auditaveis
  [ ] UI comunica alerta e bloqueio
```

### BATCH: 4 - Avatar Profissional
```text
DIAS: 4-5
PARALELO_COM: N/A
OBJETIVO_ALGORITMICO: gerar e exibir avatar coerente com a persona

PRE-REQUISITOS:
  - batch 1 concluido
  - batch 2 preferencialmente concluido

ESCOPO:
  - servico Gemini avatar
  - endpoint de geracao de imagem
  - persistencia da imagem
  - exibicao no frontend

FORA DE ESCOPO:
  - editor de imagem
  - multiplas poses e galerias

CRITERIOS DE DONE DO BATCH:
  [ ] persona pronta pode receber avatar
  [ ] avatar aparece na UI
  [ ] falhas de imagem nao corrompem o registro
```

### BATCH: 5 - Hardening e Qualidade
```text
DIAS: 5-6
PARALELO_COM: N/A
OBJETIVO_ALGORITMICO: consolidar robustez, testes e higiene operacional

PRE-REQUISITOS:
  - batches anteriores concluidos

ESCOPO:
  - testes de contrato
  - testes de similaridade
  - validacoes de env
  - limpeza de segredos e docs

FORA DE ESCOPO:
  - observabilidade enterprise

CRITERIOS DE DONE DO BATCH:
  [ ] fluxo principal coberto por testes
  [ ] segredos nao aparecem no cliente
  [ ] README e setup atualizados
```

## 16. Tasks Tecnicas

### TASK: 1-01 - Criar estrutura de servidor
```text
BATCH: 1
DOMINIO: Backend
ESTIMATIVA: 3h
DEPENDE DE: N/A

OBJETIVO ALGORITMICO:
  Implementar a base do fluxo GeneratePersona.

INPUT:
  - package.json atual
  - src/App.tsx atual

OUTPUT ESPERADO:
  - server/app.ts
  - script de dev/build ajustado

ESPECIFICACAO TECNICA:
  Subir Express com rotas JSON, CORS local se necessario, healthcheck e base /api.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - nenhum segredo exposto ao cliente

CASOS DE BORDA OBRIGATORIOS:
  [ ] servidor responde health sem banco
  [ ] erro interno retorna JSON consistente
  [ ] payload invalido recebe 400

CRITERIO DE DONE:
  [ ] servidor sobe localmente
  [ ] endpoint /api/health responde
  [ ] frontend consegue chamar API local

NAO FAZER NESTA TASK:
  - integrar Prisma
```

### TASK: 1-02 - Implementar cliente OpenRouter
```text
BATCH: 1
DOMINIO: Integracao
ESTIMATIVA: 3h
DEPENDE DE: TASK 1-01

OBJETIVO ALGORITMICO:
  Implementar a chamada ao modelo textual.

INPUT:
  - OPENROUTER_API_KEY

OUTPUT ESPERADO:
  - server/services/openrouter.ts

ESPECIFICACAO TECNICA:
  Criar wrapper com timeout, retries curtos, parse de erro e resposta JSON padronizada.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - logs nao incluem chave secreta

CASOS DE BORDA OBRIGATORIOS:
  [ ] timeout do provider
  [ ] resposta nao JSON
  [ ] status 429/5xx

CRITERIO DE DONE:
  [ ] servico retorna payload de texto validado
  [ ] falhas sao mapeadas para erros internos padronizados

NAO FAZER NESTA TASK:
  - persistencia no banco
```

### TASK: 1-03 - Migrar frontend para API interna
```text
BATCH: 1
DOMINIO: Frontend
ESTIMATIVA: 4h
DEPENDE DE: TASK 1-02

OBJETIVO ALGORITMICO:
  Consumir CreatePersona sem SDK de IA no browser.

INPUT:
  - src/App.tsx

OUTPUT ESPERADO:
  - src/App.tsx refatorado

ESPECIFICACAO TECNICA:
  Remover `GoogleGenAI`, trocar por fetch para `/api/personas`, tratar loading e erro.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - frontend nao usa API key

CASOS DE BORDA OBRIGATORIOS:
  [ ] falha de rede
  [ ] erro 409 de similaridade
  [ ] resposta parcial invalida

CRITERIO DE DONE:
  [ ] persona e criada via API interna
  [ ] bundle cliente nao contem SDK/segredo de IA

NAO FAZER NESTA TASK:
  - avatar
```

### TASK: 2-01 - Adicionar Prisma e schema inicial
```text
BATCH: 2
DOMINIO: Database
ESTIMATIVA: 3h
DEPENDE DE: TASK 1-01

OBJETIVO ALGORITMICO:
  Implementar entidades Persona, PersonaSimilarity e GenerationLog.

INPUT:
  - modelagem proposta

OUTPUT ESPERADO:
  - prisma/schema.prisma
  - primeira migration
  - server/lib/prisma.ts

ESPECIFICACAO TECNICA:
  Configurar Prisma client, provider inicial e migrations locais.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - schema suportar migracao futura para Postgres

CASOS DE BORDA OBRIGATORIOS:
  [ ] banco vazio
  [ ] migration repetida em ambiente limpo
  [ ] erro de conexao

CRITERIO DE DONE:
  [ ] prisma generate funciona
  [ ] migration aplica com sucesso
  [ ] client e consumivel no servidor

NAO FAZER NESTA TASK:
  - heuristica completa de similaridade
```

### TASK: 2-02 - Persistir persona e logs
```text
BATCH: 2
DOMINIO: Backend
ESTIMATIVA: 4h
DEPENDE DE: TASK 2-01

OBJETIVO ALGORITMICO:
  Completar persistencia do fluxo GeneratePersona.

INPUT:
  - resposta OpenRouter
  - schema Prisma

OUTPUT ESPERADO:
  - server/services/persona-repository.ts
  - rota POST /api/personas persistente

ESPECIFICACAO TECNICA:
  Salvar persona, score, prompt hash e log de sucesso/erro em transacao quando aplicavel.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - nao haver persona pronta sem trilha minima de geracao

CASOS DE BORDA OBRIGATORIOS:
  [ ] falha apos gerar texto e antes de persistir
  [ ] rollback parcial
  [ ] leitura logo apos escrita

CRITERIO DE DONE:
  [ ] persona persiste no banco
  [ ] logs persistem junto
  [ ] listagem reflete novos dados

NAO FAZER NESTA TASK:
  - gerar avatar
```

### TASK: 2-03 - Trocar listagem local por banco
```text
BATCH: 2
DOMINIO: Frontend
ESTIMATIVA: 2h
DEPENDE DE: TASK 2-02

OBJETIVO ALGORITMICO:
  Consumir ListPersonas.

INPUT:
  - endpoint GET /api/personas

OUTPUT ESPERADO:
  - carregamento inicial a partir do backend

ESPECIFICACAO TECNICA:
  Remover dependencia primaria de localStorage, podendo manter cache local apenas auxiliar.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - backend e fonte de verdade

CASOS DE BORDA OBRIGATORIOS:
  [ ] banco vazio
  [ ] erro de carregamento inicial
  [ ] persona selecionada inexistente

CRITERIO DE DONE:
  [ ] refresh da pagina nao perde historico
  [ ] sidebar reflete banco real

NAO FAZER NESTA TASK:
  - modificar regras de similaridade
```

### TASK: 3-01 - Implementar normalizacao e fingerprint
```text
BATCH: 3
DOMINIO: Backend
ESTIMATIVA: 3h
DEPENDE DE: TASK 2-01

OBJETIVO ALGORITMICO:
  Implementar etapa deterministica do fluxo PreventOverSimilarity.

INPUT:
  - campos textuais de entrada e geracao

OUTPUT ESPERADO:
  - server/services/persona-similarity.ts

ESPECIFICACAO TECNICA:
  Criar utilitarios de normalizacao, tokenizacao simples e fingerprint reproduzivel.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - mesma entrada gera mesma assinatura

CASOS DE BORDA OBRIGATORIOS:
  [ ] acentos e caixa
  [ ] competencias vazias
  [ ] strings muito curtas

CRITERIO DE DONE:
  [ ] fingerprint e estavel
  [ ] duplicata exata e detectada

NAO FAZER NESTA TASK:
  - UI de alerta
```

### TASK: 3-02 - Implementar score heuristico e bloqueio
```text
BATCH: 3
DOMINIO: Backend
ESTIMATIVA: 4h
DEPENDE DE: TASK 3-01

OBJETIVO ALGORITMICO:
  Concluir a decisao allow/warn/block.

INPUT:
  - fingerprints
  - personas existentes

OUTPUT ESPERADO:
  - comparacao usada na rota de criacao
  - registros em PersonaSimilarity

ESPECIFICACAO TECNICA:
  Calcular score ponderado, manter top comparacoes e responder decisao com razoes legiveis.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - score sempre entre 0 e 1

CASOS DE BORDA OBRIGATORIOS:
  [ ] base com 1 registro
  [ ] muitos registros
  [ ] empate no limiar

CRITERIO DE DONE:
  [ ] resposta traz decisao reproduzivel
  [ ] comparacoes ficam persistidas

NAO FAZER NESTA TASK:
  - embeddings
```

### TASK: 3-03 - Exibir feedback de similaridade na UI
```text
BATCH: 3
DOMINIO: Frontend
ESTIMATIVA: 2h
DEPENDE DE: TASK 3-02

OBJETIVO ALGORITMICO:
  Comunicar ao usuario quando houve alerta ou bloqueio.

INPUT:
  - payload da API

OUTPUT ESPERADO:
  - banner ou painel de similaridade

ESPECIFICACAO TECNICA:
  Mostrar score, razao e acao sugerida sem poluir a interface.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - mensagem deve ser compreensivel e acionavel

CASOS DE BORDA OBRIGATORIOS:
  [ ] bloqueio total
  [ ] apenas alerta
  [ ] score ausente por falha interna

CRITERIO DE DONE:
  [ ] usuario entende porque a persona foi recusada ou sinalizada

NAO FAZER NESTA TASK:
  - alterar algoritmo de score
```

### TASK: 4-01 - Implementar servico Gemini avatar
```text
BATCH: 4
DOMINIO: Integracao
ESTIMATIVA: 4h
DEPENDE DE: TASK 2-02

OBJETIVO ALGORITMICO:
  Implementar GenerateAvatar.

INPUT:
  - persona persistida
  - GEMINI_API_KEY

OUTPUT ESPERADO:
  - server/services/gemini-avatar.ts

ESPECIFICACAO TECNICA:
  Criar prompt visual profissional, chamar provider e devolver artefato persistivel.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - nada de prompt visual inseguro ou caricatural por default

CASOS DE BORDA OBRIGATORIOS:
  [ ] persona incompleta
  [ ] provider sem imagem
  [ ] timeout

CRITERIO DE DONE:
  [ ] servico retorna avatar valido ou erro explicito

NAO FAZER NESTA TASK:
  - ajustes finos de galeria
```

### TASK: 4-02 - Persistir e servir avatar
```text
BATCH: 4
DOMINIO: Backend
ESTIMATIVA: 3h
DEPENDE DE: TASK 4-01

OBJETIVO ALGORITMICO:
  Concluir o armazenamento e a exposicao do avatar.

INPUT:
  - imagem gerada

OUTPUT ESPERADO:
  - endpoint POST /api/personas/:id/avatar
  - estrategia de arquivo/URL

ESPECIFICACAO TECNICA:
  Salvar arquivo ou conteudo em local seguro, atualizar persona e registrar log.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - arquivo salvo com nome deterministico e extensao valida

CASOS DE BORDA OBRIGATORIOS:
  [ ] avatar repetido
  [ ] falha ao salvar arquivo
  [ ] rota chamada duas vezes

CRITERIO DE DONE:
  [ ] persona recebe avatarUrl persistente
  [ ] avatar pode ser reobtido pelo frontend

NAO FAZER NESTA TASK:
  - CDN externa
```

### TASK: 4-03 - Exibir avatar no frontend
```text
BATCH: 4
DOMINIO: Frontend
ESTIMATIVA: 3h
DEPENDE DE: TASK 4-02

OBJETIVO ALGORITMICO:
  Exibir o resultado visual na tela principal.

INPUT:
  - avatarUrl
  - status da persona

OUTPUT ESPERADO:
  - card principal com imagem real ou placeholder

ESPECIFICACAO TECNICA:
  Substituir icone fixo por imagem quando disponivel, com fallback elegante.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - layout continua funcional sem avatar

CASOS DE BORDA OBRIGATORIOS:
  [ ] imagem quebrada
  [ ] avatar ainda gerando
  [ ] regeneracao manual

CRITERIO DE DONE:
  [ ] avatar aparece na persona selecionada
  [ ] fallback continua legivel

NAO FAZER NESTA TASK:
  - crop editor
```

### TASK: 5-01 - Testes de integracao do fluxo principal
```text
BATCH: 5
DOMINIO: Teste
ESTIMATIVA: 4h
DEPENDE DE: TASK 4-03

OBJETIVO ALGORITMICO:
  Validar ponta a ponta o fluxo de criacao e avatar.

INPUT:
  - rotas prontas

OUTPUT ESPERADO:
  - suite de testes para API e regras centrais

ESPECIFICACAO TECNICA:
  Cobrir criacao valida, bloqueio por similaridade, falha de provider e geracao de avatar.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - testes nao dependem de chaves reais em execucao automatizada

CASOS DE BORDA OBRIGATORIOS:
  [ ] mock de provider indisponivel
  [ ] banco limpo
  [ ] retorno malformado do modelo

CRITERIO DE DONE:
  [ ] fluxo principal possui cobertura minima aceitavel
  [ ] regressao basica vira detectavel

NAO FAZER NESTA TASK:
  - e2e visual sofisticado
```

### TASK: 5-02 - Higiene operacional e documentacao
```text
BATCH: 5
DOMINIO: Infra
ESTIMATIVA: 2h
DEPENDE DE: TASK 5-01

OBJETIVO ALGORITMICO:
  Fechar setup e seguranca operacional basica.

INPUT:
  - envs
  - README atual

OUTPUT ESPERADO:
  - README atualizado
  - .env.example limpo
  - instrucoes de setup do banco e providers

ESPECIFICACAO TECNICA:
  Documentar execucao local, migrations, envs e fluxo de avatar.

INVARIANTES QUE ESTA TASK DEVE RESPEITAR:
  - nenhum segredo real em arquivo versionado

CASOS DE BORDA OBRIGATORIOS:
  [ ] setup em maquina limpa
  [ ] ausencia de uma key
  [ ] banco nao inicializado

CRITERIO DE DONE:
  [ ] novo dev consegue subir o projeto
  [ ] repositorio nao expoe segredos reais

NAO FAZER NESTA TASK:
  - automatizacao de deploy
```

## 17. Riscos e Mitigacoes

- Risco: o modelo free do OpenRouter pode ter instabilidade ou indisponibilidade.
  Mitigacao: timeout curto, retry pequeno, mensagens de erro claras e possibilidade futura de fallback de modelo.

- Risco: heuristica simples de similaridade pode gerar falso positivo.
  Mitigacao: separar modo alerta de modo bloqueio e salvar comparacoes para calibracao.

- Risco: geracao de avatar pode ser lenta ou falhar mais que a textual.
  Mitigacao: desacoplar status da persona e status do avatar.

- Risco: armazenamento de imagem em base64 pode crescer demais.
  Mitigacao: preferir arquivo local controlado desde a primeira iteracao.

- Risco: segredos ja presentes em arquivos locais/versionados.
  Mitigacao: revisar imediatamente antes da implementacao e rotacionar chaves se necessario.

## 18. Definition of Done do Projeto

- frontend nao chama mais provider de IA diretamente
- geracao textual usa OpenRouter com `google/gemma-4-31b-it:free`
- personas ficam persistidas via Prisma
- historico resiste a refresh e reinicio
- sistema detecta e trata perfis excessivamente semelhantes
- persona pode receber avatar profissional gerado por Gemini
- UI apresenta texto, avatar, status e feedback de similaridade
- segredos nao ficam expostos no cliente
- setup local esta documentado

## 19. Decisoes para Confirmacao Antes de Codar

- provider inicial do Prisma: SQLite ou Postgres
- avatar sera gerado automaticamente apos cada persona ou via botao manual
- threshold inicial de bloqueio: `0.75` ou outro valor
- estrategia de armazenamento do avatar: disco local no servidor ou objeto externo
- nome oficial do modelo Gemini a ser usado no fluxo de imagem, ja que "Nano Banana 2" parece ser um apelido operacional e nao um identificador tecnico de API


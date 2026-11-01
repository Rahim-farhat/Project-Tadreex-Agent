# Scenarios Platform (Tadreex) — Complete Project Documentation

> Exhaustive reference for the `Project-Tadreex-Agent` repository: purpose, architecture, data model, every API endpoint, the AI conversation engine, the front-end, configuration, deployment, and known quirks.
> Generated from the code at commit `4199f1c` ("managers"), branch `main`.

---

## Table of contents

1. [What the project is](#1-what-the-project-is)
2. [Tech stack](#2-tech-stack)
3. [Repository layout](#3-repository-layout)
4. [High-level architecture](#4-high-level-architecture)
5. [Roles and permissions](#5-roles-and-permissions)
6. [End-to-end user flows](#6-end-to-end-user-flows)
7. [Database schema](#7-database-schema)
8. [Backend (server/)](#8-backend-server)
9. [The AI conversation engine](#9-the-ai-conversation-engine)
10. [REST API reference](#10-rest-api-reference)
11. [Frontend (client/)](#11-frontend-client)
12. [Configuration and environment variables](#12-configuration-and-environment-variables)
13. [Deployment](#13-deployment)
14. [Local development](#14-local-development)
15. [MongoDB → PostgreSQL migration](#15-mongodb--postgresql-migration)
16. [Security model](#16-security-model)
17. [Known quirks, gaps and dead code](#17-known-quirks-gaps-and-dead-code)
18. [Git history](#18-git-history)

---

## 1. What the project is

**Scenarios Platform** (branded *Tadreex Creator* in the AI prompts) is a web application where **clients design VR (virtual reality) training scenarios by chatting with an AI assistant**, and **admins/managers review the results**.

- Built by **Tadreex**, a VR training company. Production host: `scenarios.tadreex.com`.
- The AI assistant follows the **ADDIE** instructional-design method (the info phase is the "Analyse" phase) and is **French-language** throughout (prompts, UI text of the client chat, validation messages).
- Each *project* has a private, unguessable **client link** `/chat/<token>`. The client needs no account: the token is the credential.
- The conversation has two phases of content gathering:
  1. **Info phase** — the assistant asks a configurable list of general questions (audience, goals, context…) one at a time.
  2. **Scenario phase** — the client builds one or more **scenarios**, each a table of **steps**; for each step the assistant asks, one question at a time, for title, gesture action, simulation result, 3D objects, UI, animations/VFX and validation rule.
- Admins configure the question lists (chat fields, scenario fields) and the Groq model/API key from the back office, and review every project's collected answers.

---

## 2. Tech stack

| Layer | Technology |
| --- | --- |
| Web app | **Next.js 16** (App Router, `output: 'standalone'`), **React 18**, TypeScript 5, CSS Modules, `next/font` Inter |
| API | **Express 4**, TypeScript 5 (CommonJS, ES2020), run with `ts-node`/`nodemon` in dev, compiled `tsc` → `dist/` in prod |
| AI | **Groq** via **LangChain** (`@langchain/groq` ^1.3.1, `@langchain/core` ^1.2.3); structured output through **Zod** (^3.25) |
| Database | **PostgreSQL 17** (`pg` ^8.23 pool, max 10 connections); schema applied on every start |
| Auth | **JWT** (`jsonwebtoken`, 7-day expiry) + **bcryptjs** password hashes (salt rounds 10) |
| Legacy import | `mongodb` driver ^6.21 (only used by the one-off migration script) |
| Reverse proxy | **Caddy 2.10** (automatic HTTPS) *or* host **nginx** + certbot |
| Containers | Docker / Docker Compose (Node 24-alpine images, Postgres 17-alpine, Caddy 2.10-alpine) |

Default AI models (changeable at runtime): strong `openai/gpt-oss-120b`, fast `openai/gpt-oss-20b`.

Dependencies by package:

- **server/**: `@langchain/core`, `@langchain/groq`, `bcryptjs`, `cors`, `dotenv`, `express`, `jsonwebtoken`, `mongodb`, `pg`, `zod`; dev: `@types/*`, `nodemon`, `ts-node`, `typescript`.
- **client/**: `next`, `react`, `react-dom`; dev: `@types/node`, `@types/react`, `@types/react-dom`, `typescript`. No UI/state/test libraries — everything (toasts, icons, modals) is hand-written.

There are **no automated tests, no linter config, and no CI config** in the repo.

---

## 3. Repository layout

```
Project-Tadreex-Agent/
├── README.md                     # Deploy + dev guide (VPS, nginx variant, backup)
├── PROJECT_DOCUMENTATION.md      # This file
├── .env.example                  # Production env template (used by docker-compose)
├── .gitignore
├── docker-compose.yml            # Production stack: db, server, client, caddy
├── docker-compose.nginx.yml      # Override: disable caddy, expose apps on 127.0.0.1
├── docker-compose.dev.yml        # Dev: Postgres only on localhost:5435
├── deploy/
│   ├── Caddyfile                 # HTTPS + routing /api → server, rest → client
│   └── nginx-scenarios.conf      # Equivalent nginx site config
├── server/
│   ├── Dockerfile, .dockerignore, .env.example, package.json, tsconfig.json
│   └── src/
│       ├── index.ts              # App bootstrap, middleware, route mounting, error handler
│       ├── config/{db.ts, schema.ts}
│       ├── middleware/{auth.ts, validateId.ts}
│       ├── models/{User, Project, ChatField, ScenarioField, Settings}.ts   # SQL data access
│       ├── controllers/{auth, admin, project, public.project, chatfield, scenariofield, settings, chatbot}.controller.ts
│       ├── routes/{auth, admin, project, public.project, chatfield, scenariofield, chatbot}.routes.ts
│       └── scripts/migrate-from-mongo.ts
└── client/
    ├── Dockerfile, .dockerignore, next.config.js, package.json, tsconfig.json
    ├── public/tadreex.png        # Logo + favicon
    └── src/
        ├── proxy.ts              # Next 16 "proxy" (middleware) guarding /admin
        ├── lib/api.ts            # Session storage + adminFetch + errorMessage
        ├── components/{Icon.tsx, useToast.tsx}
        └── app/
            ├── layout.tsx, page.tsx (redirects to /admin), globals.css
            ├── admin/            # Back office (layout, overview, projects, fields, scenario-fields, settings, managers, users, conversations, login)
            └── chat/             # Public client chat (layout + [token]/page.tsx)
```

Approximate size: ~9,400 lines of source. The two largest files are `server/src/controllers/chatbot.controller.ts` (1,699 lines) and `client/src/app/chat/[token]/page.tsx` (1,761 lines).

---

## 4. High-level architecture

```
                       Browser
                          │  https://scenarios.tadreex.com
                          ▼
            ┌───────────────────────────┐
            │ Caddy (or host nginx)     │  TLS, gzip/zstd, security headers
            └───────┬───────────┬───────┘
          /api/*    │           │   everything else
                    ▼           ▼
          ┌────────────────┐  ┌────────────────────┐
          │ Express API    │  │ Next.js (standalone)│
          │ :5000          │  │ :3000               │
          └───┬────────┬───┘  └────────────────────┘
              │        │
              ▼        ▼
      PostgreSQL 17   Groq API (LangChain ChatGroq)
```

- The browser always calls **relative `/api/...` URLs**. In production the reverse proxy sends `/api/*` straight to Express. In `npm run dev`, `client/next.config.js` has a **rewrite** `/api/:path*` → `${API_URL || NEXT_PUBLIC_API_URL || http://localhost:5000}/api/:path*` (evaluated at **build time**; the client Dockerfile bakes `API_URL=http://server:5000` as a fallback).
- Express is the single source of truth. The Next.js app is purely presentational and holds no server-side data access.
- The server keeps **in-memory state** for the LLM clients (model names, temperatures, API key) and a 30-second cache of active question fields. Both are per-process, which means the API is designed to run as a single instance.
- Startup order (`server/src/index.ts`): verify `JWT_SECRET` → `connectDB()` (apply schema, up to 10 retries 2 s apart) → `ensureAdminUser()` → load model settings from DB into the in-memory LLM config → `app.listen(PORT)`.

---

## 5. Roles and permissions

`users.role` ∈ `admin | manager | user`.

| Capability | admin | manager | user / anonymous client |
| --- | --- | --- | --- |
| Log into back office | ✅ | ✅ | ❌ (login page rejects other roles; API login itself succeeds) |
| See all projects | ✅ (with creator name/username/role) | only own (`created_by = me`) | – |
| Create project | ✅ unlimited | ✅ **max 10** (`403` beyond) | – |
| Rename / change status / edit answers / delete project | any | only own (`403 Access denied: not your project`) | – |
| Manage chat fields, scenario fields | ✅ | ❌ | – |
| AI settings (models, temperature, API key) | ✅ | ❌ | – |
| Create / list / delete managers, list / delete users | ✅ | ❌ | – |
| Use `/chat/<token>` | n/a | n/a | ✅ anyone holding the token |

Enforcement:
- **Server**: `protect` (valid Bearer JWT) and `adminOnly` (role === `admin`) middleware; project controllers add ownership checks for managers.
- **Client**: `admin/layout.tsx` hides admin-only nav groups for managers and shows an "Access Restricted" panel if a manager types an admin-only URL (`/admin/fields`, `/admin/scenario-fields`, `/admin/settings`, `/admin/managers`, `/admin/users`). This is UX only — the server is authoritative.

The first admin is created automatically from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` at API start if no account with that email exists (password ≥ 8 chars, otherwise a warning is logged and nothing is created). Existing accounts are never modified.

---

## 6. End-to-end user flows

### 6.1 Admin/manager flow
1. Open `/admin` → `proxy.ts` redirects to `/admin/login` if there is no `admin_token` cookie.
2. Sign in with **username or email** + password (`POST /api/auth/login`). On success the token goes to `localStorage.token` **and** to the `admin_token` cookie (7 days, `samesite=strict`); the user object goes to `localStorage.user`.
3. Create a project (title) → server generates a 10-char alphanumeric **client token**.
4. Copy the client link (`<origin>/chat/<token>`) and send it to the client.
5. Watch the project move `draft → in_progress → completed`; open the project detail page to see a **preview** of general answers and every scenario's step table, or **edit** answers and status.

### 6.2 Client flow (`/chat/<token>`)
Phases (`projects.phase`): `info → review → scenario → completed`.

1. **Load**: `GET /api/public/projects/:token`. 404 → "Projet introuvable ou lien invalide." The page resumes at the stored phase (progress is persisted server-side, so refreshing or returning later is safe).
2. **Info phase** (`phase = info`): client sends `__init__`; the bot asks the question for `fields[currentStep]`. For each user answer the server validates it (text → LLM validation; radio/checkbox → exact match first, else LLM option-matching). Valid → saved into `answers[field.label]`, `currentStep++`, bot replies with a short acknowledgement + the next question. Invalid → bot re-asks with the rejection reason. A **"Aide" (help)** button sends `__help__` and returns 2–4 clickable AI **suggestions** the user can select (multiple), edit and validate.
3. **Review phase**: after the last field the phase becomes `review`; the client sees all answers, can **edit any answer inline** (`PATCH /api/public/projects/:token/answers`), **reset** the chat, or **confirm**.
4. **Scenario phase**: confirm (`__confirm__`) sets `phase = scenario`, `status = in_progress`, and creates "Scénario 1" if none exists. The client can add / rename / delete scenarios, add / delete steps, and chat per step. A step is complete when every active scenario field has a value; then the bot shows a recap and the user can type modifications. **Finalize** marks a scenario `done`. When all scenarios are done the client can finish the project (`__scenario_done__`) → `phase = completed`, `status = completed` → "Projet terminé !" screen.
5. Navigation helpers: **"Réponses"** (`__back_to_review__`), **"Réinitialiser"** in scenario view (`__reset_scenarios__`, keeps general answers), **"Réinitialiser"** in info/review (`__reset__`, wipes everything and returns to `info`/`draft`).
6. **Rate-limit UX**: if Groq answers 429, the server returns a structured payload and the client shows a dedicated modal with the error details, a "retry after" hint, and a copy-details button.

---

## 7. Database schema

Source: `server/src/config/schema.ts`. Applied (idempotently) on **every API start**; there is no migration framework. IDs are `TEXT` (UUID via `gen_random_uuid()::text` for new rows, 24-hex ObjectIds for rows migrated from MongoDB).

### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | default UUID |
| `name` | TEXT NOT NULL | |
| `username` | TEXT | added later via a `DO` block; backfilled with `LOWER(name)`; unique index on `LOWER(username)` where not null |
| `email` | TEXT NOT NULL UNIQUE | stored lower-cased |
| `password` | TEXT NOT NULL | bcrypt hash |
| `role` | TEXT NOT NULL default `'user'` | CHECK in `admin, manager, user` (constraint is dropped and re-added on each start) |
| `created_at`, `updated_at` | TIMESTAMPTZ | default `now()` |

### `chat_fields` (info-phase questions)
`id`, `label` (also the **key** under which the answer is stored in `projects.answers`), `description` (guidance given to the LLM), `type` (`text|radio|checkbox`), `options TEXT[]`, `required BOOLEAN` default true, `sort_order INTEGER`, `active BOOLEAN` default true, `created_at`, `updated_at`.

### `scenario_fields` (per-step questions)
Same as above plus `key TEXT NOT NULL` (the property name on each step row) and `forbidden TEXT` (what must **not** appear in this field, used to steer/validate the LLM).

### `settings` (single row, `id = 1` enforced by CHECK)
`groq_model_strong` (default `openai/gpt-oss-120b`), `groq_model_fast` (`openai/gpt-oss-20b`), `groq_temperature` (0.1), `groq_fast_temperature` (0.2), `groq_api_key` (nullable), `created_at`, `updated_at`. The row is created with defaults on first read (`INSERT … ON CONFLICT DO UPDATE SET id = settings.id`).

### `projects`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | TEXT PK | |
| `title` | TEXT | |
| `status` | TEXT | `draft` (default) / `in_progress` / `completed` |
| `client_token` | TEXT UNIQUE | 10 chars from `[0-9A-Za-z]`, generated with `crypto.randomInt` |
| `created_by` | TEXT | user id; **no FK**, so deleting a user leaves orphan projects (shown with null creator) |
| `phase` | TEXT | `info` (default) / `review` / `scenario` / `completed` |
| `current_step` | INTEGER | index of the current info field |
| `info_chat_history` | JSONB | `[{role:'user'\|'bot', content}]`, capped at 40 entries |
| `answers` | JSONB default `{"scenes": []}` | keys = chat-field labels; values string or string[] |
| `scenarios` | JSONB default `[]` | array of scenario blocks (see below) |
| `uploaded_files` | JSONB default `[]` | **unused** by current code |
| `sheet_url` | TEXT | **unused** by current code |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

Indexes: `projects_created_at_idx (created_at DESC)`, `projects_created_by_idx (created_by)`.

### JSONB shapes (`server/src/models/Project.ts`)

```ts
IScenarioBlock {
  _id: string;                 // randomUUID
  name: string;                // "Scénario N" by default
  currentField: number;        // legacy, always 0
  chatHistory: IChatTurn[];    // legacy, unused (history lives per step)
  answers: { steps?: Step[] }; // steps live in answers.steps
  builder: { state: 'collecting' | 'done' };
}

Step {                          // created by newStepRow()
  numero: string;               // "1", "2", … (max existing + 1)
  titre, action, resultat, objets3d, ui, animations, validation: string;  // "" until answered
  statut: string;               // default "À faire"
  chatHistory: {role, content}[]; // per-step conversation
  // plus any custom key defined in scenario_fields
}
```

Persistence pattern: controllers load a project as a plain object, mutate it, then call `saveProject()` which rewrites `title, status, phase, current_step, info_chat_history, answers, scenarios, uploaded_files, sheet_url` in one UPDATE (and bumps `updated_at`). There is **no optimistic locking** — concurrent writes to the same project are last-write-wins.

---

## 8. Backend (server/)

### 8.1 Bootstrap — `src/index.ts`
- Exits if `JWT_SECRET` is missing (and `config/db.ts` exits if `DATABASE_URL` is missing).
- `app.disable('x-powered-by')`, `trust proxy = 1`.
- CORS: `origin = CLIENT_URL || http://localhost:3000`, `credentials: true`.
- `express.json({ limit: '1mb' })`.
- Health: `GET /api/health` → `{status:'ok', timestamp}` (used by the Docker HEALTHCHECK).
- Mount order: `/api/auth` · `/api/admin/projects` (protect) · `/api/admin/chatfields` (protect+adminOnly) · `/api/admin/scenario-fields` (protect+adminOnly) · `/api/admin` (admin router, protect+adminOnly) · `/api/public/projects` · `/api/public/chat`.
- 404 handler `{message:'Route not found'}`; global error handler maps `entity.parse.failed` → 400 "Invalid JSON body", `entity.too.large` → 413, rate-limit errors → 429 with the rich payload, anything else → 500.

### 8.2 Database layer — `config/db.ts`, `config/schema.ts`
`pool` (pg `Pool`, max 10), `query<T>(text, params)` helper returning rows, and `connectDB(retries = 10)` which runs `SCHEMA_SQL` with retry/backoff so the API can start before Postgres is ready.

### 8.3 Middleware
- `auth.ts`: `protect` (requires `Authorization: Bearer <jwt>`; sets `req.user = {id, role}`; 401 otherwise), `optionalAuth` (defined but **not used**), `adminOnly` (403 `Access denied: admins only`).
- `validateId.ts`: `router.param('id')` guard accepting `/^[A-Za-z0-9-]{1,64}$/` (UUIDs and ObjectIds); otherwise 404 `Resource not found`.

### 8.4 Models (hand-written SQL data access, no ORM)
Each model aliases snake_case columns to the camelCase API shape (`id AS "_id"`, `sort_order AS "order"`, `client_token AS "clientToken"` …), so JSON responses keep the legacy Mongo-style `_id`.
- **User**: `findUsers/findManagers/findUserById/findUserByEmail/findUserByUsername`, `verifyCredentials(identifier, password)` (matches email, username or name, case-insensitive), `createUser`, `createManager(username, password)` (email becomes `<username>@tadreex.local` unless the username contains `@`), `deleteUserById`, `ensureAdminUser`.
- **Project**: list variants (all, with creator via LEFT JOIN, by creator, by manager summary), counts, find by id/token, `createProject`, `deleteProjectById`, `saveProject`, `newScenarioBlock`, `PROJECT_STATUSES`.
- **ChatField / ScenarioField**: list (optionally active only), find, create/update built dynamically from a whitelist `WRITABLE` map (API name → column), delete, `nextXOrder()` (max `sort_order` + 1), ChatField `reorderChatFields` via `unnest($1::text[]) WITH ORDINALITY`.
- **Settings**: `getSettings()` / `saveSettings()` on the single row.

### 8.5 Controllers (non-AI)
- **auth**: `register` (public; creates role `user`, password ≥ 6, 409 if email exists, returns JWT) and `login` (accepts `username` or `email` + `password`; returns JWT `{id, role}` expiring in **7d** and the user object).
- **admin**: users list/delete (cannot delete self), managers list (each with `projectCount` and `projects[]`), create manager (username ≥ 3 chars, `[A-Za-z0-9_.-]` only, password ≥ 6, 409 on duplicate), delete manager (not self, not an admin).
- **project**: list/get/create/rename+status/delete/answers-update with manager ownership checks and the 10-project cap; `updateProjectAnswers` **merges** `answers` into the existing object and may set `currentStep` and `status`.
- **public.project**: get by token; patch answers/currentStep by token (merge).
- **chatfield / scenariofield**: CRUD with validation (label required, type ∈ text/radio/checkbox, radio/checkbox chat fields require ≥1 option, `type: text` clears options, `required`/`active` default true). Scenario field `key` defaults to `toKey(label)` = lower-case with non-alphanumerics → `_`. **Every mutation calls `invalidateFieldCache()`** so edits apply immediately.
- **settings**: `GET/POST /api/admin/settings/model`; temperature must be a finite number in [0, 2]; models must be non-empty; empty `apiKey` clears the stored key (falls back to `GROQ_API_KEY` env). Saving updates the in-memory LLM config, which resets the cached `ChatGroq` instances.

---

## 9. The AI conversation engine

File: `server/src/controllers/chatbot.controller.ts`.

### 9.1 LLM wiring
- Two lazily-built `ChatGroq` singletons: **strong** (questions, validation, suggestions, modifications) and **fast** (only the short acknowledgements like "Noté").
- Config comes from module-level variables initialised to defaults, overridden at startup from the `settings` table and at runtime by the admin settings endpoint. Any setter resets the cached instance. API key precedence: DB key → `GROQ_API_KEY` env.
- Structured outputs use `withStructuredOutput(zodSchema)`:
  `extractionSchema` (value/isValid/reason), `optionMatchSchema`, `checkboxMatchSchema`, `stepFieldSchema`, `stepModifySchema` (`updates` record | null + message), `suggestionsSchema` (2–4 strings).

### 9.2 Reserved "system messages"
The client uses the same `userMessage` field for chat text and control commands:

| `userMessage` | Endpoint | Effect |
| --- | --- | --- |
| `__init__` | info / step | Start or resume: asks the current question (step: returns last bot message if one exists) |
| `__help__` | info / step | Generates 2–4 selectable suggestions for the current field |
| `__confirm__` | info | `phase=scenario`, `status=in_progress`, creates "Scénario 1" if none |
| `__scenario_done__` | info | `phase=completed`, `status=completed` |
| `__back_to_review__` | info | `phase=review` |
| `__reset_scenarios__` | info | `scenarios = []` |
| `__reset__` | info | Back to `info`, `draft`, `currentStep=0`, answers/history/scenarios wiped |

Note these commands work on **any phase** because they are checked before phase routing; any visitor with the token can invoke them.

### 9.3 Info phase
- Active fields come from `chat_fields WHERE active ORDER BY sort_order, created_at`, cached 30 s (`CACHE_TTL`), invalidated by admin edits.
- **Question generation** (`askFieldQuestion`, strong model): system prompt "Tu es Tadreex Creator… méthode ADDIE, phase Analyse" with the single topic, the admin's description (to be re-phrased, not copied), options for radio/checkbox, previously collected answers (context only), strict rules (one question, ≤ 2 sentences, bold only the key term, no greeting) and the rejection reason when re-asking. The last **6** history turns are appended.
- **Validation**: `text` → LLM `validateText` (rejects vague/joke/gibberish/"je ne sais pas"/insults, domain-agnostic, sees up to 4 prior answers); `radio` → exact case-insensitive match else LLM mapping; `checkbox` → split on `, ; \n`, exact matches else LLM mapping.
- On success: `answers[field.label] = value`, `currentStep++`, ack from the **fast** model (≤ 8 words, varied wording) + next question; last field → `phase = review` with "Toutes les informations sont collectées."
- Response payload: `botMessage`, `options` (for radio/checkbox), `inputDisabled` (true for radio so the user must click an option), `phase`, `currentFieldLabel`, `totalFields`, `fieldSaved`, `nextStep`, optional `suggestions`.
- `info_chat_history` is trimmed to the last **40** entries after each push.

### 9.4 Scenario step builder
- A scenario's steps live in `scenario.answers.steps`. "Add step" appends `newStepRow(max(numero)+1)` and resets `builder.state` to `collecting`.
- **Which fields are asked**: active `scenario_fields` (in order) when any exist; otherwise the built-in `STEP_ASK_KEYS` = `titre, action, resultat, objets3d, ui, animations, validation` (`statut` is never asked; defaults to "À faire"). `nextMissingFieldKey` returns the first field whose value is empty.
- **Built-in field specs** (`STEP_FIELD_SPECS`) give each field a French label, description, question prompt, help guidance and "validation expected" text, e.g. `action` = physical gestures with hands/controllers, `resultat` = the simulation's reaction (snap, sounds), `ui` = 2D/3D interface elements only (overlays, gauges, tooltips) and *never* physical gestures. Admin-defined scenario fields **override** label/description/forbidden when their `key` or `label` matches (`getScenarioFieldSpec`).
- **Per message** (`processStepAnswer`):
  1. If a field is still missing → `validateStepField` (strong model, structured output). It sees the field spec, the `forbidden` text, up to 4 project answers and the already-validated fields of this step. Invalid (gibberish/joke/insult or wrong category) → bot sends the reason + a freshly generated question. Valid → store the cleaned French value; ask the next missing field (`✓ Enregistré.` + question) or, if complete, show the **recap** (`buildStepRecap`, bullet list "• **Label** : value").
  2. If the step is already complete → `applyStepModify`: the LLM extracts which of `titre, action, resultat, objets3d, ui, animations, validation, statut` the user wants changed; applied values are trimmed and saved, with "Valeurs mises à jour ✓" + recap. If nothing is identified, the bot explains the expected phrasing («Modifie **l'action gestuelle** : …»).
- **Help** (`handleStepHelp`): suggestions for the missing field (strong model, honours `forbidden`), or the recap when the step is complete.
- Every exchange is appended to that **step's own `chatHistory`**; `initStepChat` re-shows the last bot message on reopen.
- Response (`stepResponse`): `{ scenarios, botMessage, stepComplete, done, inputDisabled:false }` (`done` = `builder.state === 'done'`; `suggestions` added for help).

### 9.5 Rate-limit handling
`isRateLimitError(err)` recognises HTTP 429 (status/statusCode/code), error names containing `RateLimit`, Groq `rate_limit_exceeded`, messages mentioning "Rate limit", "429", "tokens per minute", "TPM", and recurses into `err.cause`. `formatRateLimitPayload(prefix, err)` produces `{ isRateLimit:true, errorTitle, message, details (util.inspect, depth 5), retryAfter }`, taking `retry-after` from headers or parsing "try again in 12.3s" from the message. Chat handlers answer HTTP **429** with it; the client shows the modal.

### 9.6 Scenario block endpoints (same controller)
`addScenarioBlock`, `renameScenarioBlock`, `deleteScenarioBlock`, `getScenarioBlocks`, `addScenarioStepBlock`, `deleteScenarioStepBlock`, `finalizeScenarioBlock` — all index-based (`scenarioIndex`, `stepIndex`), return the full `scenarios` array, and validate indices (`400 Index invalide.`).

---

## 10. REST API reference

All paths are prefixed with `/api`. Auth column: **—** none, **JWT** any valid token, **Admin** admin role, **Token** possession of the project's client token.

### Health
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status:'ok', timestamp}` |

### Auth
| Method | Path | Auth | Body | Result |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | — | `{name, email, password}` | 201 `{token, user}` role `user`; 400/409 |
| POST | `/auth/login` | — | `{username\|email, password}` | `{token, user:{id,name,username,email,role}}`; 401 `Invalid credentials` |

### Projects (back office)
| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/admin/projects` | JWT | Admin: all (+creator fields). Manager: own |
| POST | `/admin/projects` | JWT | `{title}`; manager cap 10 |
| GET | `/admin/projects/:id` | JWT | Full project; manager → own only |
| PATCH | `/admin/projects/:id` | JWT | `{title?, status?}` |
| DELETE | `/admin/projects/:id` | JWT | |
| PATCH | `/admin/projects/:id/answers` | JWT | `{answers?, currentStep?, status?}` (answers merged) |

### Configuration (admin only)
| Method | Path | Description |
| --- | --- | --- |
| GET/POST | `/admin/chatfields` | List / create |
| PATCH | `/admin/chatfields/reorder` | `{orderedIds: string[]}` → returns all fields |
| GET/PATCH/DELETE | `/admin/chatfields/:id` | Read / update / delete |
| GET/POST | `/admin/scenario-fields` | List / create |
| GET/PATCH/DELETE | `/admin/scenario-fields/:id` | Read / update / delete |
| GET/POST | `/admin/settings/model` | `{model, fastModel, temperature, fastTemperature, apiKey}` |

### People (admin only)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/users` | All users |
| DELETE | `/admin/users/:id` | Not yourself |
| GET | `/admin/managers` | Managers with `projectCount` + `projects` |
| POST | `/admin/managers` | `{username, password}` |
| DELETE | `/admin/managers/:id` | Not yourself, not an admin |

### Public (client token)
| Method | Path | Description |
| --- | --- | --- |
| GET | `/public/projects/:token` | Full project JSON (incl. chat histories) |
| PATCH | `/public/projects/:token/answers` | `{answers?, currentStep?}` merge |
| POST | `/public/chat/:token` | `{userMessage}` — info phase + system commands |
| GET | `/public/chat/:token/scenario` | `{phase, answers, scenarios, scenarioFields: []}` |
| POST | `/public/chat/:token/scenario/add` | `{name?}` |
| POST | `/public/chat/:token/scenario/rename/:scenarioIndex` | `{name}` |
| POST | `/public/chat/:token/scenario/delete/:scenarioIndex` | |
| POST | `/public/chat/:token/scenario/:scenarioIndex/step/add` | returns `stepIndex` |
| POST | `/public/chat/:token/scenario/:scenarioIndex/step/:stepIndex/delete` | |
| POST | `/public/chat/:token/scenario/:scenarioIndex/step/:stepIndex` | `{userMessage}` — `__init__`, `__help__` or an answer |
| POST | `/public/chat/:token/scenario/:scenarioIndex/finalize` | marks scenario `done` |

Common error shape: `{ "message": "..." }`. Rate-limit shape: `{ isRateLimit, errorTitle, message, details, retryAfter }` with HTTP 429.

---

## 11. Frontend (client/)

### 11.1 Global
- `app/layout.tsx`: `<html lang="fr">`, Inter font variable, metadata (title template `%s · Scenarios Platform`, Tadreex favicon), and an **inline theme script** that sets `data-theme` from `localStorage['tadreex-theme']` or the OS preference before first paint (avoids flash).
- `app/page.tsx`: redirects `/` → `/admin`.
- `globals.css`: CSS custom-property design tokens for **dark** (default) and `[data-theme="light"]`; accent `#7170ff` (dark) / `#5a52e0` (light); reset; shared `.toast` styles. Each page has its own CSS Module.
- `components/Icon.tsx`: inline SVG icon set (overview, projects, chat, scenario, users, settings, sun, moon, logout, link, edit, trash, plus, search, check, progress, done, external, refresh, send, bulb, sparkles, shield, copy, lock, eye, key, arrowLeft/arrowRight, …) typed as `IconName`.
- `components/useToast.tsx`: `const {toast, Toast} = useToast()`; toast kinds `success|error|info`, auto-hide after 2.6 s.
- `lib/api.ts`: `getToken`, `setSession` (localStorage + cookie), `getCurrentUser` (from `localStorage.user`, falling back to decoding the JWT payload), `clearSession`, `logout`, `adminFetch` (adds Bearer token and JSON content type; **a 401 triggers logout**), `errorMessage(res, fallback)`.
- `proxy.ts` (Next 16 replacement of `middleware.ts`), matcher `/admin/:path*`: no `admin_token` cookie and not on `/admin/login` → redirect to login; cookie present on login page → redirect to `/admin`. It checks only the cookie's **presence**, not its validity; real validation happens at the API.

### 11.2 Back-office pages (`/admin/...`)
| Route | Who | What it does |
| --- | --- | --- |
| `/admin/login` | all | Split layout; username-or-email + password; rejects non-admin/manager roles; friendly message when the API is unreachable |
| `/admin` | admin/manager | Overview: stat cards (projects, in progress, completed + completion %, and either *Question fields* for admins or *Project quota x/10* for managers) and the 5 most recently updated projects |
| `/admin/projects` | admin/manager | Searchable list (title / creator) with status filter; create, rename, delete modals (Esc closes); copy client link; open client chat in a new tab; admins see creator info; managers blocked at 10 projects |
| `/admin/projects/[id]` | admin/manager | Tabs **Preview** (general answers as a definition list + one table per scenario with columns N°, Titre, Action gestuelle, Résultat/Interaction, Objets 3D, Interface (UI), Animations/VFX, Validation, Statut, plus *Terminé/En cours* badge) and **Edit** (change status, edit answers; array answers edited one-per-line; unsaved-changes flag); copy client link |
| `/admin/fields` | admin | Manage info-phase chat fields (create/edit/delete modal, option list editor for radio/checkbox, required/active toggles; new fields get `order = current count`). The `PATCH /reorder` endpoint exists but **the UI has no drag/reorder control** |
| `/admin/scenario-fields` | admin | Same for scenario step fields, with extra `key` and `forbidden` inputs |
| `/admin/settings` | admin | "AI settings": Groq API key (masked, show/copy, "Configured / Not set" badge), strong and fast model names, both temperatures; dirty-state tracking |
| `/admin/managers` | admin | Search, totals, expandable per-manager project list, add-manager modal (client-side validation mirrors the server), delete modal |
| `/admin/users` | admin | Users list with delete — **page exists but is not linked in the sidebar** |
| `/admin/conversations` | – | **Placeholder stub** ("will appear here once connected to the API"), not linked and with no API |

`admin/layout.tsx` provides the shell: sidebar with nav groups (Workspace: Overview, Projects; Configuration: Chat fields, Scenario fields, AI settings; Access: Managers — the last two groups hidden for managers), user badge with role, theme toggle, logout, and a mobile top bar with a slide-in drawer + backdrop.

### 11.3 Client chat (`/chat/[token]`)
One large client component (`page.tsx`, ~1,760 lines) driving a state machine `loading | info | review | scenario | completed | error`:
- **Sub-components**: `SuggestionPicker` (multi-select the AI suggestions, free-text editing, validate) and `OptionPicker` (radio/checkbox options with the same selection+text UX).
- **Info chat**: message list with auto-scroll, progress bar (`infoStep / totalInfoFields`), current field label, help button (`__help__`), input disabled while a radio choice is required.
- **Review screen**: all answers with inline edit/save, reset, confirm.
- **Scenario screen**: left sidebar of scenario tabs (select, rename, delete, ✓ when done) + "add scenario" modal; step list per scenario (add/delete), per-step chat with help/suggestions; `stepComplete` and `scenarioDone` maps tracked per scenario/step; finalize scenario; finish project (enabled when every scenario is done); "Réponses" back button; scenario-only reset.
- **Errors**: transient notice banner (4 s) for failed actions; full rate-limit modal with copy-to-clipboard of details.
- **Metadata**: `chat/layout.tsx` sets title "Conception de scénario" and `robots: noindex, nofollow`.

---

## 12. Configuration and environment variables

### Root `.env` (production, consumed by `docker-compose.yml`)
| Variable | Required | Purpose |
| --- | --- | --- |
| `DOMAIN` | no (default `scenarios.tadreex.com`) | Public hostname; Caddy site address and server `CLIENT_URL=https://$DOMAIN` |
| `COMPOSE_FILE` | no | Set to `docker-compose.yml:docker-compose.nginx.yml` to use host nginx instead of Caddy |
| `POSTGRES_DB` / `POSTGRES_USER` | no (default `scenarios`) | DB name/user |
| `POSTGRES_PASSWORD` | **yes** | URL-safe characters only (embedded in `DATABASE_URL`); `openssl rand -hex 24` |
| `JWT_SECRET` | **yes** | `openssl rand -hex 64` |
| `GROQ_API_KEY` | **yes** (compose requires it) | Initial Groq key; can later be overridden from the admin UI |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | recommended | First admin (default email `admin@tadreex.com`, name `Admin`); password ≥ 8 chars |
| `MONGODB_URI` | no | Only for the one-off migration |
| `SERVER_HOST_PORT` / `CLIENT_HOST_PORT` | no (5190 / 3190) | Host ports in the nginx variant |

### `server/.env` (local dev)
`DATABASE_URL` (default `postgres://scenarios:scenarios@localhost:5435/scenarios`), `GROQ_API_KEY`, `JWT_SECRET`, `PORT=5000`, `CLIENT_URL=http://localhost:3000`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MONGODB_URI`. Optional: `MONGO_DNS=system` (migration script) and `ADMIN_NAME`.

### Client
`API_URL` / `NEXT_PUBLIC_API_URL` — read in `next.config.js` at build time for the dev rewrite; Dockerfile build arg `API_URL` (default `http://server:5000`). `NEXT_TELEMETRY_DISABLED=1` in images.

### Runtime-editable (stored in DB, not env)
Strong/fast model names, both temperatures, Groq API key (via `/admin/settings`), and the two field lists.

---

## 13. Deployment

### 13.1 Docker Compose stack (`docker-compose.yml`, project name `scenarios-platform`)
| Service | Image / build | Notes |
| --- | --- | --- |
| `db` | `postgres:17-alpine` | Volume `pgdata`; healthcheck `pg_isready` (5 s interval, 12 retries) |
| `server` | `./server` Dockerfile | Waits for `db` healthy; env: `DATABASE_URL`, `JWT_SECRET`, `GROQ_API_KEY`, `ADMIN_*`, `CLIENT_URL`, `PORT=5000`, `MONGODB_URI`; healthcheck `wget /api/health` |
| `client` | `./client` Dockerfile (build arg `API_URL`) | Standalone Next server on :3000; healthcheck fetches `/admin/login` |
| `caddy` | `caddy:2.10-alpine` | Ports 80, 443, 443/udp; mounts `deploy/Caddyfile`; volumes `caddy_data`, `caddy_config` |

Dockerfiles: multi-stage on `node:24-alpine`; server prunes dev deps and runs as user `node` (`CMD node dist/index.js`); client copies `.next/standalone`, `.next/static`, `public` and runs `node server.js` as `node` with `HOSTNAME=0.0.0.0`.

**Caddyfile**: site `{$DOMAIN}`, `encode zstd gzip`, `/api/*` → `server:5000`, everything else → `client:3000`; headers HSTS (1 year, includeSubDomains), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Server` removed.

### 13.2 VPS procedure (from README)
1. DNS: `A` record `scenarios` → VPS IPv4 (OVH: Web Cloud → Domain names → DNS zone); verify with `nslookup`.
2. Prepare Ubuntu/Debian: install Docker, add user to `docker` group, open UFW for OpenSSH/80/443, add 2 GB swap if RAM ≤ 2 GB (Next build memory); open OVH Network Firewall if enabled.
3. `git clone https://github.com/Rahim-farhat/Project-Tadreex-Agent.git scenarios-platform`, `cp .env.example .env`, generate secrets, set `GROQ_API_KEY` and `ADMIN_PASSWORD`.
4. `docker compose up -d --build`; check `docker compose ps` and `logs -f caddy` ("certificate obtained successfully").
5. Update: `git pull && docker compose up -d --build`.
6. Backup: `docker compose exec -T db pg_dump -U scenarios -Fc scenarios > backup-$(date +%F).dump`; restore with `pg_restore --clean`.

### 13.3 nginx variant
If the VPS already runs nginx on 80/443: remove caddy, set `COMPOSE_FILE=docker-compose.yml:docker-compose.nginx.yml`; the override disables caddy (profile `disabled`) and binds server → `127.0.0.1:5190`, client → `127.0.0.1:3190`. Install `deploy/nginx-scenarios.conf` (10 MB body limit, 120 s `proxy_read_timeout` for slow AI replies, WebSocket upgrade headers on `/`), then `certbot --nginx -d scenarios.tadreex.com --redirect`.

---

## 14. Local development

```bash
docker compose -f docker-compose.dev.yml up -d     # Postgres 17 on 127.0.0.1:5435 (user/pass/db = scenarios)
cp server/.env.example server/.env                 # fill GROQ_API_KEY and JWT_SECRET (and ADMIN_PASSWORD)
cd server && npm install && npm run dev            # API on :5000 (nodemon + ts-node)
cd client && npm install && npm run dev            # Web on :3000, /api proxied to :5000
```

Scripts — **server**: `dev`, `build` (`tsc`), `start`, `migrate:mongo`. **client**: `dev`, `build`, `start`.

---

## 15. MongoDB → PostgreSQL migration

The project was originally on MongoDB (Atlas). `server/src/scripts/migrate-from-mongo.ts` copies `users`, `chatfields`, `scenariofields`, `projects` and `settings` into Postgres:
- Run in production: set `MONGODB_URI`, `docker compose up -d server`, then `docker compose exec server node dist/scripts/migrate-from-mongo.js`; locally `npm run migrate:mongo`.
- Mongo `ObjectId`s are **kept as the Postgres text ids**, so existing client links and references remain valid; ObjectIds/Dates are normalised via a JSON round-trip.
- **Idempotent**: every insert uses `ON CONFLICT DO NOTHING` and reports "inserted / skipped" counts; the `.env`-created admin takes precedence over an imported duplicate email.
- Forces DNS servers `8.8.8.8/8.8.4.4` (Atlas SRV lookups fail on some networks) unless `MONGO_DNS=system`.
- Remove `MONGODB_URI` afterwards. Note the Groq API key is **not** migrated (not stored in the legacy settings document).

---

## 16. Security model

Implemented:
- bcrypt password hashing; JWT signed with `JWT_SECRET`, 7-day lifetime; role in token claims.
- Server-side role/ownership checks on every back-office route; parameterised SQL everywhere (column names for dynamic inserts come from a fixed whitelist); ID format validation.
- 1 MB JSON body limit; `x-powered-by` disabled on both apps; HSTS + clickjacking/MIME headers via Caddy; `noindex` on client chat pages.
- Client tokens are 10 random characters (62^10 ≈ 8×10^17 possibilities) from a CSPRNG.

Things to be aware of (see also §17):
- Admin cookie `admin_token` is JS-set (not `HttpOnly`) and mirrors the `localStorage` token; XSS would expose it.
- The Groq API key is stored **in plain text** in `settings` and is **returned in full** by `GET /api/admin/settings/model` (intended so admins can view/copy it).
- No rate limiting or brute-force protection on login/register or on the public chat endpoints (which trigger paid LLM calls).
- Public chat endpoints grant full read/write (including destructive `__reset__`) to anyone holding the token.
- `POST /api/auth/register` is open to the internet (creates harmless `user` accounts that cannot sign into the back office but pollute the users table).
- CORS is a single configured origin; in production everything is same-origin through the proxy.

---

## 17. Known quirks, gaps and dead code

Observations from reading the code — useful when continuing development:

1. **Scenario field `type`, `options`, `required` are stored but not used by the step builder.** Every step answer is treated as free text validated by the LLM. Likewise chat-field `required` is not enforced (an inactive field is simply skipped; a "required: false" field is still asked).
2. **`applyStepModify` only knows the hard-coded keys** (`titre, action, resultat, objets3d, ui, animations, validation, statut`); custom scenario fields added by the admin can be asked and displayed but not modified through the "Modifie …" command, and the edit tab in the admin does not expose step values at all (only general answers and status).
3. **Unused / legacy leftovers**: `projects.uploaded_files`, `projects.sheet_url`, `IScene`/`IEtape` types and `answers.scenes`, `IScenarioBlock.currentField` and `chatHistory`, `IScenarioBuilder.pendingStepIndex/pendingFields`, `IStepRow` (superseded by untyped `any` step rows), `optionalAuth` middleware, the `scenarioFields: []` placeholder in responses, `/admin/users` page (not in nav, role type there lacks `manager`), `/admin/conversations` stub.
4. **Schema `DO $$` block swallows all errors** (`EXCEPTION WHEN OTHERS THEN NULL`), including the `settings.groq_api_key` add-column step which runs *before* `settings` is created on a fresh database (harmless because `CREATE TABLE settings` already includes the column, but errors in this block would be invisible).
5. **`created_by` has no foreign key.** Deleting a manager leaves their projects orphaned (still reachable through client links and visible to admins; creator fields are null).
6. **Whole-project read-modify-write** with no locking: two simultaneous requests on one project (e.g. double-click, or two browser tabs) can overwrite each other's changes.
7. **Field cache** (30 s TTL + explicit invalidation) and LLM config are per-process; running multiple API replicas would let settings changes apply to only one replica.
8. **`getActiveInfoFields` caches an empty list as "stale"** (re-queries every call when there are zero active fields), and an empty field list causes `initInfoPhase` to jump straight to `review`.
9. **Language mix**: back-office UI is English (except the Fields pages which toast in French), client chat and all AI content are French.
10. **Login accepts "name" as identifier** in addition to username/email; names are not unique, so `verifyCredentials` takes the first matching row.
11. **`client/tsconfig.tsbuildinfo` is committed** although it is a build artefact; `next-env.d.ts` is also committed.
12. **README vs code**: README says React 18 / Next.js 16, matching `package.json`; `docker-compose.yml` requires `GROQ_API_KEY` even though it can be changed later from the UI.

---

## 18. Git history

Single contributor (`Rahim-farhat`), 11 commits on `main`:

| Commit | Date | Message |
| --- | --- | --- |
| `4199f1c` | 2026-10-29 | managers (latest commit; the code contains the manager role, 10-project quota, managers page and username login) |
| `ef2196b` | 2026-10-21 | docker-fixed |
| `42ff205` | 2026-10-21 | updates |
| `0de257e` | 2026-10-21 | updates |
| `e683a2d` | 2026-08-31 | suggestion-selectable |
| `5e5aafc` | 2026-08-31 | steps-chatbot-fixed |
| `4e08587` | 2026-07-31 | improvements |
| `1c50dd7` | 2026-07-31 | idk-atp2 |
| `db7fcd7` | 2026-07-30 | idk-atp |
| `e82a032` | 2026-07-30 | chatbot fixer |
| `abc0ccf` | 2026-07-30 | 1st |

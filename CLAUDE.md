# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Scenarios Platform (Tadreex): clients design VR training scenarios by chatting with a French-language AI assistant via a private link `/chat/<token>`; admins/managers review them in `/admin`. Monorepo with two independent npm packages: `server/` (Express + TypeScript + PostgreSQL + Groq via LangChain) and `client/` (Next.js 16 App Router, React 18, CSS Modules). Full reference: `PROJECT_DOCUMENTATION.md`; deployment details: `README.md`.

There are no tests and no linter configured.

## Commands

```bash
docker compose -f docker-compose.dev.yml up -d     # dev Postgres on localhost:5435
cp server/.env.example server/.env                 # set JWT_SECRET, GROQ_API_KEY, ADMIN_PASSWORD (>= 8 chars)
cd server && npm install && npm run dev            # API :5000 (nodemon + ts-node)
cd client && npm install && npm run dev            # web :3000, rewrites /api -> :5000
cd server && npm run build                         # tsc -> dist/ (also the only type-check)
cd client && npm run build                         # next build
cd server && npm run migrate:mongo                 # one-off MongoDB -> Postgres import
```

Production: `docker compose up -d --build` with a root `.env` (see `.env.example`); Caddy terminates HTTPS. `docker-compose.nginx.yml` is an override for hosts that already run nginx.

## Architecture

- **Browser always calls relative `/api/...`.** In prod the proxy routes `/api/*` to Express and the rest to Next; in dev `client/next.config.js` rewrites it (evaluated at build time from `API_URL`).
- **Server layering**: `routes/` -> `controllers/` -> `models/` (hand-written SQL via `config/db.ts` `query()`, no ORM). Models alias columns to the legacy Mongo-style API shape (`id AS "_id"`, `sort_order AS "order"`, `client_token AS "clientToken"`).
- **Schema** lives in `server/src/config/schema.ts` and is re-applied on every start, so every statement must stay idempotent. There is no migration framework; add columns with `IF NOT EXISTS`-style guards. IDs are TEXT (UUID, or ObjectId kept from the Mongo migration).
- **Route mounting order in `server/src/index.ts` matters**: `/api/admin/projects` is `protect` only (managers allowed, ownership checked in the controller, 10-project cap); `/api/admin/chatfields`, `/scenario-fields` and the rest of `/api/admin` are `protect + adminOnly`; `/api/public/*` is unauthenticated and scoped by the project's client token.
- **Projects are read-modify-write**: controllers load a project object, mutate it, then `saveProject()` rewrites the whole row (conversation history, answers, scenarios are JSONB). No locking.
- **Auth**: JWT (7d, `{id, role}`) in `Authorization: Bearer`. The client stores it in localStorage and an `admin_token` cookie; `client/src/proxy.ts` (Next 16 middleware replacement) only checks cookie presence. `adminFetch` in `client/src/lib/api.ts` logs out on 401. Role gating in `admin/layout.tsx` is UX only; the server is authoritative.

## The chatbot engine (`server/src/controllers/chatbot.controller.ts`, ~1700 lines)

- Two lazy `ChatGroq` singletons (strong/fast). Models, temperatures and API key come from the `settings` row (loaded at startup, changed via `/api/admin/settings/model`; setters reset the cached instances). Key precedence: DB key, then `GROQ_API_KEY`.
- Control commands share the `userMessage` field with chat text: `__init__`, `__help__`, `__confirm__`, `__scenario_done__`, `__back_to_review__`, `__reset_scenarios__`, `__reset__`. They are checked before phase routing.
- Phases (`projects.phase`): `info -> review -> scenario -> completed`. Info questions come from active `chat_fields` (answers stored under the field **label**); scenario step fields come from active `scenario_fields` (stored under `key`), falling back to the hard-coded `STEP_FIELD_SPECS` / `STEP_ASK_KEYS` when none exist. Steps live in `scenario.answers.steps`, each with its own `chatHistory`.
- Active fields are cached 30 s; field controllers must call `invalidateFieldCache()` after any mutation.
- LLM validation uses `withStructuredOutput(zod schema)`. Prompts and user-facing strings are in French; keep that.
- Groq 429s are detected by `isRateLimitError` and returned as `{isRateLimit, errorTitle, message, details, retryAfter}`; the chat page renders a dedicated modal from it.
- `applyStepModify` only understands the hard-coded step keys, not custom scenario fields.

## Client modes (brainstorm -> refine -> final)

- `projects.mode` (`beginner|intermediate|expert`, chosen when the link is created) switches a project to the new flow; `mode = NULL` keeps the legacy per-step chat above. `__confirm__` sends mode projects to phase `brainstorm` instead of `scenario`.
- `scenario_fields.level` is the lowest mode that asks a field (rank in `MODE_RANK`, `models/ScenarioField.ts`). Admin edits it on `/admin/scenario-fields`.
- `seedScenarioFields` (`config/seed.ts`) runs once, guarded by `settings.levels_initialized`: seeds defaults on an empty table, otherwise tags the standard keys and adds `acteur`. Later admin edits are never overwritten.
- Logic is in `controllers/modeflow.controller.ts` (routes in `chatbot.routes.ts`): `submitBrainstorm` does one structured-output extraction into the same `scenario.answers.steps[]` shape the admin project page already renders; `missingFor()` computes gaps; `goFinal` refuses with 400 while any remain. UI is `client/src/app/chat/[token]/ModeFlow.tsx`, mounted from `page.tsx` when `phase === "mode"`.

## Gotchas

- Admin UI text is English (Fields pages toast in French); the client chat and all AI content are French.
- Unused/legacy: `projects.uploaded_files`, `sheet_url`, `answers.scenes`, `optionalAuth`, `/admin/users` and `/admin/conversations` pages (not in the nav).
- `created_by` has no FK; deleting a manager orphans their projects.
- `report/` holds the LaTeX internship report and PlantUML diagrams, unrelated to the app build.

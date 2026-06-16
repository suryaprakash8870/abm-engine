# Conventions

> Coding and project conventions. Claude Code should follow these in all generated code.

## Language and types

- TypeScript strict mode everywhere. No `any` without a written reason.
- Shared types live in `lib/types/`. Event payload types in `lib/events/types.ts`.
- Prisma generates DB types — import from `@prisma/client`, don't redefine.

## Naming

- Prisma models: PascalCase singular (`IcpDefinition`). Table names: snake_case plural (`icp_definitions`).
- Files: kebab-case (`icp-engine.ts`). React components: PascalCase (`AccountCard.tsx`).
- Event names: dot notation, past tense (`accounts.enriched`, `play.fired`).
- API routes: versioned, kebab-case (`/api/v1/tam/build`).
- Env vars: SCREAMING_SNAKE_CASE.

## Folder structure per engine

```
lib/engines/<engine-slug>/
  index.ts            # public exports
  service.ts          # core business logic
  handlers.ts         # event consumers
  publisher.ts        # event publishers
  validation.ts       # input/output validation + completion check
  <engine>.test.ts    # integration test
```

## Event handling

- Every event payload includes `workspace_id`, `correlation_id`, `timestamp`.
- Validate incoming event payloads before processing. Reject invalid payloads with an error event.
- Publish a success event ONLY after the task completion check passes.
- Failed events after max retries go to the dead-letter queue.
- Use the shared `publishEvent()` and `subscribeToEvent()` utilities — never talk to Redis directly.

## Database

- Every table has `workspace_id` (except `enrichment_cache`).
- Every table has an RLS policy tying access to workspace membership.
- Use Prisma for all queries. Raw SQL only for analytics in Engine 11, with a written reason.
- Never query another engine's tables. Subscribe to events and keep local copies.
- Migrations: `npx prisma migrate dev --name "clear_description"`.

## API routes

- Standard success response: `{ data: T, meta?: {...} }`.
- Standard error response: `{ error: { code, message, details? } }`.
- Error codes: UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404), VALIDATION_ERROR (422), PLAN_LIMIT (402), CRM_NOT_CONNECTED (424), RATE_LIMITED (429).
- `workspace_id` always comes from the authenticated session, never from a request parameter.

## LLM calls

- Use `claude-haiku-4-5` for batch classification, `claude-sonnet-4-6` for reasoning.
- All system prompts stored in DB (`prompt_versions`) and versioned — not hardcoded.
- Force structured JSON output and validate against the expected TypeScript interface.
- On validation failure, retry once with a corrective prompt, then fall back gracefully.
- Never block a user-facing request on an LLM call — queue it and notify.

## Errors and logging

- Structured logging: every log line is JSON with `workspace_id`, `correlation_id`, `engine`, `level`.
- Report exceptions to Sentry with the correlation_id attached.
- User-facing errors are friendly; technical detail goes to logs, not the user.

## Security

- Secrets only in env vars. Never in code, never in the repo.
- OAuth tokens encrypted at rest (AES-256) using `ENCRYPTION_KEY`.
- Verify webhook signatures before processing (HubSpot HMAC, Slack signing secret, Stripe signature).
- Never log secrets, tokens, or full PII.

## Testing

- One integration test per engine: feed a known input event, assert the correct output event publishes.
- Test the task completion check: a deliberately incomplete job must publish an error event, not success.
- Run `npm run test` and `npm run lint` before every commit.

## Git

- Branches: `feature/<engine>-<desc>`, `fix/<desc>`, `chore/<desc>`.
- Every PR references a task in `docs/project/todo.md`.
- Record architectural decisions in `docs/project/decisions.md`.
- Update the relevant engine doc when an engine's behaviour changes.

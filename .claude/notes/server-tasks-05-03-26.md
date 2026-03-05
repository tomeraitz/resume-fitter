# Server Tasks — 05-03-26

## Status

| File | What's missing |
|---|---|
| `middleware/auth.ts` | JWT verification using `SESSION_SECRET` — currently just calls `next()` |
| `routes/pipeline.ts` | Auth middleware wired, Zod body validation, orchestrator call |
| `agents/orchestrator.ts` | Sequential agent pipeline — throws "Not implemented" |
| `agents/hiring-manager.ts` | Load prompt, call model, Zod-validate JSON response |
| `agents/rewrite-resume.ts` | Same |
| `agents/ats-scanner.ts` | Same |
| `agents/verifier.ts` | Same |

## Recommended implementation order

1. Implement the 4 agents (load prompt → call model → Zod-validate)
2. Implement orchestrator (wire agents sequentially, collect `AgentResult[]`)
3. Implement pipeline route (Zod request validation + call orchestrator)
4. Implement auth middleware (JWT verify)

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
| `prompts/hiring-manager.md` | Empty placeholder — no actual system prompt |
| `prompts/rewrite-resume.md` | Same |
| `prompts/ats-scanner.md` | Same |
| `prompts/verifier.md` | Same |

## Recommended implementation order

1. Write the 4 system prompts (`.md` files) — everything else depends on knowing what each agent does
2. Implement the 4 agents (load prompt → call model → Zod-validate)
3. Implement orchestrator (wire agents sequentially, collect `AgentResult[]`)
4. Implement pipeline route (Zod request validation + call orchestrator)
5. Implement auth middleware (JWT verify)

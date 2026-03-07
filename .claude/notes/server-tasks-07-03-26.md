# Server Tasks — 07-03-26

## Task 1: Chat — user-driven CV changes

Allow the user to send follow-up messages after the pipeline runs to request specific changes to the CV (e.g. "make it shorter", "emphasize DevOps skills").

### What's needed
- New `POST /api/chat` route (or extend `/api/pipeline` with a `mode: "chat"` flag)
- Accept `{ message: string, currentCv: string, history?: string }` body
- New agent or prompt that takes the user message + current CV and returns an updated CV
- Zod validation + auth middleware wired (same as pipeline route)
- Return `{ updatedCv: string }`

---

## Task 2: Optimize LLM requests

Reduce latency and cost across the pipeline.

### Ideas to explore
- Run independent agents in parallel (e.g. ats-scanner and verifier can both receive the rewritten CV simultaneously)
- Add prompt caching headers where the model supports it (e.g. Anthropic cache_control)
- Trim prompt inputs — avoid sending full CV HTML when only a subset is needed
- Review model selection per agent (use cheaper/faster model for lighter tasks)

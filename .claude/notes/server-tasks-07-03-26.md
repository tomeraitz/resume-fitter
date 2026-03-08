# Server Tasks — 07-03-26

## Task 1: Optimize LLM requests

Reduce latency and cost across the pipeline.

### Ideas to explore
- Run independent agents in parallel (e.g. ats-scanner and verifier can both receive the rewritten CV simultaneously)
- Add prompt caching headers where the model supports it (e.g. Anthropic cache_control)
- Trim prompt inputs — avoid sending full CV HTML when only a subset is needed
- Review model selection per agent (use cheaper/faster model for lighter tasks)

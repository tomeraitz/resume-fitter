# Research Findings: CV Rewrite Bug

**Date:** 2026-03-28
**Branch:** pdf-issue
**Bug:** Generated CV is identical to the original — no text is changed.

---

## 1. How cv-creator Rewrites Text

**Stack:** Python + CrewAI + FastAPI
**Approach:** Full CV reconstruction from scratch

### Pipeline (4 agents, `backend/engine/crew.py`):
1. `researcher` — analyzes job posting, extracts requirements
2. `matcher` — matches candidate profile to job requirements
3. `writer` — **generates brand-new CV content** in structured JSON
4. `validator` — checks formatting

### Key: `generate_cv` task (`backend/engine/tasks/generate_cv.py`)
The writer agent receives the candidate's original resume as raw text and the match analysis, then **generates entirely new CV content** from scratch in a structured JSON schema:
```json
{
  "personal_info": {...},
  "summary": "new tailored summary...",
  "experience": [{ "achievements": ["X-Y-Z bullet..."] }],
  "skills": {...},
  "extra_sections": [...]
}
```

### Rendering (`backend/engine/tools/html_builder.py`, `html_merger.py`):
The structured JSON is fed into an HTML template builder that constructs the output HTML from scratch. The original PDF/HTML is **not used as the template for output** — it is only used as the data source.

**Data flow:** original resume text → LLM generates structured JSON → html_builder renders new HTML from template

---

## 2. How resume-fitter Handles Text Rewriting

**Stack:** Node.js + Vercel AI SDK + Express
**Approach:** In-place keyword injection into existing HTML

### Pipeline (4 agents, `server/src/agents/orchestrator.ts`):
1. `hiring-manager` — scores fit, detects `cvLanguage`, produces `missingKeywords[]`
2. `rewrite-resume` — **modifies existing HTML in-place** to inject missing keywords
3. `verifier` — softens any unsupported claims, produces `verifiedCv`
4. `ats-scanner` — scores the final CV (no HTML output, analysis only)

### Key: `runRewriteResume` (`server/src/agents/rewrite-resume.ts`)
Receives:
- `missingKeywords` — array of keyword strings from hiring-manager
- `cvTemplate` — **the original HTML document from the user's PDF**
- `cvLanguage` — detected language code

The prompt (`server/src/prompts/rewrite-resume.md`) instructs the model to:
- Keep HTML structure byte-for-byte identical
- Only change **text node content** within existing elements
- Integrate missing keywords naturally into existing bullets
- Preserve word count within 10% of original
- Return `updatedCvHtml` (full HTML) + `keywordsNotAdded[]`

### Rendering:
No template rendering step. The `updatedCvHtml` returned by the LLM **is** the final HTML, passed through the verifier and stored as `finalCv`. The cv-preview page renders it in an `<iframe srcDoc={finalCv}>`.

**Data flow:** PDF → HTML (via Python pdf converter) → hiring-manager extracts missing keywords → rewrite-resume injects keywords into HTML → verifier softens claims → `finalCv` stored in extension storage → rendered in iframe

---

## 3. Key Differences Causing the Bug

### Fundamental design difference
| Aspect | cv-creator | resume-fitter |
|--------|-----------|---------------|
| Output approach | Generate new CV from scratch | Modify existing HTML in-place |
| LLM input | Resume text + job analysis | Original HTML + missing keywords |
| LLM output | Structured JSON schema | Full HTML document |
| Template | Purpose-built HTML builder | Original CV HTML is the template |

### The actual bug — most likely causes

**Cause A: `missingKeywords` is empty**
If `hiringManagerResult.missingKeywords` is an empty array `[]`, `runRewriteResume` receives no keywords to inject. The prompt says "for each missing keyword..." — with zero keywords, the model has nothing to change and returns the original HTML unchanged. This would explain byte-for-byte identical output.

Check: look at server logs for step 1 (`hiring-manager`) output — is `missingKeywords: []`?

**Cause B: The HTML from PDF conversion is too large / unrecognizable**
The PDF-to-HTML conversion (`server/src/routes/pdf.ts`, Python script) may produce bloated/noisy HTML that confuses the LLM. The model may not recognize text nodes to modify, causing it to pass through the HTML unchanged.

Check: does `cvTemplate` sent to the server look like clean semantic HTML, or is it a dense blob of spans and absolute-positioned divs?

**Cause C: Model refuses to change HTML when `missingKeywords` are already present**
The hiring-manager strips HTML before analysis (`stripHtml(cvTemplate)` in `hiring-manager.ts`) but the rewriter sees the full HTML. Keywords may appear in the HTML as attributes, class names, or hidden elements — so the model treats them as already present and returns the original HTML.

**Cause D: JSON parse error silently falling back to original**
If the model returns malformed JSON (e.g., unescaped HTML inside a JSON string), the `JSON.parse()` call in `runRewriteResume` would throw. But this would surface as a pipeline error, not a silent pass-through — so less likely if the UI shows "completed."

**Cause E: Verifier over-softening**
The verifier receives `updatedCvHtml` and `history`. If `history` is undefined/empty (no `professionalHistory` in user profile), the verifier has no ground truth to verify against. Its prompt says "every claim that cannot be verified... flag it or soften it." With no history, it may soften everything back to its most conservative form — approaching the original wording.

---

## 4. Relevant File Paths

### resume-fitter (broken)
- `server/src/agents/orchestrator.ts` — pipeline wiring, step order
- `server/src/agents/hiring-manager.ts` — produces `missingKeywords`; uses `stripHtml()` on input
- `server/src/agents/rewrite-resume.ts` — the rewrite agent; receives `missingKeywords + cvTemplate`
- `server/src/agents/verifier.ts` — final HTML gate; uses `completeFast()`
- `server/src/prompts/rewrite-resume.md` — the rewrite system prompt (keyword injection)
- `server/src/prompts/verifier.md` — verifier system prompt
- `server/src/routes/pipeline.ts` — SSE endpoint; sends `finalCv` from `verifierResult.verifiedCv`
- `server/src/routes/pdf.ts` — PDF → HTML conversion route
- `server/src/services/model.service.ts` — `complete()` / `completeFast()` / `completeWithMeta()`
- `extension/entrypoints/background.ts` — SSE consumer; calls `setGeneratedCv(data.finalCv)`
- `extension/entrypoints/cv-preview/components/CvPanel.tsx` — renders `<iframe srcDoc={cvHtml}>`
- `extension/entrypoints/cv-preview/hooks/useCvPreviewData.ts` — reads `session.generatedCv`

### cv-creator (working reference)
- `backend/engine/crew.py` — CrewAI pipeline wiring
- `backend/engine/agents/writer.py` — writer agent (generates new content)
- `backend/engine/tasks/generate_cv.py` — full task prompt with JSON schema output
- `backend/engine/tools/html_builder.py` — renders structured JSON → HTML
- `backend/engine/tools/html_merger.py` — merges sections into final HTML
- `backend/api/services/cv_runner.py` — orchestrates the crew run

---

## 5. Recommended Debugging Steps

1. **Check server logs for step 1 output**: Is `missingKeywords` empty? If yes, the hiring-manager is finding no gaps — fix its prompt or inspect the `cvTemplate` it receives.

2. **Check the PDF-converted HTML quality**: Log the raw `cvTemplate` sent to the pipeline. If it is noisy/absolute-positioned HTML, the LLM cannot reliably edit text nodes — consider cleaning it before sending.

3. **Check if `history` (professionalHistory) is set in the user profile**: If missing, verifier has no ground truth and may silently revert changes.

4. **Add logging in `runRewriteResume`**: Log `missingKeywords.length` and the first 500 chars of `raw` response before JSON.parse to confirm the LLM is actually returning changed HTML.

5. **Compare `cvTemplate` vs `updatedCvHtml`** character by character on a known test case. If they are identical, the LLM is returning unchanged HTML — confirming Cause A or B.

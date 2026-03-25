# Create Plan

You are the **Plan Orchestrator** — a unified agent that guides the user through planning any feature for the Resume Fitter project, whether it involves the frontend (WXT + React browser extension), the backend (Node.js + Express + Vercel AI SDK server), or both.

---

## Step 1 — Gather Requirements

Ask the user the following question:

**What would you like to implement?**

1. **A component from the UI design** — Pick a component or screen from the `.claude/docs/resume-fitter-ui-design.pen` file.
2. **A general feature** — Describe the feature you want to build (frontend, backend, or full-stack).

If option 1 is selected, use the `pencil` MCP tools (`batch_get`, `get_screenshot`) to read the `.pen` design file and present the available components/screens so the user can choose.

Wait for the user's response before continuing.

---

## Step 2 — Classify & Clarify

Based on the user's response in Step 1, ask a **classification question** using `AskUserQuestion` to confirm your understanding:

**Question:** "Based on your description, here's how I understand the feature:"

Present a short summary of the feature and ask the user to confirm or correct:

1. **Feature scope** — What layers does this touch?
   - Frontend only (extension UI, components, content scripts)
   - Backend only (API routes, services, AI/LLM logic)
   - Full-stack (both frontend and backend)

2. **Key behaviors** — List 2-3 core behaviors you understood from their description.

3. **Unknowns** — Ask about anything ambiguous (e.g., "Should this use real-time streaming or batch responses?", "Does this need persistent storage or session-only?").

Wait for the user's confirmation or corrections before continuing. Do NOT proceed until the feature scope and requirements are clear.

---

## Step 3 — Brainstorm

Brainstorm with the following context:

- The feature description from Step 1
- The classification and clarifications from Step 2
- The confirmed feature scope (frontend / backend / full-stack)
- Any specific user requirements or constraints mentioned

The brainstorm should explore:
- Different implementation approaches and trade-offs
- UX/DX considerations
- Architecture decisions
- Edge cases and potential pitfalls

Wait for the brainstorm to complete before proceeding.

---

## Step 4 — Create Implementation Plan

Based on the **feature scope** determined in Step 2, launch the appropriate agent(s):

### If scope includes Frontend:

Launch the **wxt-react-expert** agent in the **background** with the following task:

**First — gather context:**
1. Read `.claude/notes/project-overview.md` for high-level project context.
2. Read `.claude/plans/project-structure.md` for the expected file structure and architecture.
3. Read the brainstorm output from Step 3 for the chosen approach and trade-offs.
4. Scan the `extension/` directory thoroughly — look at existing components, hooks, services, types, and utilities to understand:
   - What has already been implemented vs what the design/structure docs describe.
   - Which existing components, hooks, or utilities can be **reused**.
   - What patterns and conventions the codebase follows — use these as examples.

**Then — build the frontend section of the plan:**
5. If the user chose a **component from the design** — use `pencil` MCP tools to inspect it in `.claude/docs/resume-fitter-ui-design.pen`.
6. Create a detailed frontend implementation plan incorporating the brainstorm findings.
7. The plan MUST include visual diagrams:
   - A **Mermaid component tree** showing the component hierarchy and data flow.
   - A **Mermaid state diagram** if the feature involves state transitions (e.g., loading, error, success).
   - A **Mermaid sequence diagram** showing user interactions and message passing (e.g., content script ↔ background ↔ popup).
8. Include a task list of what needs to be built (components, hooks, state, styles, etc.).
9. Clearly note which existing components/hooks/utilities to reuse and where to place new files.
10. Add **unit test** tasks — specify which components/hooks need tests and what to test.
11. Create a new E2E test scenario file in `e2e/tests/` (follow existing naming convention like `01-empty-state.md`). Each E2E task should specify that it runs via the `/debug-extension` skill.
12. The plan must follow the project's WXT-React rules and conventions.
13. Save the frontend plan section to `.claude/plans/<feature-name>-frontend.md`.

### If scope includes Backend:

Launch the **ai-node-expert** agent in the **background** with the following task:

**First — gather context:**
1. Read `.claude/notes/project-overview.md` for high-level project context.
2. Read `.claude/plans/project-structure.md` for the expected file structure and architecture.
3. Read the brainstorm output from Step 3 for the chosen approach and trade-offs.
4. Scan the `server/` directory thoroughly — look at existing routes, controllers, services, middleware, types, and utilities to understand:
   - What has already been implemented vs what the project structure docs describe.
   - Which existing services, middleware, or utilities can be **reused**.
   - What patterns and conventions the codebase follows — use these as examples.

**Then — build the backend section of the plan:**
5. Create a detailed backend implementation plan incorporating the brainstorm findings.
6. The plan MUST include visual diagrams:
   - A **Mermaid architecture diagram** showing service layers, data flow, and external dependencies.
   - A **Mermaid sequence diagram** showing request/response flow through middleware, controllers, and services.
   - A **Mermaid ER diagram** if the feature involves data models or storage.
   - An **API endpoint table** in markdown showing method, path, request/response shapes, and status codes.
7. Include a task list of what needs to be built (routes, services, middleware, types, etc.).
8. Clearly note which existing services/middleware/utilities to reuse and where to place new files.
9. Add **unit test** tasks — specify which services, routes, or middleware need tests and what to test.
10. If the feature involves AI/LLM logic, add **eval test** tasks using `test:eval` (e.g., `test:eval:extract`).
11. The plan must follow the project's Node.js AI rules and conventions (`node-ai-rules.md`).
12. Save the backend plan section to `.claude/plans/<feature-name>-server.md`.

### If scope is Full-stack:

Launch **both agents in parallel** (both in the background). Each agent saves its own plan file. Additionally, after both complete, create a **combined plan overview** at `.claude/plans/<feature-name>-overview.md` that includes:
- A **Mermaid integration diagram** showing how frontend and backend connect (API calls, message flows, shared types).
- Links to both the frontend and backend plan files.
- A unified task order showing dependencies between frontend and backend tasks.

Wait for all agents to complete before proceeding.

---

## Step 5 — Validate Plan

Launch the relevant agent(s) **in parallel in the background** — each validates only the section it is responsible for:

### If plan has a Frontend section:

Launch the **wxt-react-expert** agent in the **background**:
1. Read the frontend plan from `.claude/plans/<feature-name>-frontend.md`.
2. Validate it against:
   - The project's WXT-React rules (`wtx-react-rules.md`)
   - WXT and React best practices
3. Verify all Mermaid diagrams are syntactically correct and accurately represent the plan.
4. If there are issues — **modify the existing tasks** in the plan. Do NOT restructure.
5. Confirm the frontend plan is ready.

### If plan has a Backend section:

Launch the **ai-node-expert** agent in the **background**:
1. Read the backend plan from `.claude/plans/<feature-name>-server.md`.
2. Validate it against:
   - The project's Node.js AI rules (`node-ai-rules.md`)
   - Node.js, Express, and Vercel AI SDK best practices
3. Verify all Mermaid diagrams are syntactically correct and accurately represent the plan.
4. If there are issues — **modify the existing tasks** in the plan. Do NOT restructure.
5. Confirm the backend plan is ready.

### Always — Security Validation:

Launch the **security-scanner** agent in the **background** (in parallel with the above):
1. Read all plan files from `.claude/plans/<feature-name>-*.md`.
2. Review for security concerns:
   - Content script isolation and CSP compliance
   - Extension permissions (principle of least privilege)
   - Input validation and sanitization
   - Secure messaging patterns
   - API authentication and authorization
   - Data handling and storage security
3. If there are security concerns — **modify the existing tasks** in the relevant plan file. Do NOT restructure.
4. Confirm the plan passes security review.

Wait for all validation agents to complete before proceeding.

---

## Step 6 — Notify on Slack

Send a summary message to Slack via `mcp__claude-slack-bridge__ask_on_slack` containing:

- Feature that was planned
- Scope: Frontend / Backend / Full-stack
- Plan file location(s) in `.claude/plans/`
- E2E test file location in `e2e/tests/` (if applicable)
- Summary of what the plan covers (components, services, tests, security considerations)
- Key diagrams included (component tree, sequence diagrams, architecture, etc.)
- Status: **Ready for review**

Inform the user that the plan is complete and ready for their review before implementation begins.

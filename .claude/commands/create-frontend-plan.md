# Create Frontend Agent

You are the **Frontend Agent Orchestrator** — you guide the user through planning and validating a frontend feature or component implementation for the WXT + React browser extension.

---

## Step 1 — Gather Requirements

Ask the user the following question:

**What would you like to implement?**

1. **A component from the UI design** — Pick a component or screen from the `.claude/docs/resume-fitter-ui-design.pen` file.
2. **A general frontend feature** — Describe the feature you want to build.

Use the `pencil` MCP tools (`batch_get`, `get_screenshot`) to read the `.pen` design file and present the available components/screens so the user can choose.

Wait for the user's response before continuing.

---

## Step 2 — Create Implementation Plan

Launch the **wxt-react-expert** agent in the **background** with the following task:

**First — gather context before doing anything else:**

1. Read `.claude/notes/project-overview.md` for high-level project context.
2. Read `.claude/plans/project-structure.md` for the expected file structure and architecture.
3. Scan the `extension/` directory thoroughly — look at existing components, hooks, services, types, and utilities to understand:
   - What has already been implemented vs what the design/structure docs describe.
   - Which existing components, hooks, or utilities can be **reused** for the new feature.
   - What patterns and conventions the codebase already follows (styling approach, component structure, naming, etc.) — use these as examples for the new implementation.
   - Any deviations from the planned project structure that need to be accounted for.

**Then — build the plan:**

3. If the user chose a **component from the design**:
   - Use the `pencil` MCP tools to inspect the chosen component in `.claude/docs/resume-fitter-ui-design.pen` (use `batch_get` to read structure, `get_screenshot` for visual reference).

4. If the user chose a **general feature**:
   - Gather any additional context needed for the feature from the codebase.

5. Create a detailed implementation plan based on the UI design / feature description.
6. The plan should include a task list of what needs to be built (components, hooks, state, styles, etc.).
7. Clearly note which existing components/hooks/utilities to reuse and where to place new files.
8. Save the plan as a new `.md` file in `.claude/plans/` with a descriptive name.
9. The plan must follow the project's WXT-React rules and conventions.

Wait for the agent to complete before proceeding.

---

## Step 3 — Add Tests to the Plan

Launch the **wxt-react-expert** agent in the **background** with the following task:

1. Read the plan created in Step 2 from `.claude/plans/`.
2. Add **unit test** tasks to the existing plan — specify which components/hooks need unit tests and what to test.
3. Create a new E2E test scenario file in `e2e/tests/` (follow the naming convention of existing files like `01-empty-state.md`) describing all the scenarios that need to be tested for this feature. Note that these E2E scenarios should be executed using the `/debug-extension` skill.
4. Add the E2E test scenarios as new tasks in the **existing plan**. Each E2E task should specify that it runs via the `/debug-extension` skill.

Wait for the agent to complete before proceeding.

---

## Step 4 — Validate Plan (WXT-React Expert)

Launch the **wxt-react-expert** agent in the **background** with the following task:

1. Read the full plan from `.claude/plans/` (the one created and updated in Steps 2–3).
2. Validate it against:
   - The project's WXT-React rules (`wtx-react-rules.md`)
   - WXT and React best practices
3. If there are issues or improvements needed — **modify the existing tasks** in the plan. Do NOT add new sections or restructure the plan.
4. Confirm the plan is complete and ready for implementation.

Wait for the agent to complete before proceeding.

---

## Step 5 — Security Validation

Launch the **security-scanner** agent in the **background** with the following task:

1. Read the full plan from `.claude/plans/` (the one validated in Step 4).
2. Review the planned implementation for potential security concerns:
   - Content script isolation and CSP compliance
   - Extension permissions (principle of least privilege)
   - Input validation and sanitization
   - Secure messaging patterns
   - Any data handling or storage security issues
3. If there are security concerns — **modify the existing tasks** in the plan to address them. Do NOT add new sections or restructure the plan.
4. Confirm the plan passes security review.

Wait for the agent to complete before proceeding.

---

## Step 6 — Notify on Slack

Send a summary message to Slack via `mcp__claude-slack-bridge__ask_on_slack` containing:

- Feature/component that was planned
- Plan file location in `.claude/plans/`
- E2E test file location in `e2e/tests/`
- Summary of what the plan covers (components, tests, security considerations)
- Status: **Ready for review**

Inform the user that the plan is complete and ready for their review before implementation begins.

# Run Plan

You are the **Plan Runner** — an orchestrator that executes a development plan end-to-end using agents, security scanning, tests, and Slack communication.

**UI Design Reference:** The design file is located at `.claude/docs/resume-fitter-ui-design.pen` — use it as a visual reference when implementing UI changes.

---

## Step 1 — Gather Requirements

Ask the user the following questions (combine into one message):

1. **Which plan do you want to run?** List all `.md` files found in `.claude/plans/` so the user can pick one (or describe a new plan).
2. **Which agents should handle this?** Available agents in `.claude/agents/`:
   - `ai-node-expert` — Node.js + Vercel AI SDK backend work
   - `wxt-react-expert` — WXT + React extension work
   - `hiring-manager-reviewer`, `rewrite-resume`, `application-tracking-system`, `cv-researcher` — CV pipeline agents
   - Or describe a custom combination
Ask the user these questions directly in the conversation and wait for their response before continuing.

---

## Step 2 — Build Task List

Using the TodoWrite tool, create a detailed task list covering:

- [ ] Implementation tasks (one item per logical change, file, or feature)
- [ ] Validation tasks (per agent that validates work)
- [ ] Security scan
- [ ] E2E tests (if applicable)
- [ ] Final Slack notification

Mark each task as **in_progress** when you start it and **completed** immediately when it is done.

---

## Step 3 — Run Agents (Developer + Validator)

1. Run the **developer** agent in the background — wait for completion notification.
2. Then run the **validator** agent in the background — wait for completion notification.

---

## Step 4 — Security Scan

After all agents have finished:

1. Launch the **security-scanner** agent (defined in `.claude/agents/security-scanner.md`) using the Agent tool.
2. Provide it with: the list of files that were created or modified during Step 4.
3. Wait for the scan to complete (run in foreground or background — your choice).

**If issues are found:**

- Add each issue as a new task in the TodoWrite task list.
- Loop back to **Step 3** to fix the issues (use the same agent selection the user chose).
- Re-run the security scan after each fix loop until no issues remain.

**If no issues are found:** proceed to Step 5.

---

## Step 5 — E2E Tests (if applicable)

Check if the plan includes E2E tests. If it does:

1. Run the `debug-extension` skill in the background to launch the extension and execute E2E tests.
2. Wait for the background task to complete.

**If tests fail:**

- Add each failure as a new task in the TodoWrite task list with the issue details.
- Loop back to **Step 3** to fix the issues (use the same agent selection the user chose).
- Re-run from Step 4 after fixes.

**If unable to run the tests** (environment issues, missing dependencies, browser won't launch, etc.):

- Do **not** retry. Instead, write a note to `.claude/notes/` describing what was attempted and why it failed.
- Proceed to Step 6.

**If tests pass (or no E2E tests exist):** proceed to Step 6.

---

## Step 6 — Final Slack Notification

Send a summary message to Slack via `mcp__claude-slack-bridge__ask_on_slack` containing:

- Plan that was executed
- Agents used
- Summary of changes made (files created/modified)
- Security scan result (pass / issues found + fixed)
- E2E test result (pass / failed + fixed / skipped)
- Any open questions or follow-up items

Wait for the user's response. If they request changes or have follow-up work, start a new loop from Step 1 with their instructions.

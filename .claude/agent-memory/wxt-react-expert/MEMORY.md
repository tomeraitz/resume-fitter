# WXT-React Expert Agent Memory

## Key File Paths
- WXT-React rules: `.claude/docs/wxt-react-rules.md`
- Node/AI rules: `.claude/docs/node-ai-rules.md`
- Plans directory: `.claude/plans/`
- Extension root: `extension/`

## Project Structure (as of 2026-03)
- Extension is greenfield — only `tailwind.config.ts` exists as a TS file
- Directories created but empty: `entrypoints/`, `types/`, `services/`, `components/`, `hooks/`, `utils/`
- No `wxt.config.ts` found at extension root — may be at monorepo root or not yet created

## Architecture Decisions
- Two-layer state: persistent (chrome.storage.local) + transient (chrome.storage.session)
- 4-agent CV pipeline: hiring-manager -> rewrite-resume -> ats-scanner -> verifier
- Backend: Node.js + Vercel AI SDK + Express (in `server/`)
- Branch `client-state-management` for state management work

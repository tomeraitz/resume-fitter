# WXT-React Expert Agent Memory

## Key File Paths
- WXT-React rules: `.claude/docs/wxt-react-rules.md`
- Node/AI rules: `.claude/docs/node-ai-rules.md`
- Plans directory: `.claude/plans/`
- Extension root: `extension/`
- Design tokens CSS: `extension/assets/design-tokens.css`
- Tailwind config: `extension/tailwind.config.ts`
- Storage service barrel: `extension/services/storage/index.ts`

## Project Structure (as of 2026-03)
- WXT 0.20.7, React 19.1, Tailwind 3.4
- Content script overlay: `extension/entrypoints/content/overlay/`
- Hooks: `overlay/hooks/useUserProfile.ts`, `overlay/hooks/usePipelineSession.ts`
- Storage: profile (local) + pipeline session (session) via WXT `storage.defineItem`
- Types: `extension/types/storage.ts`, `pipeline.ts`, `messages.ts`
- Background SW: `extension/entrypoints/background.ts`
- No testing setup yet (vitest not installed)
- No lucide-react installed yet

## Architecture Decisions
- Two-layer state: persistent (browser.storage.local) + transient (browser.storage.session)
- 4-agent CV pipeline: hiring-manager -> rewrite-resume -> ats-scanner -> verifier
- Backend: Node.js + Vercel AI SDK + Express (in `server/`)
- Content script uses Shadow DOM via WXT `createShadowRootUi`
- Design system: "Warm Editorial" — Instrument Serif + DM Sans, amber/gold accent
- CSS vars prefixed `--rf-` in `:host, :root`
- Profile complete = cvTemplate AND professionalHistory non-empty

## UI Component Plan
- OverlayShell (reusable frame) > body panels (InitialPanel, ProgressPanel, etc.)
- Shell = Header + Footer + children slot
- No shared Button component yet — per no-premature-abstraction rule

## Conventions
- Plan files: `.claude/plans/*-plan.md` with tables, code blocks, compliance checklists
- Branch naming: kebab-case

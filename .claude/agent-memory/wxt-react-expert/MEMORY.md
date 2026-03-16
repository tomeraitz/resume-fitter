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
- Content script entrypoint: `extension/entrypoints/main-popup.content/` (renamed from overlay)
- Hooks: `main-popup.content/hooks/useUserProfile.ts`, `usePipelineSession.ts`
- Storage: profile (local) + pipeline session (session) via WXT `storage.defineItem`
- Types: `extension/types/storage.ts`, `pipeline.ts`, `messages.ts`
- Background SW: `extension/entrypoints/background.ts`
- Testing: vitest + @testing-library/react installed, tests co-located
- lucide-react installed and in use

## Architecture Decisions
- Two-layer state: persistent (browser.storage.local) + transient (browser.storage.session)
- 4-agent CV pipeline: hiring-manager -> rewrite-resume -> ats-scanner -> verifier
- Backend: Node.js + Vercel AI SDK + Express (in `server/`)
- Content script uses Shadow DOM via WXT `createShadowRootUi`
- Design system: "Warm Editorial" — Instrument Serif + DM Sans, amber/gold accent
- CSS vars prefixed `--rf-` in `:host, :root`
- Profile complete = cvTemplate AND professionalHistory non-empty
- AppView state machine in App.tsx: 'initial' | 'profile' | 'extracting' | 'extract-done'
- PopupStatus: 'connected' | 'incomplete' | 'complete' | 'error' | 'extracting' | 'ready'

## UI Component Plan
- MainPopup (reusable shell) > body panels via children slot
- Existing: InitialPanel, ProfilePanel, PopupHeader, PopupFooter
- Planned: ExtractLoadingPanel, ExtractFinishedPanel (see extract-loading-finished.md)
- No shared Button component — per no-premature-abstraction rule
- Fonts bundled as WOFF2, injected into Shadow DOM root

## Conventions
- Plan files: `.claude/plans/*.md` with tables, code blocks, compliance checklists
- Branch naming: kebab-case
- Design file: `.claude/docs/resume-fitter-ui-design.pen`

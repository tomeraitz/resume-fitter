# UI Design Setup Plan

> Goal: Set up Pencil.dev + frontend-design skill, define the extension's design system, and create the first component visible in Pencil.

---

## Phase 1: Install Pencil.dev Desktop

- [ ] **1.1** Download Pencil desktop for Windows from https://www.pencil.dev/download/Pencil-win-x64.exe
- [ ] **1.2** Install and launch — authenticate with Claude Code CLI when prompted
- [ ] **1.3** Open the `resume-fitter` project folder in Pencil
- [ ] **1.4** Configure Pencil MCP server in `.claude/settings.json` so Claude Code can read/write Pencil designs
- [ ] **1.5** Confirm MCP connection works — run a quick test prompt asking Claude to read the Pencil canvas

## Phase 2: Install frontend-design Skill

- [ ] **2.1** Run `npx skills add anthropics/claude-code -- skill frontend-design` from the project root
- [ ] **2.2** Verify the skill was added to `.claude/skills/` or `.claude/commands/`
- [ ] **2.3** Test the skill — ask Claude to generate a simple styled button and confirm output is React + Tailwind

## Phase 3: Define the Design System

- [ ] **3.1** Use the frontend-design skill to define the main design tokens:
  - **Color palette** — primary, secondary, accent, neutral, error, success (suited for a professional CV tool)
  - **Typography** — font family (e.g. Inter), font sizes, weights, line heights
  - **Spacing** — consistent scale (4px base)
  - **Border radius** — consistent rounding (e.g. rounded-lg)
  - **Shadows** — elevation levels for popups/overlays
  - **Component library** — shadcn/ui as the base
- [ ] **3.2** Save the design system to `extension/tailwind.config.ts` (theme extend) and document it in `.claude/rules/design-system.md` so all future Claude generations follow it
- [ ] **3.3** Create a `design-tokens.css` or Tailwind CSS layer with CSS custom properties for the tokens

## Phase 4: Design Components in Pencil (Design-First)

- [ ] **4.1** Design the **Overlay shell** in Pencil canvas:
  - Floating panel anchored to bottom-right of the page
  - Header with extension name + collapse/close buttons
  - Body area (placeholder for ProgressPanel / CvOutput)
  - Footer with status text
  - Apply the design tokens from Phase 3 (colors, typography, spacing, radius)
- [ ] **4.2** Design the **ProgressPanel** in Pencil:
  - Step-by-step agent progress display (1/4 → 4/4)
  - Step labels, status icons, progress indicators
- [ ] **4.3** Design the **CvOutput** view in Pencil:
  - Rendered CV preview area
  - ATS score badge, action buttons (copy, download)
- [ ] **4.4** Design the **ErrorBanner** in Pencil:
  - Error state with message and retry button
- [ ] **4.5** Review and iterate on all designs in Pencil — adjust spacing, colors, layout until satisfied
- [ ] **4.6** Export / save Pencil designs as reference for development (screenshots or Pencil project files)

## Phase 5: Develop Components from Pencil Designs

- [ ] **5.1** Use the Pencil → Claude MCP bridge to generate React code from the Overlay shell design
- [ ] **5.2** Generate React code from the ProgressPanel design
- [ ] **5.3** Generate React code from the CvOutput design
- [ ] **5.4** Generate React code from the ErrorBanner design
- [ ] **5.5** Verify each generated component matches the Pencil design and uses the design system tokens

---

## Dependencies & Prerequisites

| Requirement | Status |
|---|---|
| VS Code installed | ✅ |
| Claude Code active | ✅ |
| Node.js + npm available | ✅ |
| Pencil desktop app (Windows x64) | ❌ To install |
| frontend-design skill | ❌ To install |
| `extension/` directory | ❌ To scaffold |

## Success Criteria

1. Pencil canvas is working inside VS Code with MCP bridge to Claude Code
2. frontend-design skill generates styled React/Tailwind components on demand
3. Design system is defined once and enforced across all future components
4. The Overlay shell component renders in both Pencil canvas and a WXT dev build

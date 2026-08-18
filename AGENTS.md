# AGENTS.md

## Read First

Before implementation, read:

1. `agents/prd.md` — product requirements, scope, and acceptance criteria.
2. `agents/architecture.md` — stack, processing strategy, and technical constraints.
3. `agents/design.md` — visual system, layout, states, responsive, and UI rules.

Treat these files as the source of truth. If they conflict, stop and resolve the conflict before changing behavior.

## Project Rules

- Build only what is required by the PRD.
- Use Astro as the primary frontend framework.
- Prefer `.astro` components and static rendering by default.
- Use client-side islands only where interactivity is genuinely required.
- Prefer vanilla TypeScript for simple interactive behavior.
- Do not introduce React, Vue, Svelte, or another UI runtime unless clearly justified.
- Reuse shared components and processing engines before creating new ones.
- Keep file processing browser-first whenever required by the architecture.
- Never persist or upload user files unless explicitly required.
- Do not add accounts, cloud storage, AI features, or unrelated utilities.
- Do not introduce new production dependencies without a clear technical need.
- Do not change product behavior, architecture, or visual rules silently.
- Keep implementations simple, maintainable, typed, and consistent.

## UI

- Follow `agents/design.md`.
- Preserve the shared flow: select → configure → process → download.
- Keep utility UI more important than decoration.
- Reuse existing tokens, components, states, and layouts.
- Do not invent new colors, gradients, or page patterns per tool.
- Support mobile, keyboard navigation, visible focus, and reduced motion.

## Verification

Before considering work complete:

- run lint;
- run type checks;
- run relevant tests;
- run the production build;
- verify the affected flow manually;
- check loading, error, success, and mobile states where applicable;
- ensure no user file data is sent to analytics or persisted.

Do not mark work complete while known errors, failing tests, or requirement gaps remain.

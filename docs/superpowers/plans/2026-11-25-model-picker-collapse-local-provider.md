# Model Picker Collapse and Local Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Add a collapse-all control and emphasize llama.cpp as local compute.

**Architecture:** Reuse collapsedProviders/setGroupOpen for the picker control. Move the existing llama.cpp card above the provider grid, style a left-logo/right-details layout, and remove its duplicate tile.

**Tech Stack:** Electron renderer HTML/CSS/JS and existing UI self-check scripts.

**Spec:** `docs/superpowers/specs/2026-11-25-model-picker-collapse-local-provider-design.md`

## Global Constraints
- Preserve pre-existing working-tree changes.
- No dependencies, version bump, commit, or release.
- Use Sara AM U+0E33 in Thai text.

## Review Focus
- Search/filter open-state behavior remains intact; verify using existing model menu checks.
- llama.cpp controls remain in same DOM location relative to their IDs and handlers; verify existing local vision check.
- Provider grid remains alphabetically ordered after removing llama.cpp; verify provider grid check.

---

### Task 1: Model picker collapse-all

**Files:** Modify `app/src/renderer/index.html`, `app/src/renderer/app.js`, `app/src/renderer/styles.css`; extend relevant model menu check if feasible.

- [ ] Add an accessible “Collapse all” button beside model search.
- [ ] On click, add all rendered provider keys to `collapsedProviders`, close each group with `setGroupOpen`, and persist via `saveCollapsedProviders`.
- [ ] Keep search behavior unchanged; search may still open groups temporarily.
- [ ] Add/extend a check to assert click collapses every provider group.
- [ ] Run targeted model menu check and relevant unit suite.

### Task 2: Local llama.cpp card layout

**Files:** Modify `app/src/renderer/index.html`, `app/src/renderer/styles.css`, and relevant UI check.

- [ ] Move the existing `#llamacppRow` above the provider grid; add explicit text explaining it runs locally/on this machine, using existing i18n conventions.
- [ ] Style card with logo on the left and status/details/controls on the right, responsive for narrow layouts.
- [ ] Remove only the llama.cpp tile from the grid; keep its card and all existing element IDs/handlers.
- [ ] Verify provider-grid and local-vision checks.

### Final verification

- [ ] Run full `npm test`, `npm run check:sara`, and `npm run prove:verify` from `app/`; report pre-existing failures without hiding them.

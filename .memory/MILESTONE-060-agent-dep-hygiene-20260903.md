# Milestone: Agent dependency hygiene (060) — 2026-09-03

## Problem
Simultaneous agents raced on shared installs (`npm ci` / cleanup mid-build).

## Contract
- Spec: `specs/060-agent-dep-hygiene/spec.md`
- Spec 005 local gate: reuse `node_modules` + conditional `npm install` + `npm run build` (no local `npm ci`)
- Always-on rule: `.cursor/rules/agent-dep-hygiene.mdc` (npm / Go / Python)
- Soft concurrency only (no flock); cleanup is human-only unless explicitly requested

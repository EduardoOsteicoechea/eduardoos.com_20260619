# Spec: Spec-first agent workflow (absolute)

## Status

Active — enforced via `.cursor/rules/spec-first.mdc` + `.cursorrules` §9.

## Problem

Agents jumped to code from chat, guessed ambiguous requirements, and left behavior undocumented.

## Goals

1. Every durable change updates (or creates) a clear `specs/**` document first.
2. Agents ask until the intent is unambiguous — no guessing on material alternatives.
3. Implementation is coded **from the spec**; chat is not the source of truth once a spec exists.
4. Spec and shipped behavior stay aligned (update spec if reality changes, with agreement).

## Non-goals

- Replacing automated tests as the merge/ship gate.
- Writing a new numbered feature folder for one-character typos with zero behavior change.

## Acceptance

- [x] Always-on Cursor rule: `.cursor/rules/spec-first.mdc`
- [x] `.cursorrules` Phase 0 = Spec before plan/TDD
- [ ] Future agent turns stop and ask when ambiguous instead of inventing scope

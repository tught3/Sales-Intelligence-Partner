# PROJECT

## Overview
- Repository: `Sales-Intelligence-Partner`
- Type: brownfield workspace / monorepo
- Primary stack: TypeScript, React, Express, PostgreSQL, Drizzle, Vite
- Package manager: pnpm

## Current Layout
- `artifacts/api-server` - Express API server
- `artifacts/sales-intelligence` - React frontend
- `lib/db` - shared database layer
- `lib/api-zod` - shared API schemas

## What We Know
- The repo already has working app code and operational docs.
- Existing guardrails live in `AGENTS.md`, `CLAUDE.md`, and `docs/agent-rules-*.md`.
- The main goal for this session is to make the repo GSD-ready, then work the next requested change in a structured way.

## First Focus
- Confirm the codebase shape.
- Capture the current state in `.planning/context/ACTIVE_SUMMARY.md`.
- Keep the next implementation task small and well-scoped.

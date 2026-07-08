# Contributing to NereidAI

Thank you for your interest in contributing! This document describes how to
get started and the conventions we follow.

## Code of Conduct

By participating, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

1. Fork and clone the repository.
2. Install dependencies: `npm install`.
3. Start the dev servers:
   - Backend BFF: `npm run dev:backend` (listens on `:3001`)
   - Frontend: `npm run dev` (Vite, proxies `/api` to `:3001`)
4. Run the full stack via Docker: `docker compose up --build -d`.

## Development Workflow

- Create a feature branch off `main`: `git checkout -b feat/short-description`.
- Keep changes focused; one logical change per PR.
- Run `npm run typecheck` and `npm run build` before pushing.
- Follow the existing code style (Prettier/ESLint defaults for this repo).

## Coding Conventions

- **Language**: TypeScript (frontend) and plain CommonJS (`.cjs`, backend).
- **Comments**: All code comments MUST be written in **English**.
- **License header**: Every source file must begin with the SPDX short header:
  ```ts
  // Copyright (C) 2026 YIQISOFT
  //
  // SPDX-License-Identifier: Apache-2.0
  ```
- **Security**: Never log secrets or full credentials. Never store Exchange
  passwords in the browser. Credentials are encrypted server-side (AES-256-GCM).
- **i18n**: User-facing strings go through the `t()` translation helper; do not
  hardcode display text. Add keys to both languages as needed.

## Pull Requests

- Reference any related issue (e.g. `Closes #123`).
- Describe what changed and why.
- Ensure CI (typecheck + build + docker build) passes.
- PRs require at least one review before merge.

## Reporting Bugs

Open a GitHub issue using the bug template, including:
- Steps to reproduce
- Expected vs actual behavior
- Environment (Exchange version, browser, deployment mode)

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).

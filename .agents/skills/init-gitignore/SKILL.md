---
name: init-gitignore
description: Use when the user wants to create or initialise a .gitignore file, set up gitignore for a project, or run "/init-gitignore". Scans the repository, detects languages and frameworks, proposes additions drawn from the gitignore-snippets skill, gets user approval, then writes the file.
---

# Init .gitignore

Create or update a `.gitignore` at the repository root by analysing the codebase and composing
the right entries from the `gitignore-snippets` reference, with user approval before writing.

---

## Step 1 — Check for an existing `.gitignore`

Use `glob` to look for a `.gitignore` at the repository root:

```
glob: pattern=".gitignore"
```

- **File exists** → read it with `read_file` so you know what is already covered. Continue to Step 2.
- **File does not exist** → note that one will be created from scratch. Continue to Step 2.

---

## Step 2 — Detect the stack

Run these searches in parallel to determine which languages and tooling are present.
Only probe — do not read full file contents at this stage.

| Signal | Tool call |
|--------|-----------|
| `package.json` present | `glob pattern="package.json"` |
| `*.py` files present | `glob pattern="**/*.py"` |
| `manage.py` present (Django) | `glob pattern="**/manage.py"` |
| `app.py` / `main.py` + `flask`/`fastapi` in requirements | `glob pattern="requirements*.txt"`, then `grep pattern="flask\|fastapi"` |
| `*.java` files present | `glob pattern="**/*.java"` |
| `pom.xml` present (Maven) | `glob pattern="pom.xml"` |
| `build.gradle` present (Gradle) | `glob pattern="**/*.gradle"` |
| `*.cs` / `*.csproj` present | `glob pattern="**/*.csproj"` |
| `*.go` / `go.mod` present | `glob pattern="go.mod"` |
| `next.config.*` (Next.js) | `glob pattern="next.config.*"` |
| `nuxt.config.*` (Nuxt) | `glob pattern="nuxt.config.*"` |
| `svelte.config.*` (Svelte) | `glob pattern="svelte.config.*"` |
| `vite.config.*` | `glob pattern="vite.config.*"` |
| Multiple languages detected | Treat as monorepo candidate |

Build a list of detected stacks from the results. A project may match more than one (e.g. Node
backend + Python scripts).

---

## Step 3 — Compose a proposed `.gitignore`

Using the detected stacks, assemble the relevant snippet sections from the
`gitignore-snippets` skill:

1. Always start with the **Global patterns** section (OS, editors, logs, env/secrets).
2. Add each detected stack's section.
3. If two or more distinct stacks are detected, prefer the **Monorepo** template as the base,
   then merge any stack-specific entries that are not already covered.
4. If a `.gitignore` already exists, diff the proposed additions against the existing content:
   - Entries already present → skip silently.
   - New entries → mark clearly as additions.
   - Entries in the existing file that conflict with recommended patterns → flag as suggestions
     (do not remove automatically).

---

## Step 4 — Present the proposal and ask for approval

Show the user a clear summary:

```
📋 Detected stacks: Node.js (TypeScript), Python

Proposed .gitignore additions:
─────────────────────────────
[full proposed file content, or diff if file already exists]
─────────────────────────────

Proceed? (yes / edit / skip)
```

Use `ask_followup_question` with these suggestions:
- **Yes, write it** — apply the proposal as-is.
- **Let me edit first** — paste your changes and I'll apply them.
- **Skip** — do nothing.

If the user wants to edit, accept their modifications and confirm the final content before writing.

---

## Step 5 — Write the file

Once the user approves:

- **New file** → use `write_file` to create `.gitignore` at the repository root with the full
  proposed content.
- **Existing file with additions** → use `insert_content` to append new sections to the existing
  file, preserving all current content exactly.

Confirm with the user once written:

```
✅ .gitignore written at repository root.
```

---

## Notes

- Never remove or overwrite entries already in an existing `.gitignore` without explicit user
  instruction.
- If the stack cannot be determined (empty repo, no recognisable files), fall back to the Global
  patterns section only and tell the user so.
- Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) are included in the Node.js
  snippet but some teams commit them intentionally — mention this if including them.

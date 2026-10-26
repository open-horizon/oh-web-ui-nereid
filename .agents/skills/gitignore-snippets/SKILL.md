---
name: gitignore-snippets
description: Use when the user asks for a .gitignore template, starter, or example for a specific language or stack — Node.js, Python, Django, Flask/FastAPI, Java, C#/.NET, Go, frontend (React/Vue/Svelte), or monorepo setups. Also use for questions like "what should I add to my .gitignore?" or "help me set up gitignore for my project".
---

# .gitignore Snippets

Concise, practical `.gitignore` examples for common stacks. Treat each as a base and add project-specific bits (env files, build artifacts, secrets).

## Global patterns (apply to almost any project)

```text
# OS
.DS_Store
Thumbs.db

# Editors / IDEs
.vscode/
.idea/
*.swp
*.swo

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Env / secrets
.env
.env.*
!.env.example
```

## Node.js (backend / CLI)

```text
node_modules/
dist/
build/
coverage/
.npm/
.yarn/
.yarn/cache/
.pnp.*
.parcel-cache/
.cache/
.eslintcache

# TypeScript
*.tsbuildinfo

# Testing
coverage/
.jest/

# Package managers
package-lock.json
yarn.lock
pnpm-lock.yaml
```

## Frontend (React / Vue / Svelte)

```text
node_modules/
dist/
build/
coverage/
.cache/
.parcel-cache/
.next/
.nuxt/
.out/
.storybook-out/
.vite/
.svelte-kit/

# Static exports
out/

# Tools
.eslintcache
.stylelintcache
```

## Python (packages, scripts, data science)

```text
# Bytecode
__pycache__/
*.py[cod]
*$py.class

# Env / tools
.env
.venv/
venv/
env/
pip-wheel-metadata/
.mypy_cache/
.pytest_cache/
.ipynb_checkpoints/
.coverage*
htmlcov/
.tox/
.pybuilder/
.pyre/
.dmypy.json
.pytype/

# Build / dist
build/
dist/
*.egg-info/
.eggs/

# Data artifacts
*.sqlite3
*.db
*.sqlite
*.h5
*.hdf5
*.parquet
*.feather
*.pkl
*.pickle

# Jupyter exports
*.nbconvert.ipynb
```

## Django

```text
# Python base
__pycache__/
*.py[cod]
*$py.class
env/
.venv/
venv/
.mypy_cache/
.pytest_cache/

# Django
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal
media/
staticfiles/

# Build
build/
dist/
*.egg-info/
```

## Flask / FastAPI

```text
__pycache__/
*.py[cod]
env/
.venv/
venv/
instance/
*.db
*.sqlite3

# Migrations (optional)
migrations/**/__pycache__/
migrations/**/*.py[cod]

# Tests / tools
.pytest_cache/
.mypy_cache/
coverage/
htmlcov/
```

## Java (Maven / Gradle)

```text
# Maven
target/

# Gradle
.gradle/
build/

# IDE
.idea/
*.iml
*.iws
*.ipr
.project
.classpath
.settings/

# Logs / misc
*.log
*.class
hs_err_pid*
```

## C# / .NET

```text
bin/
obj/
[Bb]uild/
[Bb]uilds/
TestResults/
*.user
*.suo
*.userprefs

# IDE
.vs/
.idea/
*.ncrunch*
```

## Go

```text
# Modules
bin/
vendor/

# Build
*.exe
*.test
*.out

# Tools
coverage.out
```

## Monorepo (mixed: Node + Python + misc)

```text
# Global
.DS_Store
Thumbs.db
.vscode/
.idea/
*.log
logs/

# Node
node_modules/
dist/
build/
.cache/
.pnp.*
.yarn/
.yarn/cache/

# Python
__pycache__/
*.py[cod]
.venv/
venv/
env/
.mypy_cache/
.pytest_cache/
.ipynb_checkpoints/

# Packages
build/
dist/
*.egg-info/
.eggs/

# Env
.env
.env.*
!.env.example
```

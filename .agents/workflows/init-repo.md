---
description: Initialize a new repository with essential files (LICENSE, README, .gitignore, etc.)
---

Initialize a new repository with all essential files and structure.

This workflow sets up a complete repository foundation including:
- LICENSE.md (Apache 2.0 or MIT recommended)
- README.md (with project structure)
- .gitignore (language-specific)
- CONTRIBUTING.md (optional)
- CODE_OF_CONDUCT.md (optional)
- MAINTAINERS.md (add the current Committer by default)
- Makefile (use the required minimum targets)

**Input**: Optionally specify which components to initialize. If omitted, will prompt for each.

**Steps**

1. **Assess current repository state**

   Check what already exists:
   ```bash
   ls -la LICENSE* README* .gitignore CONTRIBUTING* CODE_OF_CONDUCT* MAINTAINER* Makefile 2>/dev/null
   ```

   Identify:
   - Which files are missing
   - Which files are empty or incomplete
   - Repository type (detect from existing files/directories, using **Skill tool** to invoke `init-gitignore` to detect and categorize)

2. **Initialize LICENSE file**

   Use the **Skill tool** to invoke `init-license`:
   ```
   Invoke init-license skill to set up repository license
   ```

   This will:
   - Check for existing LICENSE files
   - Prompt user to choose license (recommend Apache 2.0 or MIT)
   - Download from official sources
   - Customize with copyright info if needed
   - Save as LICENSE.md

   **Skip if:** LICENSE file already exists and user doesn't want to replace it

3. **Create or update README.md**

   Use the **Skill tool** to invoke `init-readme`:
   ```
   Invoke init-readme skill to set up README.md
   ```

   This will:
   - Check whether a `README.md` already exists at the repository root
   - If missing: detect the service name, GitHub repo path, and architectures; confirm with the user; then generate a full Open Horizon–style README with shields, prerequisites, installation, usage, debugging, and a complete Makefile targets table
   - If present: audit the existing README against the standard section checklist (shields, prerequisites, installation, usage, `### All Makefile targets`, etc.) and present targeted recommendations for any missing or incomplete sections

   **Skip if:** README.md already exists and the user declines all recommendations during the skill's audit step

4. **Create .gitignore**

   Use the **Skill tool** to invoke `init-gitignore`:
   ```
   Invoke init-gitignore skill to set up repository .gitignore
   ```

   This will:
   - Check whether a `.gitignore` already exists at the repository root
   - Scan the codebase to detect languages and frameworks
   - Compose a tailored proposal from the `gitignore-snippets` skill (Global patterns + detected stacks)
   - Diff against any existing `.gitignore`, preserving current entries
   - Present the proposal and get explicit user approval before writing
   - Write the file (or append additions if one already exists)

   **Skip if:** `.gitignore` already exists and user declines to add anything during the skill's approval step

5. **Create or update MAINTAINERS.md**

  Use the **Skill tool** to invoke `init-maintainers`:
  ```
  Invoke init-maintainers skill to set up MAINTAINERS.md
  ```

  This will:
  - Check whether a `MAINTAINERS.md` already exists
  - Prompt for each active maintainer's name, GitHub ID, and email address
  - Optionally collect emeritus maintainer entries
  - Write the file in the canonical Open Horizon table format
  - Require at least one active maintainer before writing

  **Skip if:** MAINTAINERS.md already exists and user declines to replace or append during the skill's confirmation step

6. **Create Makefile**

  Use the **Skill tool** to invoke `init-makefile`:
  ```
  Invoke init-makefile skill to set up Makefile
  ```

  This will:
  - Check whether a `Makefile` already exists at the repository root
  - Detect the service/container name from `service.definition.json` or the repository directory name
  - Confirm the detected name and any service-specific values (DockerHub ID, port, volume path) with the user
  - Write a `Makefile` skeleton using the Open Horizon third-party-image pattern (no build/push step)
  - Replace all template placeholder references with the actual service name

  **Skip if:** Makefile already exists and user declines to replace it during the skill's confirmation step

7. **Create CONTRIBUTING.md (optional)**

   Ask user: "Would you like to add a CONTRIBUTING.md file?"

   **If yes:**
   - Create standard contributing guidelines:
     ```markdown
     # Contributing to [Project Name]
     
     Thank you for your interest in contributing!
     
     ## How to Contribute
     
     1. Fork the repository
     2. Create a feature branch (`git checkout -b feature/amazing-feature`)
     3. Commit your changes (`git commit -m 'Add amazing feature'`)
     4. Push to the branch (`git push origin feature/amazing-feature`)
     5. Open a Pull Request
     
     ## Development Setup
     
     [Add project-specific setup instructions]
     
     ## Code Style
     
     [Add code style guidelines]
     
     ## Testing
     
     [Add testing requirements]
     
     ## License
     
     By contributing, you agree that your contributions will be licensed under the [LICENSE_TYPE].
     ```

   - Customize with project-specific details
   - Add DCO (Developer Certificate of Origin) if needed:
     ```markdown
     ## Developer Certificate of Origin
     
     All commits must be signed off with `git commit -s` to indicate agreement with the DCO.
     ```

   - Reference the project contributing document as needed: https://raw.githubusercontent.com/open-horizon/.github/refs/heads/master/CONTRIBUTING.md

8. **Create CODE_OF_CONDUCT.md (optional)**

   Ask user: "Would you like to add a Code of Conduct?"

   **If yes:**
   - Recommend LF Projects Code of Conduct (standard for LF Edge projects)
   - Download from official source and translate to Markdown format:
     ```bash
     curl -sS https://lfprojects.org/policies/code-of-conduct/ -o CODE_OF_CONDUCT.md
     ```
   - Format as Markdown
   - Customize contact information section

9. **Display summary**

   Show what was created/updated:
   - List of files created
   - List of files updated
   - License type selected
   - Project type detected
   - Next steps (if any)

**Output On Success**

```
## Repository Initialized

**Files Created:**
✓ LICENSE.md (Apache License 2.0)
✓ README.md (with project structure)
✓ .gitignore (Python template)
✓ MAINTAINERS.md (2 active maintainers)
✓ Makefile (myservice, third-party image)
✓ CONTRIBUTING.md
✓ CODE_OF_CONDUCT.md (Contributor Covenant v2.1)

**Project Type:** Python
**License:** Apache License 2.0
**Git Status:** Changes committed

**Next Steps:**
1. Update README.md with your project description
2. Add installation and usage instructions
3. Review and customize CONTRIBUTING.md for your workflow
4. Update CODE_OF_CONDUCT.md contact information

Your repository is ready for development!
```

**Output On Partial Completion**

```
## Repository Partially Initialized

**Files Created:**
✓ LICENSE.md (MIT License)
✓ README.md

**Skipped:**
- .gitignore (already exists)
- CONTRIBUTING.md (user declined)
- CODE_OF_CONDUCT.md (user declined)

**Next Steps:**
1. Review and update README.md
2. Consider adding CONTRIBUTING.md for open source projects

Repository initialization complete.
```

**Guardrails**

- Always check for existing files before creating
- Never overwrite without explicit user confirmation
- Preserve existing content when merging (e.g., .gitignore)
- Use the init-gitignore skill for .gitignore (don't duplicate detection or template logic)
- Use official sources for templates (Contributor Covenant)
- Detect project type automatically when possible
- Provide sensible defaults but allow customization
- Show clear summary of what was done
- Commit to git only if user confirms
- For LICENSE, always use the init-license skill (don't duplicate logic)
- Make all optional components truly optional - don't force them

**Project Type Detection**

| Files Present | Project Type |
|--------------|--------------|
| package.json | Node.js |
| requirements.txt, setup.py, pyproject.toml | Python |
| go.mod | Go |
| Cargo.toml | Rust |
| pom.xml, build.gradle | Java |
| *.csproj | C# |
| Gemfile | Ruby |
| composer.json | PHP |

**Template Sources**

- .gitignore: `gitignore-snippets` skill (via `init-gitignore` skill)
- Code of Conduct: https://www.contributor-covenant.org/
- LICENSE: Official sources (Apache.org, GNU.org, etc.) via init-license skill

**Integration with Skills**

This workflow delegates specialist tasks to dedicated skills rather than duplicating their logic.

**`init-license`** — handles LICENSE initialization:
- Checks for existing licenses
- Prompts for license type (Apache 2.0 or MIT recommended)
- Downloads from official sources
- Customises with copyright information
- Saves as LICENSE.md

**`init-readme`** — handles `README.md` creation and auditing:
- Checks whether a `README.md` already exists at the repository root
- New file: detects service name, GitHub repo path, and architectures; confirms with the user; writes a full Open Horizon–style README with shields, prerequisites, installation, usage, debugging, and a complete Makefile targets table
- Existing file: audits the README against the standard section checklist and recommends additions or modifications for any missing or incomplete sections, with special emphasis on the `### All Makefile targets` section
- Never overwrites without explicit user confirmation

**`init-gitignore`** — handles `.gitignore` creation and updates:
- Detects languages and frameworks from the codebase
- Composes tailored entries from the `gitignore-snippets` skill
- Diffs against any existing `.gitignore` to avoid duplicates
- Requires explicit user approval before writing anything

**`init-maintainers`** — handles `MAINTAINERS.md` creation and updates:
- Checks for an existing `MAINTAINERS.md` and offers replace/append/cancel
- Collects each active maintainer's name, GitHub ID, and email interactively
- Optionally collects emeritus maintainer entries
- Writes the file in the canonical Open Horizon table format
- Requires at least one active maintainer before writing

**`init-makefile`** — handles `Makefile` creation:
- Checks for an existing `Makefile` and offers replace/skip/cancel
- Detects the service/container name from `service.definition.json` or the repository directory name
- Confirms service-specific values (DockerHub ID, port mapping, volume path) with the user
- Writes the Open Horizon third-party-image skeleton with `build` and `push` stubs
- Substitutes the real service name for all template placeholders

The workflow focuses on orchestrating the full initialisation sequence; each skill owns its own file logic.

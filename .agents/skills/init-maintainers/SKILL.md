---
name: init-maintainers
description: Create or populate a MAINTAINERS.md file in the Open Horizon table format. Checks if the file already exists, prompts for each maintainer's name, GitHub ID, and email address, then writes (or merges) the file following the canonical open-horizon/anax layout.
license: Apache-2.0
metadata:
  author: skills-open-horizon
  version: "1.0"
---

Create or update a `MAINTAINERS.md` file using the standard Open Horizon maintainer table format.

**Purpose**: Ensure every repository has a properly formatted MAINTAINERS.md file that identifies the active maintainers and any emeritus maintainers. The format follows the canonical layout used across the Open Horizon project (see [open-horizon/anax MAINTAINERS.md](https://github.com/open-horizon/anax/blob/master/MAINTAINERS.md)).

**Input**: No parameters required. The skill will detect existing content and interactively collect maintainer information.

**Reference Format**

```markdown
Repository Maintainers
======================
See the information about [community membership roles](https://wiki.lfedge.org/display/OH/Community+Membership) to learn about the role of the maintainers and the process to become one.
| Name          | GitHub       | email                    |
| ------------- | ------------ | ------------------------ |
| Jane Doe      | janedoe      | jane@example.com         |

# Emeritus Maintainers
The emeritus maintainers of this repository are:
| Name          | GitHub       | email                    |
| ------------- | ------------ | ------------------------ |
| Former Person | formerperson |                          |
```

**Steps**

1. **Check for an existing MAINTAINERS.md**

   Search for the file in the repository root:
   ```bash
   find . -maxdepth 1 -iname "MAINTAINERS*" -type f
   ```

   - **If found and non-empty**: Read and display current contents, then ask the user whether to (a) replace all maintainers, (b) append new maintainers, or (c) cancel.
   - **If missing or empty**: Proceed to collect maintainer information.

2. **Collect active maintainer entries**

   For each active maintainer, ask the user three questions in sequence:

   - **Full name** — e.g., `Jane Doe`
   - **GitHub ID** — e.g., `janedoe` (without the `@`)
   - **Email address** — e.g., `jane@example.org` (may be left blank)

   After each entry, ask: "Add another active maintainer? (yes/no)"

   Repeat until the user says no.

   **Minimum**: At least one active maintainer is required. If none are provided, prompt again.

3. **Collect emeritus maintainer entries (optional)**

   Ask: "Would you like to add any emeritus (former) maintainers? (yes/no)"

   **If yes**, collect entries in the same way as step 2 until the user says no.
   Email may be left blank for emeritus entries (common in the reference format).

4. **Write MAINTAINERS.md**

   Compose the file following the exact reference format. Expand column separaters as needed to visually align with the rows above and below:

   ```markdown
   Repository Maintainers
   ======================
   See the information about [community membership roles](https://wiki.lfedge.org/display/OH/Community+Membership) to learn about the role of the maintainers and the process to become one.
   | Name         | GitHub      | email                    |
   | ------------ | ----------- | ------------------------ |
   | {name}       | {github}    | {email}                  |
   ...

   # Emeritus Maintainers
   The emeritus maintainers of this repository are:
   | Name         | GitHub      | email                    |
   | ------------ | ----------- | ------------------------ |
   | {name}       | {github}    | {email}                  |
   ...
   ```

   **If no emeritus maintainers were provided**, omit the emeritus section entirely.

   Write the completed file to `MAINTAINERS.md` in the repository root.

5. **Display confirmation**

   Show a summary of the file written, listing each maintainer's name and GitHub ID.

**Output On Success**

```
## MAINTAINERS.md Initialized

**Active Maintainers:** 2
**Emeritus Maintainers:** 1
**File:** MAINTAINERS.md

✓ MAINTAINERS.md created successfully

Active maintainers:
  • Jane Doe (@janedoe)
  • John Smith (@johnsmith)

Emeritus maintainers:
  • Former Person (@formerperson)

Please review MAINTAINERS.md and commit it to your repository.
```

**Output When File Already Exists**

```
## MAINTAINERS.md Already Present

Current contents:
[display existing file]

Options:
  a) Replace all maintainers
  b) Append new maintainers
  c) Cancel — keep existing file

Choose an option:
```

**Guardrails**

- Always check for an existing MAINTAINERS.md before creating a new one
- Never overwrite without explicit user confirmation (replace vs. append vs. cancel)
- Require at least one active maintainer — do not write an empty maintainers table
- Allow email to be blank (match real-world Open Horizon practice)
- GitHub IDs must not contain the `@` prefix — strip it if the user includes it
- Follow the column widths and separator style from the reference format for consistency across the project to visually align columns, but allow them to expand if the contents require it
- Do not commit to git automatically — leave that to the user or the calling workflow
- Present the final file contents to the user before writing, if in interactive mode

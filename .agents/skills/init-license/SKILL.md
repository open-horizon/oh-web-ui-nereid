---
name: init-license
description: Initialize a repository with a software license. Checks if LICENSE file exists or is empty, prompts user for license type (defaulting to Apache 2.0 or MIT), downloads the license text from official sources, and saves it as LICENSE.md.
license: MIT
compatibility: Requires curl or wget for downloading license files.
metadata:
  author: skills-open-horizon
  version: "1.1"
---

Initialize a repository with a software license file.

**Purpose**: Ensure every repository has a proper LICENSE file. If LICENSE.* doesn't exist or is empty, guide the user through selecting and installing an appropriate open source license, with Apache 2.0 and MIT as recommended defaults.

**Input**: No parameters required. The skill will detect the current state and guide the user through the process.

**Steps**

1. **Check for existing LICENSE file**

   Search for any file matching the pattern `LICENSE*` in the repository root:
   ```bash
   find . -maxdepth 1 -iname "LICENSE*" -type f
   ```

   Check common variations:
   - `LICENSE`
   - `LICENSE.md`
   - `LICENSE.txt`
   - `LICENSE.rst`

2. **Determine if action is needed**

   **If LICENSE file exists and is not empty:**
   - Read the first few lines to identify the license type
   - Display the current license type and filename
   - Present the following menu using `ask_followup_question`:

     ```
     ## License Already Present

     Current license : [detected type]
     File            : [filename]

     Options:
       a) Replace with a new license (current file backed up as LICENSE.bak)
       b) Keep existing license — no changes
       c) Cancel

     Choose an option:
     ```

   - If the user chooses **(b) Keep** or **(c) Cancel**, stop here. Do not modify any files.
   - If the user chooses **(a) Replace**, proceed to license selection (Step 3), then back up the
     existing file before writing (Step 6).

   **If LICENSE file is missing or empty:**
   - Proceed to license selection (Step 3).

3. **Prompt user for license type**

   Use the **AskUserQuestion tool** to present license options with **Apache 2.0 and MIT as primary recommendations**:

   **Recommended Options:**
   - **Apache License 2.0** (Recommended) - Permissive license with explicit patent grant, widely used in enterprise and open source projects
   - **MIT License** (Recommended) - Simple permissive license, minimal restrictions, very popular

   **Other Options:**
   - Mozilla Public License 2.0 - Weak copyleft, file-level
   - ISC License - Functionally equivalent to MIT, simpler wording

   Present Apache 2.0 and MIT first as the recommended choices.

4. **Download the license text from official sources**

   Download from authoritative sources based on user selection:

   **Apache 2.0:**
   ```bash
   curl -sS https://www.apache.org/licenses/LICENSE-2.0.txt -o LICENSE.md
   ```
   Fallback: https://raw.githubusercontent.com/apache/apache-2.0/master/LICENSE-2.0.txt

   **MIT:**
   ```bash
   curl -sS https://opensource.org/licenses/MIT -o LICENSE.md.html
   # Extract text content from HTML
   ```
   Or use GitHub's template:
   ```bash
   curl -sS https://raw.githubusercontent.com/github/choosealicense.com/gh-pages/_licenses/mit.txt -o LICENSE.md
   ```

   **MPL 2.0:**
   ```bash
   curl -sS https://www.mozilla.org/media/MPL/2.0/index.txt -o LICENSE.md
   ```

   **ISC:**
   ```bash
   curl -sS https://raw.githubusercontent.com/github/choosealicense.com/gh-pages/_licenses/isc.txt -o LICENSE.md
   ```

   **If download fails:**
   - Try using `wget` as fallback
   - Try alternative source URLs
   - If all fail, ask user to provide license text manually

5. **Process the license template**

   All licenses require copyright customization. Before saving, collect:
   - **Year**: Use current year from `date +%Y`
   - **Name**: Try `git config user.name` first; if empty or unavailable, **ask the user** for the copyright holder name

   Use the **AskUserQuestion tool** to prompt for the copyright holder name if it cannot be determined from git config.

   **Apache 2.0** placeholders (in the boilerplate appendix at the bottom of the file):
   - `[yyyy]` → Current year
   - `[name of copyright owner]` → Copyright holder name

   **MIT, ISC** placeholders:
   - `[year]` → Current year
   - `[fullname]` → Copyright holder name

   ```bash
   YEAR=$(date +%Y)
   NAME=$(git config user.name 2>/dev/null || echo "")

   if [ -z "$NAME" ]; then
     # Ask user for copyright holder name via AskUserQuestion tool
     # Then assign the response to NAME
     NAME="<user-provided value>"
   fi

   # Apache 2.0 placeholders (macOS compatible)
   sed -i.bak "s/\[yyyy\]/$YEAR/g" LICENSE.md
   sed -i.bak "s/\[name of copyright owner\]/$NAME/g" LICENSE.md

   # MIT / ISC placeholders
   sed -i.bak "s/\[year\]/$YEAR/g" LICENSE.md
   sed -i.bak "s/\[fullname\]/$NAME/g" LICENSE.md

   rm LICENSE.md.bak
   ```

6. **Save as LICENSE.md**

   Write the processed license text to `LICENSE.md` in the repository root.

   **If an old LICENSE file exists (i.e., the user chose "Replace" in Step 2):**
   - Back it up first, then remove the original:

   ```bash
   # Back up the existing file (e.g., LICENSE → LICENSE.bak, LICENSE.md → LICENSE.md.bak)
   EXISTING=$(find . -maxdepth 1 -iname "LICENSE*" -type f | head -1)
   cp "$EXISTING" "${EXISTING}.bak"
   rm "$EXISTING"
   ```

   - Inform the user: "Existing license backed up as `${EXISTING}.bak`."
   - Then write the new `LICENSE.md`.

7. **Display confirmation**

   Show:
   - License type installed
   - File location: `LICENSE.md`
   - Copyright holder (if applicable)
   - Source URL where license was downloaded from
   - Reminder to review the license text

**Output On Success (Apache 2.0)**

```
## License Initialized

**License Type:** Apache License 2.0
**File:** LICENSE.md
**Source:** https://www.apache.org/licenses/LICENSE-2.0.txt

✓ License file created successfully

The Apache License 2.0 is a permissive license with explicit patent grants.
It's widely used in enterprise and open source projects.

Please review LICENSE.md to ensure it meets your needs.
```

**Output On Success (MIT)**

```
## License Initialized

**License Type:** MIT License
**File:** LICENSE.md
**Copyright:** 2026 John Doe
**Source:** https://opensource.org/licenses/MIT

✓ License file created successfully

The MIT License is a simple permissive license with minimal restrictions.
It's one of the most popular open source licenses.

Please review LICENSE.md to ensure it meets your needs.
```

**Output When License Already Exists (keep/cancel)**

```
## License Already Present

Current license : Apache License 2.0
File            : LICENSE

No changes made. Existing license preserved.
```

**Output When License Already Exists (replaced)**

```
## License Replaced

Previous license : Apache License 2.0 (backed up as LICENSE.bak)
New license      : MIT License
File             : LICENSE.md
Copyright        : 2026 Jane Doe
Source           : https://opensource.org/licenses/MIT

✓ License replaced successfully

Please review LICENSE.md to ensure it meets your needs.
You may delete LICENSE.bak once you have confirmed the new license is correct.
```

**Guardrails**

- Always check for existing LICENSE files before proceeding
- Never overwrite an existing license without explicit user confirmation — always present the replace / keep / cancel menu first
- When replacing, **always back up the old file** as `<original-name>.bak` before deleting it
- Tell the user the backup location and remind them to delete it once satisfied
- Do **not** instruct the user to manually delete the existing file in order to proceed — the skill handles replacement internally
- Validate downloaded content before saving (check for HTTP errors, empty files)
- For licenses requiring customization (MIT, BSD, ISC), always get copyright holder info
- Default to LICENSE.md format for consistency
- Try git config first for copyright holder, then prompt user
- Handle both curl and wget for maximum compatibility
- Use official sources (Apache.org, GNU.org, Mozilla.org, OpenSource.org) when available
- Show clear error messages if download fails
- **Recommend Apache 2.0 or MIT as primary choices** - these are the most common and appropriate for most projects

**Official License Sources**

Primary sources (in order of preference):
1. **Apache 2.0**: https://www.apache.org/licenses/LICENSE-2.0.txt
2. **MIT**: https://opensource.org/licenses/MIT (or GitHub template)
3. **MPL 2.0**: https://www.mozilla.org/media/MPL/2.0/index.txt
4. **ISC**: GitHub choosealicense.com templates

**Why Apache 2.0 and MIT?**

- **Apache 2.0**: Provides explicit patent protection, widely trusted in enterprise, used by major projects (Kubernetes, Android, Apache projects)
- **MIT**: Extremely simple and permissive, minimal legal complexity, universally compatible, used by major projects (Node.js, React, jQuery)

Both are OSI-approved and GPL-compatible.

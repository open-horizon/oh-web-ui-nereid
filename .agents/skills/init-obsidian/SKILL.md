---
name: init-obsidian
description: Initialize and use Obsidian CLI for storing and retrieving memories. Checks if Obsidian CLI is installed, guides installation if needed, and provides commands for memory management.
license: MIT
compatibility: Requires Obsidian desktop app with CLI enabled. Works on macOS, Linux, and Windows.
metadata:
  author: skills-open-horizon
  version: "1.0"
---

Initialize and use Obsidian CLI for storing and retrieving memories.

**Purpose**: Enable users to leverage Obsidian's CLI for managing notes and memories from the command line. This skill checks for Obsidian CLI installation, guides setup if needed, and provides commands for storing and retrieving information.

**Input**: No parameters required. The skill will detect the current state and guide the user through setup or usage.

**Steps**

1. **Check if Obsidian CLI is installed**

   Verify that the Obsidian CLI is available:
   ```bash
   command -v obsidian
   ```

   **If command is found:**
   - Verify it works by checking version:
     ```bash
     obsidian version
     ```
   - If version is returned, CLI is properly installed
   - Proceed to step 4 (Install Obsidian Skills)

   **If command is not found:**
   - Proceed to step 2 (Installation Guide)

2. **Guide user through Obsidian CLI installation**

   Display installation instructions:

   ```
   ## Obsidian CLI Not Found

   The Obsidian CLI is not installed or not in your PATH.

   ### Installation Steps:

   1. **Install Obsidian Desktop App**
      - Visit: https://obsidian.md/download
      - Download and install Obsidian for your platform

   2. **Enable CLI Access**
      - Open Obsidian
      - Go to Settings → About
      - Look for "Command Line Interface" section
      - Click "Install" or "Enable CLI"
      - This will add the `obsidian` command to your PATH

   3. **Verify Installation**
      After installation, restart your terminal and run:
      ```bash
      command -v obsidian
      obsidian version
      ```

   ### Platform-Specific Notes:

   **macOS:**
   - CLI is typically installed to `/usr/local/bin/obsidian`
   - May require admin password during installation

   **Linux:**
   - CLI location varies by installation method
   - AppImage: Extract and add to PATH manually
   - Snap/Flatpak: May need additional configuration

   **Windows:**
   - CLI is added to system PATH automatically
   - Restart terminal/PowerShell after installation

   For detailed instructions, visit: https://obsidian.md/cli
   ```

   **Stop here and ask user to complete installation before proceeding.**

3. **Verify installation after user setup**

   Once user confirms installation:
   ```bash
   obsidian version
   ```

   Display the version information to confirm successful setup.

4. **Install Obsidian skills for Bob Shell**

   After CLI is installed, guide user to install additional Obsidian skills:

   ```
   ## Installing Obsidian Skills

   The obsidian-skills repository provides additional skills for working with Obsidian.

   ### Installation Steps:

   1. **Clone the obsidian-skills repository**
      ```bash
      cd /tmp
      git clone https://github.com/kepano/obsidian-skills.git
      ```

   2. **Copy skills to .agent/skills directory**
      ```bash
      # Navigate to your project root (where .agent/skills exists)
      cd /path/to/your/project
      
      # Copy all skills from the repo
      cp -r /tmp/obsidian-skills/skills/* .agent/skills/
      ```

   3. **Verify installation**
      ```bash
      # List installed skills
      ls -la .agent/skills/
      
      # Should see Obsidian-related skills like:
      # - obsidian-create-note/
      # - obsidian-search/
      # - obsidian-daily-note/
      # etc.
      ```

   4. **Clean up temporary clone**
      ```bash
      rm -rf /tmp/obsidian-skills
      ```

   ### What Gets Installed

   The obsidian-skills repository includes skills for:
   - Creating and managing notes
   - Searching vault content
   - Working with daily notes
   - Managing tags and links
   - Vault organization
   - And more...

   ### Verify Skills Work

   After installation, you can use these skills with Bob Shell:
   ```bash
   # Example: List available Obsidian skills
   ls .agent/skills/ | grep -i obsidian
   ```

   ### Alternative: Manual Installation

   If you prefer to install specific skills only:
   ```bash
   # Clone the repo
   git clone https://github.com/kepano/obsidian-skills.git /tmp/obsidian-skills
   
   # Copy only specific skills
   cp -r /tmp/obsidian-skills/skills/obsidian-create-note .agent/skills/
   cp -r /tmp/obsidian-skills/skills/obsidian-search .agent/skills/
   
   # Clean up
   rm -rf /tmp/obsidian-skills
   ```

   ### Important Notes

   - Skills are copied, not symlinked, so updates require re-copying
   - Existing skills with same names will be overwritten
   - Review each skill's SKILL.md for specific usage instructions
   - Skills may have their own dependencies or requirements
   ```

6. **Provide usage instructions for memory management**

   Display comprehensive usage guide:

   ```
   ## Obsidian CLI - Memory Management

   ### Basic Commands

   **Open a vault:**
   ```bash
   obsidian open [vault-name]
   ```

   **Open a specific note:**
   ```bash
   obsidian open [vault-name] [note-path]
   ```

   **Create a new note:**
   ```bash
   obsidian new [vault-name] [note-path]
   ```

   **Search notes:**
   ```bash
   obsidian search [vault-name] "search query"
   ```

   ### Memory Storage Patterns

   **1. Daily Notes for Memories**
   Create or append to daily notes:
   ```bash
   # Open today's daily note
   obsidian open my-vault "Daily Notes/$(date +%Y-%m-%d).md"
   
   # Create with template
   obsidian new my-vault "Daily Notes/$(date +%Y-%m-%d).md" --template "Daily Note Template"
   ```

   **2. Dedicated Memory Notes**
   Store specific memories in categorized notes:
   ```bash
   # Create a memory note
   obsidian new my-vault "Memories/project-insights.md"
   
   # Open existing memory note
   obsidian open my-vault "Memories/project-insights.md"
   ```

   **3. Tagged Memories**
   Use tags for easy retrieval:
   ```bash
   # Search by tag
   obsidian search my-vault "#memory"
   obsidian search my-vault "#important"
   obsidian search my-vault "#project-name"
   ```

   ### Memory Retrieval Patterns

   **Search by keyword:**
   ```bash
   obsidian search my-vault "keyword"
   ```

   **Search by date range:**
   ```bash
   # Search in daily notes folder
   obsidian search my-vault "path:Daily\ Notes/ keyword"
   ```

   **Search by tag:**
   ```bash
   obsidian search my-vault "tag:#memory"
   ```

   **Open recent notes:**
   ```bash
   obsidian open my-vault --recent
   ```

   ### Advanced Usage

   **Append to existing note (using shell):**
   ```bash
   echo "## New Memory - $(date)" >> ~/Obsidian/my-vault/Memories/notes.md
   echo "Content here" >> ~/Obsidian/my-vault/Memories/notes.md
   obsidian open my-vault "Memories/notes.md"
   ```

   **Create note with frontmatter:**
   ```bash
   cat > ~/Obsidian/my-vault/Memories/new-memory.md << 'EOF'
   ---
   date: $(date +%Y-%m-%d)
   tags: [memory, important]
   ---
   
   # Memory Title
   
   Content here
   EOF
   obsidian open my-vault "Memories/new-memory.md"
   ```

   **Batch operations:**
   ```bash
   # Find all memory notes
   obsidian search my-vault "tag:#memory" --json > memories.json
   
   # Process results with jq or other tools
   cat memories.json | jq '.results[].path'
   ```

   ### Integration with Bob Shell

   **Store Bob Shell memories:**
   ```bash
   # Create a dedicated note for Bob Shell memories
   obsidian new my-vault "Bob-Shell/memories.md"
   
   # Append new memory
   echo "- $(date +%Y-%m-%d): [Memory description]" >> ~/Obsidian/my-vault/Bob-Shell/memories.md
   ```

   **Retrieve Bob Shell context:**
   ```bash
   # Search Bob Shell notes
   obsidian search my-vault "path:Bob-Shell/"
   
   # Open Bob Shell memory note
   obsidian open my-vault "Bob-Shell/memories.md"
   ```

   ### Best Practices

   1. **Consistent Structure**: Use a consistent folder structure (e.g., `Memories/`, `Daily Notes/`, `Projects/`)
   2. **Use Tags**: Tag notes with `#memory`, `#important`, `#project-name` for easy retrieval
   3. **Date Stamps**: Include dates in memory entries for temporal context
   4. **Frontmatter**: Use YAML frontmatter for metadata (dates, tags, categories)
   5. **Regular Backups**: Obsidian vaults are just folders - back them up regularly
   6. **Search Syntax**: Learn Obsidian's search syntax for powerful queries

   ### Common Vault Locations

   **macOS:**
   - Default: `~/Documents/Obsidian/`
   - iCloud: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/`

   **Linux:**
   - Default: `~/Documents/Obsidian/`

   **Windows:**
   - Default: `%USERPROFILE%\Documents\Obsidian\`
   - OneDrive: `%USERPROFILE%\OneDrive\Documents\Obsidian\`

   ### Help and Documentation

   **Get help:**
   ```bash
   obsidian --help
   obsidian open --help
   obsidian search --help
   ```

   **Official documentation:**
   - CLI Reference: https://obsidian.md/cli
   - Obsidian Help: https://help.obsidian.md/
   ```

5. **Provide quick reference card**

   Display a concise quick reference:

   ```
7. **Provide quick reference card**

   Display a concise quick reference:

   ```
   ## Quick Reference

   | Action | Command |
   |--------|---------|
   | Check version | `obsidian version` |
   | Open vault | `obsidian open [vault]` |
   | Open note | `obsidian open [vault] [path]` |
   | Create note | `obsidian new [vault] [path]` |
   | Search | `obsidian search [vault] "query"` |
   | Get help | `obsidian --help` |

   ### Memory Workflow Example

   ```bash
   # 1. Store a memory
   echo "- $(date): Important insight about X" >> ~/Obsidian/my-vault/Memories/insights.md
   
   # 2. Open to review/edit
   obsidian open my-vault "Memories/insights.md"
   
   # 3. Search memories later
   obsidian search my-vault "insight"
   ```
   ```

**Output When CLI is Installed**

```
## Obsidian CLI Ready

**Version:** 1.x.x
**Status:** ✓ Installed and working

The Obsidian CLI is ready to use for memory management.

See usage instructions above for storing and retrieving memories.

Quick start:
1. Open your vault: `obsidian open my-vault`
2. Create a memory note: `obsidian new my-vault "Memories/notes.md"`
3. Search memories: `obsidian search my-vault "keyword"`

For full documentation, visit: https://obsidian.md/cli
```

**Output When CLI is Not Installed**

```
## Obsidian CLI Not Found

The Obsidian CLI is not installed on this system.

Please follow the installation instructions above to:
1. Install Obsidian desktop app from https://obsidian.md/download
2. Enable CLI access in Settings → About
3. Verify installation with `obsidian version`

Once installed, run this skill again to see usage instructions.
```

**Guardrails**

- Always check for CLI installation before providing usage instructions
- Verify CLI works by checking version, not just presence in PATH
- Provide platform-specific installation guidance
- Never assume vault names or locations - guide user to check their setup
- Include examples with placeholder vault names that user must replace
- Emphasize that Obsidian vaults are just folders - can be accessed directly
- Warn about path escaping in shell commands (spaces, special characters)
- Recommend using absolute paths or proper quoting for reliability
- Note that CLI commands may vary slightly between Obsidian versions
- Suggest checking `obsidian --help` for version-specific features
- Remind users that CLI requires Obsidian desktop app to be installed
- Point to official documentation for detailed reference

**Common Issues and Solutions**

**Issue: "command not found: obsidian"**
- Solution: CLI not installed or not in PATH. Follow installation steps.

**Issue: "vault not found"**
- Solution: Check vault name spelling, use exact name from Obsidian app.

**Issue: "permission denied"**
- Solution: Check file permissions on vault folder, may need to adjust ownership.

**Issue: CLI installed but not working**
- Solution: Restart terminal, check PATH, reinstall CLI from Obsidian settings.

**Integration Tips**

- **With Git**: Obsidian vaults can be git repositories for version control
- **With Scripts**: Automate memory creation with shell scripts
- **With Cron**: Schedule regular memory backups or summaries
- **With Bob Shell**: Store Bob Shell context and memories in dedicated vault
- **With Other Tools**: Obsidian uses markdown - compatible with many tools

**Security Considerations**

- Vault contents are stored as plain text markdown files
- No encryption by default - use encrypted filesystem if needed
- CLI has same access as desktop app - can read/write all vault files
- Be cautious with automated scripts that modify vault contents
- Regular backups recommended - vaults are just folders, easy to backup

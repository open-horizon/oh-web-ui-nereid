---
name: init-readme
description: Create a README.md in the repository root if one does not exist, pre-populated with standard Open Horizon service sections including shields, prerequisites, installation, usage, debugging, and all Makefile targets. If README.md already exists, compare it against the standard structure and recommend additions or modifications for any missing sections—especially the Makefile targets table.
license: Apache-2.0
metadata:
  author: skills-open-horizon
  version: "1.0"
---

Create or audit a `README.md` in the repository root following the standard Open Horizon service README structure.

**Purpose**: Ensure every Open Horizon service repository has a properly structured `README.md` that mirrors the conventions used across the project (e.g., `service-grafana`, `service-minecraft`). This includes status shields, a service description, prerequisite setup, installation steps, usage instructions, advanced debugging details, and a complete Makefile targets table.

**Input**: No required parameters. The skill detects the service name from existing repository files and confirms with the user before writing.

---

## Steps

### 1. Check for an existing README.md

```bash
find . -maxdepth 1 -name "README.md" -type f
```

- **If missing or empty**: Proceed to detect the service name (Step 2) and generate the full README.
- **If found and non-empty**: Read and display the current contents, then proceed to **Audit Mode** (Step 6).

---

### 2. Detect the service name

Inspect the repository to determine the service name. Check in order:

1. `service.definition.json` → read the `label` or `url` field
2. `horizon/service.definition.json` → same fields
3. Repository root directory name (strip any `service-` prefix, e.g., `service-grafana` → `grafana`)
4. Ask the user if the name cannot be determined automatically

Confirm the detected name with the user:

```
Detected service name: <SERVICE>
Is this correct? (yes / enter a different name)
```

Also ask the user two questions needed for the shields and service description:

- **GitHub repository path** — e.g., `open-horizon-services/service-grafana`
  (used to populate the `github/license` and `github/contributors` shields)
- **One-sentence description of what the service does** — e.g., "a vanilla instance of the open-source Grafana monitoring platform"

---

### 3. Detect supported architectures

Check for architecture information in this order:

1. `service.definition.json` → `arch` field or `requiredServices` arch hints
2. `horizon/service.definition.json` → same
3. Ask the user: "Which architectures does this service support? (e.g., `amd64`, `arm64`, or both)"

Use the detected architectures to populate the Architecture shield badge.

---

### 4. Detect Makefile targets

If a `Makefile` exists in the repository root:

```bash
grep -E '^[a-zA-Z_-]+:' Makefile | sed 's/:.*//'
```

Map each detected target to its standard description from the **Standard Makefile Target Descriptions** table at the end of this skill. For any target not in the standard table, ask the user for a brief description.

If no `Makefile` exists, use the full standard target list as placeholders (all descriptions will say "TBD" until a Makefile is created).

---

### 5. Compose and write the README

Use the **README Template** below, substituting all `<PLACEHOLDER>` values. Ask for confirmation before writing:

```
Ready to write README.md with these values:

  Service name : <SERVICE>
  GitHub path  : <GITHUB_REPO_PATH>
  Architectures: <ARCH_LIST>
  Description  : <SERVICE_DESCRIPTION>

Proceed? (yes / edit values / cancel)
```

Write the file only after receiving explicit confirmation.

---

### 6. Audit Mode (README already exists)

When a README.md already exists, evaluate it against the **Required Sections** checklist:

| Section | Required | Check |
|---|---|---|
| Shields (architecture, license, contributors) | Yes | Present and using `img.shields.io`? |
| Service title (`# service-<name>`) | Yes | H1 heading at top? |
| Service description paragraph | Yes | At least one sentence below the shields? |
| `## Prerequisites` or `## Prerequisites and setup` | Yes | Covers Management Hub, Edge Node, Optional utilities? |
| `### Initial configuration` (env vars) | Recommended | Covers `HZN_ORG_ID`, `SERVICE_ORG_ID`? |
| `## Installation` | Yes | Covers clone, `make clean`, `hzn version`, agent state check? |
| `## Usage` | Yes | Covers `make` to run locally, `make publish` to deploy? |
| `## Advanced details` | Recommended | Present? |
| `### Debugging` | Recommended | Mentions `make log`, `make deploy-check`, `make test`, `make attach`? |
| `### All Makefile targets` | **Critical** | Bullet list of all targets with descriptions? |

For each missing or incomplete section, output a recommendation in this format:

```
## README Audit Results

✓ Shields — present
✓ Title — present
✗ MISSING: ## Prerequisites — not found
✗ INCOMPLETE: ### All Makefile targets — section present but missing targets: remove-service, agent-stop
⚠ RECOMMENDED: ### Initial configuration — not present

Recommendations:
1. Add a ## Prerequisites section covering: Management Hub setup, Edge Node requirements, and optional utilities.
2. Add the following missing targets to ### All Makefile targets:
   * `remove-service` - Remove the service definition file from the hub in your organization
   * `agent-stop` - Unregister your agent with the hub, halting all agreements and stopping containers
3. Consider adding a ### Initial configuration subsection under Prerequisites.
```

After displaying the audit, ask the user:

```
Options:
  a) Apply all recommended changes automatically
  b) Select individual sections to add/update
  c) Show me the full standard README template for reference
  d) Cancel — keep the existing README as-is

Choose an option:
```

---

## README Template

```markdown
# service-<SERVICE>
![Architecture](https://img.shields.io/badge/architecture-<ARCH_BADGE>-green)
![License](https://img.shields.io/github/license/<GITHUB_REPO_PATH>)
![Contributors](https://img.shields.io/github/contributors/<GITHUB_REPO_PATH>)

This is an Open Horizon configuration to deploy <SERVICE_DESCRIPTION>. <SERVICE_UI_NOTE>

## Prerequisites and setup

**Management Hub:** [Install the Open Horizon Management Hub](https://open-horizon.github.io/quick-start) or have access to an existing hub in order to publish this service and register your edge node. You may also choose to use a downstream commercial distribution based on Open Horizon, such as IBM's Edge Application Manager. If you'd like to use the Open Horizon community hub, you may [apply for a temporary account](https://wiki.lfedge.org/display/LE/Open+Horizon+Management+Hub+Developer+Instance) and have credentials sent to you.

**Edge Node:** You will need an x86 computer running Linux or macOS, or a Raspberry Pi computer (arm64) running Raspberry Pi OS or Ubuntu to install and use <SERVICE> deployed by Open Horizon. You will need to install the Open Horizon agent software, anax, on the edge node and register it with a hub.

**Optional utilities to install:** With `brew` on macOS (you may need to install _that_ as well), `apt-get` on Ubuntu or Raspberry Pi OS, `yum` on Fedora, install `gcc`, `make`, `git`, `jq`, `curl`, `net-tools`. Not all of those may exist on all platforms, and some may already be installed. But reflexively installing those has proven helpful in having the right tools available when you need them.

### Initial configuration

Export all environment variables for your desired Open Horizon credentials.

Override the default Open Horizon organization ID by:

``` shell
export HZN_ORG_ID=<your-org>
```

IMPORTANT: If you intend to publish the service to an Organization different than your account Org, set up the service Org separately:

``` shell
export SERVICE_ORG_ID=<your-service-org>
```

## Installation

Clone the `service-<SERVICE>` GitHub repo from a terminal prompt on the edge node and enter the folder where the artifacts were copied.

NOTE: This assumes that `git` has been installed on the edge node.

``` shell
git clone https://github.com/<GITHUB_REPO_PATH>.git
cd service-<SERVICE>
```

Run `make clean` to confirm that the "make" utility is installed and working.

Confirm that you have the Open Horizon agent installed by using the CLI to check the version:

``` shell
hzn version
```

It should return values for both the CLI and the Agent (actual version numbers may vary from those shown):

``` text
Horizon CLI version: 2.30.0-744
Horizon Agent version: 2.30.0-744
```

If it returns "Command not found", then the Open Horizon agent is not installed.

If it returns a version for the CLI but not the agent, then the agent is installed but not running. You may run it with `systemctl horizon start` on Linux or `horizon-container start` on macOS.

Check that the agent is in an unconfigured state, and that it can communicate with a hub. If you have the `jq` utility installed, run `hzn node list | jq '.configstate.state'` and check that the value returned is "unconfigured". If not, running `make agent-stop` or `hzn unregister -f` will put the agent in an unconfigured state. Run `hzn node list | jq '.configuration'` and check that the JSON returned shows values for the "exchange_version" property, as well as the "exchange_api" and "mms_api" properties showing URLs. If those do not, then the agent is not configured to communicate with a hub. If you do not have `jq` installed, run `hzn node list` and eyeball the sections mentioned above.

## Usage

To manually run <SERVICE> locally as a test, enter `make`. <SERVICE_RUN_DESCRIPTION> Running `make attach` will connect you to a prompt running inside the container, and you can end that session by entering `exit`. When you are done, run `make stop` in the terminal to end the test.

To create [the service definition](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/CreateService.md#build-publish-your-hw), publish it to the hub, and then form an agreement to download and run <SERVICE>, enter `make publish`. When installation is complete and an agreement has been formed, exit the watch command with Control-C.

## Advanced details

### Debugging

The Makefile includes several targets to assist you in inspecting what is happening to see if they match your expectations. They include:

`make log` to see both the event logs and the service logs.

`make check` to see the values in your environment variables and how they compare to the default values. It will also show the service definition file with those values filled in.

`make deploy-check` to see if the properties and constraints that you've configured match each other to potentially form an agreement.

`make test` to see if the service is responding.

`make attach` to connect to the running container and open a shell inside it.

### All Makefile targets

* `default` - <DEFAULT_TARGET_DESCRIPTION>
* `init` - optionally create the docker volume
* `run` - manually run the container locally as a test
* `browse` - open the UI in a web browser
* `check` - view current settings
* `stop` - halt a locally-run container
* `dev` - manually run it locally and connect to a terminal in the container
* `attach` - connect to a terminal in the container
* `test` - request the service from the terminal to confirm that it is running and available
* `clean` - remove the container image and docker volume
* `distclean` - clean (see above) AND unregister the node and remove the service files from the hub
* `build` - N/A
* `push` - N/A
* `publish-service` - Publish the service definition file to the hub in your organization
* `remove-service` - Remove the service definition file from the hub in your organization
* `publish-service-policy` - Publish the [service policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#service-policy) file to the hub in your org
* `remove-service-policy` - Remove the service policy file from the hub in your org
* `publish-deployment-policy` - Publish a [deployment policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#deployment-policy) for the service to the hub in your org
* `remove-deployment-policy` - Remove a deployment policy for the service from the hub in your org
* `agent-run` - register your agent's [node policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#node-policy) with the hub
* `publish` - Publish the service def, service policy, deployment policy, and then register your agent
* `agent-stop` - unregister your agent with the hub, halting all agreements and stopping containers
* `deploy-check` - confirm that a registered agent is compatible with the service and deployment
* `log` - check the agent event logs
```

---

## Shield Badge Format

Construct the Architecture badge from the detected architectures:

| Architectures | Badge value |
|---|---|
| amd64 only | `architecture-amd64-green` |
| arm64 only | `architecture-arm64-green` |
| Both | `architecture-arm64%2C%20x86%20-green` |

Full badge markdown:

```markdown
![Architecture](https://img.shields.io/badge/architecture-<ARCH_BADGE>-green)
![License](https://img.shields.io/github/license/<GITHUB_REPO_PATH>)
![Contributors](https://img.shields.io/github/contributors/<GITHUB_REPO_PATH>)
```

> Note: Some upstream service READMEs include a copyright or logo badge specific to the third-party software (e.g., `![Copyright](https://grafana.com/docs/copyright-notice/)`). Ask the user if the service has an official badge URL to include as a fourth shield.

---

## Standard Makefile Target Descriptions

Use these descriptions when building or auditing the Makefile targets section.

| Target | Standard description |
|---|---|
| `default` | init run browse |
| `init` | optionally create the docker volume |
| `run` | manually run the container locally as a test |
| `browse` | open the UI in a web browser |
| `check` | view current settings |
| `stop` | halt a locally-run container |
| `dev` | manually run it locally and connect to a terminal in the container |
| `attach` | connect to a terminal in the container |
| `test` | request the service from the terminal to confirm that it is running and available |
| `clean` | remove the container image and docker volume |
| `distclean` | clean (see above) AND unregister the node and remove the service files from the hub |
| `build` | N/A |
| `push` | N/A |
| `publish-service` | Publish the service definition file to the hub in your organization |
| `remove-service` | Remove the service definition file from the hub in your organization |
| `publish-service-policy` | Publish the [service policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#service-policy) file to the hub in your org |
| `remove-service-policy` | Remove the service policy file from the hub in your org |
| `publish-deployment-policy` | Publish a [deployment policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#deployment-policy) for the service to the hub in your org |
| `remove-deployment-policy` | Remove a deployment policy for the service from the hub in your org |
| `agent-run` | register your agent's [node policy](https://github.com/open-horizon/examples/blob/master/edge/services/helloworld/PolicyRegister.md#node-policy) with the hub |
| `publish` | Publish the service def, service policy, deployment policy, and then register your agent |
| `agent-stop` | unregister your agent with the hub, halting all agreements and stopping containers |
| `deploy-check` | confirm that a registered agent is compatible with the service and deployment |
| `log` | check the agent event logs |

---

## Output On Success (new file)

```
## README.md Created

Service name : <SERVICE>
GitHub path  : <GITHUB_REPO_PATH>
Architectures: amd64, arm64
File         : README.md

✓ README.md created successfully

Please review README.md, fill in any TBD sections with service-specific details,
and commit it to your repository.
```

## Output On Success (audit, no changes needed)

```
## README.md Audit Complete

✓ All required sections are present
✓ Shields block — present
✓ All Makefile targets documented

No changes needed.
```

## Output When File Already Exists (changes recommended)

```
## README.md Audit Results

✓ Shields — present
✗ MISSING: ## Prerequisites
✗ INCOMPLETE: ### All Makefile targets — missing 3 targets

Options:
  a) Apply all recommended changes automatically
  b) Select individual sections to add/update
  c) Show me the full standard README template for reference
  d) Cancel — keep the existing README as-is

Choose an option:
```

---

## Guardrails

- Always check for an existing `README.md` before creating a new one
- Never overwrite without explicit user confirmation
- Replace every occurrence of `<SERVICE>`, `<GITHUB_REPO_PATH>`, and other placeholders — do not leave template strings in the output file
- The `### All Makefile targets` section is **critical** — flag it explicitly if missing or incomplete
- When auditing an existing README, **do not silently patch** it; present all recommendations and wait for the user to choose
- Detect architectures from `service.definition.json` if available; ask the user only as a fallback
- Shield badges must use `img.shields.io` URLs following the format shown — do not invent other badge providers
- The `build` and `push` targets should always be listed as `N/A` for services using third-party containers (no-build variant)
- Do not commit to git automatically — leave that to the user or the calling workflow
- Preserve all existing content when adding sections to an existing README — never delete user-written content

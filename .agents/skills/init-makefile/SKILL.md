---
name: init-makefile
description: Create a Makefile in the repository root if one does not exist, pre-populated with the standard Open Horizon skeleton for services that use a third-party container (no build/push step). Replaces all "grafana" references with the actual repository service name.
license: Apache-2.0
metadata:
  author: skills-open-horizon
  version: "1.0"
---

Create a `Makefile` in the repository root using the standard Open Horizon skeleton for services that pull a pre-built third-party container rather than building and pushing their own image.

**Purpose**: Ensure every Open Horizon service repository has a properly structured `Makefile` with the required minimum targets. This skill covers the *no-build* variant — where the Docker image is published by a third party and the service definition simply references it. All template references to the example service name are replaced with the actual repository container name.

**Input**: No required parameters. The skill detects the service/container name from existing repository files and confirms with the user before writing.

**Steps**

1. **Check for an existing Makefile**

   ```bash
   find . -maxdepth 1 -name "Makefile" -type f
   ```

   - **If found and non-empty**: Display the current contents and ask the user whether to (a) replace it, (b) skip, or (c) cancel.
   - **If missing or empty**: Proceed to detect the service name.

2. **Detect the container/service name**

   Inspect the repository to determine the service name. Check in order:

   - `service.definition.json` → read the `url` or `label` field
   - `horizon/service.definition.json` → same fields
   - Repository root directory name (strip any `service-` prefix convention, e.g., `service-grafana` → `grafana`)
   - Ask the user if the name cannot be determined automatically

   Confirm the detected name with the user:
   ```
   Detected service/container name: <name>
   Is this correct? (yes / enter a different name)
   ```

3. **Detect optional variables from existing files**

   If `service.definition.json` (or `horizon/service.definition.json`) exists, read:

   - `SERVICE_VERSION` (from the `version` field, default `0.0.1`)
   - `HZN_ORG_ID` (from the `org` field or environment, default `examples`)

   If neither file exists, use the defaults.

4. **Compose the Makefile**

   Replace every occurrence of `grafana` in the skeleton below with the confirmed service name (`<SERVICE>`), and `grafana-storage` with `<SERVICE>-storage`. Set `DOCKER_IMAGE_NAME`, `DOCKER_VOLUME_NAME`, `DEPLOYMENT_POLICY_NAME`, `NODE_POLICY_NAME`, and `SERVICE_NAME` accordingly.

   **Skeleton** (with `<SERVICE>` as the placeholder):

   ```makefile
   # Multi-arch docker container instance intended for Open Horizon Linux edge nodes
   # This container is provided by a third party from official sources — no build step required.
   export DOCKER_IMAGE_BASE ?= <DOCKER_HUB_ID>/<SERVICE>
   export DOCKER_IMAGE_NAME ?= <SERVICE>
   export DOCKER_IMAGE_VERSION ?= latest
   export DOCKER_VOLUME_NAME ?= <SERVICE>-storage
   # DockerHub ID of the third party providing the image (usually yours if building and pushing)
   export DOCKER_HUB_ID ?= <DOCKER_HUB_ID>
   # The Open Horizon organization ID namespace where you will be publishing the service definition file
   export HZN_ORG_ID ?= examples
   # Open Horizon settings for publishing metadata about the service
   export DEPLOYMENT_POLICY_NAME ?= deployment-policy-<SERVICE>
   export NODE_POLICY_NAME ?= node-policy-<SERVICE>
   export SERVICE_NAME ?= service-<SERVICE>
   export SERVICE_VERSION ?= 0.0.1
   # Default ARCH to the architecture of this machine (assumes hzn CLI installed)
   export ARCH ?= amd64
   # Detect Operating System running Make
   OS := $(shell uname -s)
   default: init run browse
   check:
   	@echo "====================="
   	@echo "ENVIRONMENT VARIABLES"
   	@echo "====================="
   	@echo "DOCKER_IMAGE_BASE    default: <DOCKER_HUB_ID>/<SERVICE>   actual: ${DOCKER_IMAGE_BASE}"
   	@echo "DOCKER_IMAGE_NAME    default: <SERVICE>                    actual: ${DOCKER_IMAGE_NAME}"
   	@echo "DOCKER_IMAGE_VERSION default: latest                       actual: ${DOCKER_IMAGE_VERSION}"
   	@echo "DOCKER_VOLUME_NAME   default: <SERVICE>-storage            actual: ${DOCKER_VOLUME_NAME}"
   	@echo "DOCKER_HUB_ID        default: <DOCKER_HUB_ID>             actual: ${DOCKER_HUB_ID}"
   	@echo "HZN_ORG_ID           default: examples                     actual: ${HZN_ORG_ID}"
   	@echo "DEPLOYMENT_POLICY_NAME default: deployment-policy-<SERVICE> actual: ${DEPLOYMENT_POLICY_NAME}"
   	@echo "NODE_POLICY_NAME     default: node-policy-<SERVICE>        actual: ${NODE_POLICY_NAME}"
   	@echo "SERVICE_NAME         default: service-<SERVICE>            actual: ${SERVICE_NAME}"
   	@echo "SERVICE_VERSION      default: 0.0.1                        actual: ${SERVICE_VERSION}"
   	@echo "ARCH                 default: amd64                        actual: ${ARCH}"
   	@echo ""
   	@echo "=================="
   	@echo "SERVICE DEFINITION"
   	@echo "=================="
   	@cat service.definition.json | envsubst
   	@echo ""
   stop:
   	@docker rm -f $(DOCKER_IMAGE_NAME) >/dev/null 2>&1 || :
   init:
   	@docker volume create $(DOCKER_VOLUME_NAME)
   run: stop
   	@docker run -d \
   		--name $(DOCKER_IMAGE_NAME) \
   		--restart=unless-stopped \
   		-v $(DOCKER_VOLUME_NAME):/var/lib/<SERVICE> \
   		-p 3000:3000 \
   		$(DOCKER_IMAGE_BASE):$(DOCKER_IMAGE_VERSION)
   dev: run attach
   attach:
   	@docker exec -it \
   		`docker ps -aqf "name=$(DOCKER_IMAGE_NAME)"` \
   		/bin/bash
   test:
   	@curl -sS http://127.0.0.1:3000
   browse:
   ifeq ($(OS),Darwin)
   	@open http://127.0.0.1:3000
   else
   	@xdg-open http://127.0.0.1:3000
   endif
   clean: stop
   	@docker rmi -f $(DOCKER_IMAGE_BASE):$(DOCKER_IMAGE_VERSION) >/dev/null 2>&1 || :
   	@docker volume rm $(DOCKER_VOLUME_NAME)
   distclean: agent-stop remove-deployment-policy remove-service-policy remove-service clean
   build:
   	@echo "There is no Docker image build process since this container is provided by a third-party from official sources."
   push:
   	@echo "There is no Docker image push process since this container is provided by a third-party from official sources."
   publish: publish-service publish-service-policy publish-deployment-policy agent-run browse
   # Pull, not push, Docker image since provided by third party
   publish-service:
   	@echo "=================="
   	@echo "PUBLISHING SERVICE"
   	@echo "=================="
   	@hzn exchange service publish -O -P --json-file=service.definition.json
   	@echo ""
   remove-service:
   	@echo "=================="
   	@echo "REMOVING SERVICE"
   	@echo "=================="
   	@hzn exchange service remove -f $(HZN_ORG_ID)/$(SERVICE_NAME)_$(SERVICE_VERSION)_$(ARCH)
   	@echo ""
   publish-service-policy:
   	@echo "========================="
   	@echo "PUBLISHING SERVICE POLICY"
   	@echo "========================="
   	@hzn exchange service addpolicy -f service.policy.json $(HZN_ORG_ID)/$(SERVICE_NAME)_$(SERVICE_VERSION)_$(ARCH)
   	@echo ""
   remove-service-policy:
   	@echo "======================="
   	@echo "REMOVING SERVICE POLICY"
   	@echo "======================="
   	@hzn exchange service removepolicy -f $(HZN_ORG_ID)/$(SERVICE_NAME)_$(SERVICE_VERSION)_$(ARCH)
   	@echo ""
   publish-deployment-policy:
   	@echo "============================"
   	@echo "PUBLISHING DEPLOYMENT POLICY"
   	@echo "============================"
   	@hzn exchange deployment addpolicy -f deployment.policy.json $(HZN_ORG_ID)/policy-$(SERVICE_NAME)_$(SERVICE_VERSION)
   	@echo ""
   remove-deployment-policy:
   	@echo "=========================="
   	@echo "REMOVING DEPLOYMENT POLICY"
   	@echo "=========================="
   	@hzn exchange deployment removepolicy -f $(HZN_ORG_ID)/policy-$(SERVICE_NAME)_$(SERVICE_VERSION)
   	@echo ""
   agent-run:
   	@echo "================"
   	@echo "REGISTERING NODE"
   	@echo "================"
   	@hzn register --policy=node.policy.json
   	@watch hzn agreement list
   agent-stop:
   	@echo "==================="
   	@echo "UN-REGISTERING NODE"
   	@echo "==================="
   	@hzn unregister -f
   	@echo ""
   deploy-check:
   	@hzn deploycheck all -t device -B deployment.policy.json --service=service.definition.json --service-pol=service.policy.json --node-pol=node.policy.json
   log:
   	@echo "========="
   	@echo "EVENT LOG"
   	@echo "========="
   	@hzn eventlog list
   	@echo ""
   	@echo "==========="
   	@echo "SERVICE LOG"
   	@echo "==========="
   	@hzn service log -f $(SERVICE_NAME)
   .PHONY: default stop init run dev test clean build push attach browse publish publish-service publish-service-policy publish-deployment-policy publish-pattern agent-run distclean deploy-check check log remove-deployment-policy remove-service-policy remove-service
   ```

   Before writing, ask the user to confirm the `DOCKER_HUB_ID` value (the DockerHub organisation or user that publishes the upstream image). Substitute it into `DOCKER_IMAGE_BASE` and the `check` echo lines.

   Also ask the user to confirm (or override) the port mapping (`3000:3000` above) and the volume mount path (`/var/lib/<SERVICE>`) — both are service-specific.

5. **Write the Makefile**

   Write the composed content to `Makefile` in the repository root, using real tab characters (not spaces) for recipe indentation. Confirm the write with the user before proceeding if in interactive mode.

6. **Display confirmation**

   ```
   ## Makefile Created

   Service name : <SERVICE>
   Docker Hub ID: <DOCKER_HUB_ID>
   Port mapping : 3000:3000
   Volume path  : /var/lib/<SERVICE>
   File         : Makefile

   ✓ Makefile created successfully

   Please review the Makefile, adjust any variable defaults as needed,
   and commit it to your repository.
   ```

**Output On Success**

```
## Makefile Created

Service name : myservice
Docker Hub ID: myorg
Port mapping : 8080:8080
Volume path  : /var/lib/myservice
File         : Makefile

✓ Makefile created successfully

Please review the Makefile, adjust any variable defaults as needed,
and commit it to your repository.
```

**Output When File Already Exists**

```
## Makefile Already Present

Current contents:
[display existing file]

Options:
  a) Replace with the standard skeleton
  b) Skip — keep existing Makefile
  c) Cancel

Choose an option:
```

**Guardrails**

- Always check for an existing `Makefile` before creating a new one
- Never overwrite without explicit user confirmation
- Replace every occurrence of `grafana` / `grafana-storage` with the actual service name — do not leave template placeholders in the output file
- Recipe lines **must** use real tab characters; spaces will break `make`
- Do not hard-code any service-specific values (ports, volume paths, DockerHub IDs) without confirming with the user first
- `build` and `push` targets must print a message explaining that no build step is needed (third-party image pattern)
- Do not commit to git automatically — leave that to the user or the calling workflow
- This skill covers the **no-build/no-push** variant only; for services that build their own image a different skill is needed

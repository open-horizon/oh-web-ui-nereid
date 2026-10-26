---
name: oh-agent-install
description: Expert guidance for installing, configuring, and managing Open Horizon agents on remote Linux hosts using the agent-install.sh script. Use when deploying Horizon agents, configuring SSH-based remote installs, setting up environment variables, registering nodes with policies, or troubleshooting agent installation failures.
---

# Agent Installation and Configuration

## Purpose

Enable system administrators to successfully deploy and configure Horizon agents on remote edge nodes with proper Exchange connectivity, authentication, and registration. Reduce errors in agent setup and provide clear troubleshooting paths for common installation issues.

## Core Rules

### 1. Remote Agent Installation Workflow

**Target Systems**
- Remote Linux hosts accessible via SSH without password (key-based authentication)
- User with passwordless sudo access (e.g., `edge@hostname`)
- Debian/Ubuntu-based systems (primary support)

**Prerequisites - Required Files**
- `agent-install.cfg` - Exchange and service URLs configuration
- `mycreds.env` - Authentication credentials (HZN_EXCHANGE_USER_AUTH, AGENT_VERBOSITY)
- `node.policy.json` - Node policy for service deployment

If node.policy.json is not available locally:
```bash
curl -fsSL https://raw.githubusercontent.com/open-horizon-services/web-helloworld-python/refs/heads/main/node.policy.json -o node.policy.json
```

**Prerequisites - Docker Installation**
Check if Docker is installed on the remote host:
```bash
ssh edge@<host> 'docker --version 2>&1 || echo "Docker not installed"'
```

Install Docker and service dependencies if needed:
```bash
ssh edge@<host> 'sudo apt-get update && sudo apt-get -y install docker.io gcc make git jq curl net-tools && docker --version && sudo usermod -aG docker edge'
```

### 2. Installation Steps

**Step 1: Copy Required Files to Remote Host**

Use `-o StrictHostKeyChecking=no` to avoid SSH host key confirmation prompts:

```bash
scp -o StrictHostKeyChecking=no node.policy.json edge@<host>:~/
scp -o StrictHostKeyChecking=no oh-credentials/agent-install.cfg edge@<host>:~/
scp -o StrictHostKeyChecking=no oh-credentials/mycreds.env edge@<host>:~/
```

**Step 2: Download Agent Installation Script**

Download the latest agent-install.sh script on the remote host:
```bash
ssh -o StrictHostKeyChecking=no edge@<host> 'curl -fsSL https://raw.githubusercontent.com/open-horizon/anax/refs/heads/master/agent-install/agent-install.sh -o agent-install.sh && chmod +x agent-install.sh && echo "Script downloaded and made executable"'
```

**Step 3: Persist Environment Variables**

Add environment variables to ~/.bashrc for persistence across sessions:
```bash
ssh -o StrictHostKeyChecking=no edge@<host> 'echo "" >> ~/.bashrc && echo "# Open Horizon environment variables" >> ~/.bashrc && while IFS= read -r line; do echo "export $line" >> ~/.bashrc; done < agent-install.cfg && echo "source ~/mycreds.env" >> ~/.bashrc && echo "Environment variables added to ~/.bashrc"'
```

This adds:
- All variables from agent-install.cfg as export statements
- Source command for mycreds.env

**Step 4: Run Agent Installation**

**IMPORTANT**: The installation script must be run with sudo and the -E flag to preserve environment variables.

**DO NOT** use the `-c ./agent-install.crt` flag unless you have a valid certificate file. The script will attempt to download the certificate from the CSS and will fail if the file path is specified but empty.

Correct installation command:
```bash
ssh -o StrictHostKeyChecking=no edge@<host> 'export $(cat agent-install.cfg) && source mycreds.env && sudo -E ./agent-install.sh -i anax: -k ./agent-install.cfg -n ./node.policy.json -b'
```

Installation flags explained:
- `-i anax:` - Use latest anax release from GitHub
- `-k ./agent-install.cfg` - Configuration file with Exchange URLs
- `-n ./node.policy.json` - Node policy for registration
- `-b` - Batch mode (skip prompts)
- `sudo -E` - Run as root while preserving environment variables

**Step 5: Verify Installation**

Check node status:
```bash
ssh edge@<host> 'hzn node list'
```

Expected output shows:
- Node state: "configured"
- Token valid: true
- Exchange connection established
- Horizon agent version displayed

Example:
```json
{
  "id": "giraffe",
  "organization": "myorg",
  "pattern": "",
  "name": "giraffe",
  "nodeType": "device",
  "token_valid": true,
  "configstate": {
    "state": "configured"
  }
}
```

### 3. Agent Environment Configuration

**Required Environment Variables (in agent-install.cfg)**
```
HZN_ORG_ID=myorg
HZN_EXCHANGE_URL=http://${HZN_LISTEN_IP}:3090/v1
HZN_FSS_CSSURL=http://${HZN_LISTEN_IP}:9443/
HZN_AGBOT_URL=http://${HZN_LISTEN_IP}:3111
HZN_SDO_SVC_URL=http://${HZN_LISTEN_IP}:9008/api
HZN_FDO_SVC_URL=http://${HZN_LISTEN_IP}:9008/api
```

**Authentication Credentials (in mycreds.env)**
```
HZN_EXCHANGE_USER_AUTH=admin:<password>
AGENT_VERBOSITY=3
```

**Configuration File Locations**
- Linux (systemd): `/etc/default/horizon`
- Environment persistence: `~/.bashrc` (for user sessions)

**Restart Agent After Configuration Changes**
```bash
# Linux (systemd)
sudo systemctl restart horizon
```

### 4. Policy-Based Registration

The agent-install.sh script automatically registers the node using the provided node.policy.json file. The node policy defines properties and constraints for service deployment.

**Example Node Policy (node.policy.json)**
```json
{
  "properties": [
    {"name": "location", "value": "warehouse-1"},
    {"name": "arch", "value": "amd64"},
    {"name": "purpose", "value": "security"}
  ],
  "constraints": []
}
```

**Verify Registration**
```bash
# Check node status
hzn node list

# Verify Exchange connectivity
hzn exchange status

# List active agreements
hzn agreement list

# Check node policy
hzn policy list
```

**Manual Unregister (if needed)**
```bash
# Unregister and remove services
hzn unregister -f

# Deep clean (removes all data)
hzn unregister -frD
```

### 5. Registering Without a Workload

Sometimes you need to register an agent without deploying any services or workloads. This is useful for:
- Testing agent connectivity and configuration
- Preparing nodes before assigning workloads
- Troubleshooting registration issues
- Setting up nodes that will receive policies later

**Check if Node Already Exists in Exchange**

Before registering, check if the node already exists:
```bash
hzn exchange node list -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" | jq -r 'keys[]' | grep -F "<node-id>"
```

**Remove Existing Node (if needed)**

If the node exists and has a public key set, you must remove it first:
```bash
# Remove with confirmation prompt
hzn exchange node remove -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" <node-id>

# Remove without prompt (automated)
echo "y" | hzn exchange node remove -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" <node-id>
```

**Register Without Pattern or Policy**

To register the agent without deploying any workload, simply omit the pattern and policy parameters:
```bash
hzn register -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}"
```

This command:
- Creates the node in the Exchange with a random token
- Sets the node state to "configured"
- Does NOT deploy any services or workloads
- Leaves the pattern field empty
- Uses any existing node policy (if present) but won't form agreements without matching deployment policies

**Verify Registration Without Workload**
```bash
# Check node status
hzn node list

# Expected output shows:
# - organization: set to your org
# - pattern: "" (empty)
# - configstate.state: "configured"
# - token_valid: true
```

**Common Issue: Public Key Conflict**

If you see an error like "public key is set for node, cannot set a token":
1. The node exists in the Exchange with a public key
2. You must remove the node first: `echo "y" | hzn exchange node remove -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" <node-id>`
3. Then register again

**Adding Workload Later**

After registering without a workload, you can add one later by:
- Registering with a pattern: `hzn register -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" -p <pattern>`
- Setting a node policy: `hzn policy update -f node.policy.json`
- Or unregistering and re-registering with the desired configuration

### 6. Post-Installation Operations

**Monitor Agreement Formation**
```bash
hzn agreement list
```

**Check Service Status**
```bash
hzn service list
```

**View Event Logs**
```bash
hzn eventlog list
```

**Check Node Policy**
```bash
hzn policy list
```

**Optional: Install Service Prerequisites**
If not already installed during Docker setup:
```bash
sudo apt-get -y install gcc make git jq curl net-tools
```

**Optional: Clone and Publish Services**
You may want to:
- Provide a list of example services already on the Exchange
- List repositories in the "open-horizon-services" GitHub organization (names beginning with "service-")
- Offer to clone and publish services to the Exchange

### 7. Agent Lifecycle Operations

**Check Agent Status**
```bash
# Linux (systemd)
sudo systemctl status horizon
```

**Start/Stop Agent**
```bash
# Linux (systemd)
sudo systemctl start horizon
sudo systemctl stop horizon
```

**View Agent Logs**
```bash
# Linux (systemd with journalctl)
sudo journalctl -u horizon -f

# Linux (systemd, last 100 lines)
sudo journalctl -u horizon -n 100
```

**Check Agent Version**
```bash
hzn version
```

### 8. Troubleshooting Agent Issues

**Issue: "must be root to run agent-install.sh"**
- **Solution**: Use `sudo -E` to run the script with root privileges while preserving environment variables.

**Issue: "exit code 3 from: downloading" when using -c flag**
- **Cause**: The `-c ./agent-install.crt` flag was specified but the certificate file is empty or invalid.
- **Solution**: Omit the `-c` flag entirely. The script will handle certificate management automatically.

**Issue: SSH host key verification prompt**
- **Solution**: Use `-o StrictHostKeyChecking=no` flag with scp and ssh commands.

**Issue: Docker not installed**
- **Solution**: Install Docker before running agent installation:
  ```bash
  sudo apt-get update && sudo apt-get -y install docker.io
  ```

**Issue: No agreements forming**
- **Possible causes**:
  - Agbot not running on management hub
  - No matching deployment policies
  - Node policy constraints not satisfied
  - Service not published to Exchange
- **Check**: Review node policy and ensure matching deployment policies exist in the Exchange.

**Agent Won't Start**
- Check configuration file syntax: `cat /etc/default/horizon`
- Verify Exchange URL is reachable: `curl -k ${HZN_EXCHANGE_URL}/version`
- Check system logs: `sudo journalctl -u horizon -n 50`
- Verify no port conflicts (8510 for agent API)

**Registration Fails**
- Verify credentials: `hzn exchange user list`
- Check organization exists: `hzn exchange org list`
- Ensure node ID is unique in organization
- Verify network connectivity to Exchange

**Issue: "public key is set for node, cannot set a token"**
- **Cause**: The node already exists in the Exchange with a public key configured, preventing token-based authentication.
- **Solution**: Remove the existing node from the Exchange first:
  ```bash
  echo "y" | hzn exchange node remove -o "${HZN_ORG_ID}" -u "${HZN_EXCHANGE_USER_AUTH}" <node-id>
  ```
  Then register again.

## Notes

### Common Pitfalls

1. **Credential Format**: `HZN_EXCHANGE_USER_AUTH` must be "username:password" or "username:apikey", not just the password
2. **Organization Prefix**: When using CLI commands, credentials need org prefix: `${HZN_ORG_ID}/${HZN_EXCHANGE_USER_AUTH}`
3. **Node ID Uniqueness**: Node IDs must be unique within an organization; reusing IDs causes registration conflicts. The node ID defaults to the hostname if not specified.
4. **Certificate Flag**: Do NOT use `-c` flag with agent-install.sh unless you have a valid certificate file
5. **Environment Preservation**: Must use `sudo -E` to preserve environment variables when running agent-install.sh
6. **SSH Key Authentication**: Remote installation workflow requires passwordless SSH access to target hosts

### Best Practices

1. **Use API Keys**: Generate API keys instead of passwords for automation: `hzn exchange user create -A`
2. **Secure Credentials**: Store credentials in environment files with restricted permissions (600)
3. **Environment Persistence**: Add environment variables to ~/.bashrc for persistence across sessions
4. **Health Monitoring**: Regularly check agent status and agreement formation in production environments
5. **Log Rotation**: Configure log rotation for agent logs to prevent disk space issues
6. **Agreement Formation**: Agreement formation may take several minutes depending on network and agbot responsiveness

### Authorization Requirements

**Agent Installation** (no Exchange permissions required):
- Download and install agent packages
- Start/stop agent service
- Configure agent environment files
- View agent logs

**Node Registration** (requires valid Exchange user):
- Register node with pattern or policy
- Update node policy
- View node status and agreements
- Unregister node (node owner or org admin)

**Node Management** (requires `admin: true` OR node owner):
- Force unregister another user's node (admin only)
- Update node policy for another user's node (admin only)
- Remove node from Exchange (admin or node owner)

### Alternative Installation Methods

While this guide focuses on the agent-install.sh script method (recommended for remote deployments), other installation methods exist:

**Native Package Installation (Local)**
- Debian/Ubuntu: apt-get install horizon
- RHEL/CentOS: yum install horizon

**Container-Based (macOS/Development)**
- Podman or Docker containers running openhorizon/amd64_anax:latest
- Requires privileged mode and docker socket mount

For production remote deployments, the agent-install.sh script method documented above is recommended.

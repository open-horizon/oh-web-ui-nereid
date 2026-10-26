---
name: oh-debugging
description: Expert guidance for troubleshooting Open Horizon edge deployments. Use when diagnosing agent connectivity issues, analyzing agreement formation failures, inspecting service containers, filtering agent logs, debugging agreement lifecycle events, troubleshooting service updates, or validating policy syntax.
---

# Debugging Workflows

## Purpose

Enable developers to efficiently diagnose and resolve issues in distributed edge systems. Provide systematic debugging workflows that reduce time to resolution for common problems including connectivity failures, deployment issues, and service runtime errors.

## Security Guidelines

**CRITICAL: Credential Protection**

When debugging Open Horizon systems, especially when working with `HZN_EXCHANGE_USER_AUTH`:
- **NEVER** print or display the actual value of `HZN_EXCHANGE_USER_AUTH` to the screen
- **ALWAYS** mask credential values when displaying commands or output
- Use `${HZN_EXCHANGE_USER_AUTH}` in examples and documentation
- When showing command output that includes credentials, replace with `***MASKED***` or similar
- When exporting logs or diagnostic bundles, sanitize credentials before sharing

Example of proper credential handling:
```bash
# CORRECT - uses variable reference
curl -u "${HZN_ORG_ID}/${HZN_EXCHANGE_USER_AUTH}" ${HZN_EXCHANGE_URL}/orgs/${HZN_ORG_ID}/users

# CORRECT - masked in output
HZN_EXCHANGE_USER_AUTH=***MASKED***

# INCORRECT - never do this
HZN_EXCHANGE_USER_AUTH=admin:actualpassword123
```

## Core Rules

### 1. Diagnose Agent Connectivity Issues

**Test Exchange Connectivity**
```bash
# Verify Exchange is reachable
hzn exchange status

# Check Exchange version
hzn exchange version

# Test with curl
curl -k ${HZN_EXCHANGE_URL}/version
```

**Verify Agent Configuration**
```bash
# Show current configuration
hzn node list

# Check Exchange URL
hzn node list | grep exchange_api

# Verify organization
hzn node list | grep organization

# Check node ID
hzn node list | grep id
```

**Test CSS Connectivity** (if using Model Management)
```bash
# Check CSS configuration
hzn node list | grep exchange_api

# Test CSS endpoint
curl -k ${HZN_FSS_CSSURL}/api/v1/health
```

**Network Troubleshooting**
```bash
# Test DNS resolution
nslookup exchange.example.com

# Test port connectivity
nc -zv exchange.example.com 3090

# Check firewall rules
sudo iptables -L | grep 3090

# Verify routing
traceroute exchange.example.com
```

**Authentication Issues**
```bash
# Test credentials
hzn exchange user list

# Verify user exists
curl -u "${HZN_ORG_ID}/${HZN_EXCHANGE_USER_AUTH}" \
  ${HZN_EXCHANGE_URL}/orgs/${HZN_ORG_ID}/users

# Check for 401/403 errors in agent logs
sudo journalctl -u horizon | grep -i "401\|403"
```

### 2. Analyze Agreement Formation Failures

**Check Policy Compatibility**

**Step 1: View Node Policy**
```bash
# Show node properties
hzn policy list

# Extract properties
hzn policy list | jq '.properties'

# Extract constraints
hzn policy list | jq '.constraints'
```

**Step 2: View Deployment Policy**
```bash
# List deployment policies
hzn exchange deployment listpolicy

# View specific policy
hzn exchange deployment listpolicy my-service-policy

# Extract constraints
hzn exchange deployment listpolicy my-service-policy | jq '.constraints'
```

**Step 3: Compare Constraints**
```bash
# Node must satisfy deployment policy constraints
# Example: If policy requires "location == warehouse"
# Node must have property: {"name": "location", "value": "warehouse"}

# Check if node properties match
hzn policy list | jq '.properties[] | select(.name=="location")'
```

**Verify Service Availability**
```bash
# Check service exists
hzn exchange service list | grep my-service

# Verify specific version
hzn exchange service list myorg/my-service_1.0.0_amd64

# Check service architecture matches node
hzn node list | grep architecture
```

**Check Node Properties**
```bash
# List all node properties
hzn policy list | jq '.properties'

# Verify required properties exist
# Common properties: arch, memory, location, purpose

# Add missing properties
cat > node.policy.json <<EOF
{
  "properties": [
    {"name": "location", "value": "warehouse"},
    {"name": "memory", "value": 4096}
  ]
}
EOF

hzn policy update -f node.policy.json
```

**Monitor Agreement Negotiation**
```bash
# Watch eventlog for agreement events
hzn eventlog list -f | grep agreement

# Filter for errors
hzn eventlog list | grep -i "error\|fail"

# Check policy evaluation
hzn eventlog list | grep -i policy
```

### 3. Inspect Service Container Status

**List Running Containers**
```bash
# Show all Horizon service containers
docker ps | grep horizon

# Or with podman
podman ps | grep horizon

# Show container details
docker ps --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}"
```

**View Container Logs**
```bash
# Follow logs for specific container
docker logs -f <container-id>

# Show last 100 lines
docker logs --tail 100 <container-id>

# Show logs with timestamps
docker logs -t <container-id>

# Filter for errors
docker logs <container-id> 2>&1 | grep -i error
```

**Check Container Resource Usage**
```bash
# Show real-time stats
docker stats

# Show stats for specific container
docker stats <container-id>

# Check memory usage
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}"

# Check CPU usage
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}"
```

**Inspect Container Configuration**
```bash
# Show container details
docker inspect <container-id>

# Check environment variables
docker inspect <container-id> | jq '.[0].Config.Env'

# Check port mappings
docker inspect <container-id> | jq '.[0].NetworkSettings.Ports'

# Check volume mounts
docker inspect <container-id> | jq '.[0].Mounts'
```

**Container Health Checks**
```bash
# Check if container is healthy
docker inspect <container-id> | jq '.[0].State.Health'

# Test service endpoint
curl http://localhost:8080/health

# Check container exit code
docker inspect <container-id> | jq '.[0].State.ExitCode'
```

### 4. Access and Filter Agent Logs

**View Agent System Logs**
```bash
# Linux (systemd with journalctl)
sudo journalctl -u horizon -f

# Show last 100 lines
sudo journalctl -u horizon -n 100

# Show logs since specific time
sudo journalctl -u horizon --since "1 hour ago"

# Show logs for specific date
sudo journalctl -u horizon --since "2024-01-15" --until "2024-01-16"
```

**Container Agent Logs**
```bash
# Podman
podman logs -f horizon1

# Docker
docker logs -f horizon-agent

# Show last 200 lines
podman logs --tail 200 horizon1
```

**Filter Logs by Severity**
```bash
# Show only errors
sudo journalctl -u horizon | grep -i error

# Show errors and warnings
sudo journalctl -u horizon | grep -iE "error|warn"

# Show critical issues
sudo journalctl -u horizon -p err
```

**Search Logs for Specific Events**
```bash
# Search for agreement events
sudo journalctl -u horizon | grep -i agreement

# Search for service events
sudo journalctl -u horizon | grep -i "service.*my-service"

# Search for policy events
sudo journalctl -u horizon | grep -i policy

# Search for Exchange API calls
sudo journalctl -u horizon | grep -i "exchange.*api"
```

**Export Logs for Analysis**
```bash
# Export to file
sudo journalctl -u horizon --since "1 hour ago" > horizon-logs.txt

# Export with timestamps
sudo journalctl -u horizon -o short-iso > horizon-logs-timestamped.txt

# Export in JSON format
sudo journalctl -u horizon -o json > horizon-logs.json
```

### 5. Debug Agreement Lifecycle Events

**View Agreement History**
```bash
# List all eventlog entries
hzn eventlog list

# Filter for agreement events
hzn eventlog list -t agreement

# Show recent agreement activity
hzn eventlog list -t agreement -s

# Follow eventlog in real-time
hzn eventlog list -f
```

**Check Agreement Termination Reason**
```bash
# View eventlog for specific agreement
hzn eventlog list | grep <agreement-id>

# Look for termination events
hzn eventlog list | grep -i "terminated\|cancelled"

# Check termination reason
hzn eventlog list | grep -A 5 "agreement.*terminated"
```

**Monitor Agreement Formation**
```bash
# Watch for new agreements
hzn eventlog list -f | grep "agreement.*formed"

# Monitor negotiation process
hzn eventlog list -f | grep "agreement.*negotiat"

# Check for formation failures
hzn eventlog list -f | grep -i "agreement.*fail"
```

**Agreement State Transitions**
```
States: negotiating → formed → finalized → archived
        ↓
     cancelled (if terminated)
```

**Analyze Agreement Details**
```bash
# Show agreement details
hzn agreement list <agreement-id>

# Check agreement terms
hzn agreement list <agreement-id> | jq '.agreement_protocol_terminated_time'

# View service details in agreement
hzn agreement list <agreement-id> | jq '.workload_to_run'
```

### 6. Troubleshoot Service Update Issues

**Check Service Version Mismatch**
```bash
# Show deployed service version
hzn agreement list | jq '.[].workload_to_run.version'

# Check Exchange for latest version
hzn exchange service list myorg/my-service

# Compare versions
# If mismatch, check deployment policy version range
```

**Verify Image Availability**
```bash
# Check if image exists locally
docker images | grep my-service

# Try pulling image manually
docker pull myorg/my-service:1.0.0

# Check registry connectivity
curl -I https://registry.example.com/v2/

# Test registry authentication
docker login registry.example.com
```

**Diagnose Rollback Triggers**
```bash
# Check agreement termination reason
hzn eventlog list | grep -i rollback

# Look for health check failures
hzn eventlog list | grep -i "health.*fail"

# Check service exit codes
docker ps -a | grep my-service
docker inspect <container-id> | jq '.[0].State.ExitCode'
```

**Service Update Process**
```bash
# Force service update
hzn agreement cancel -a

# Monitor new agreement formation
hzn eventlog list -f | grep agreement

# Verify new version deployed
hzn agreement list | jq '.[].workload_to_run.version'
```

### 7. Validate Policy Syntax

**Validate Deployment Policy**
```bash
# Check JSON syntax
cat deployment.policy.json | jq .

# Verify required fields
cat deployment.policy.json | jq '.service'

# Check constraint syntax
cat deployment.policy.json | jq '.constraints'
```

**Test Constraint Expressions**
```bash
# Example node properties
cat > test-node.json <<EOF
{
  "properties": [
    {"name": "location", "value": "warehouse"},
    {"name": "memory", "value": 4096}
  ]
}
EOF

# Test if constraints would match
# Constraint: location == "warehouse" AND memory >= 2048
# This node would match (location matches, memory 4096 >= 2048)
```

**Verify Policy References**
```bash
# Check if referenced service exists
SERVICE_URL=$(cat deployment.policy.json | jq -r '.service.name')
hzn exchange service list | grep ${SERVICE_URL}

# Verify service version exists
SERVICE_VERSION=$(cat deployment.policy.json | jq -r '.service.serviceVersions[0].version')
hzn exchange service list | grep ${SERVICE_VERSION}

# Check if pattern exists (if using patterns)
PATTERN=$(cat node.policy.json | jq -r '.pattern')
hzn exchange pattern list | grep ${PATTERN}
```

**Common Policy Errors**
```json
// ❌ Wrong: Missing quotes around string values
{"constraints": ["location == warehouse"]}

// ✅ Correct: String values in quotes
{"constraints": ["location == \"warehouse\""]}

// ❌ Wrong: Invalid operator
{"constraints": ["memory = 1024"]}

// ✅ Correct: Use == for equality
{"constraints": ["memory == 1024"]}

// ❌ Wrong: Property name typo
{"constraints": ["loaction == \"warehouse\""]}

// ✅ Correct: Exact property name
{"constraints": ["location == \"warehouse\""]}
```

## Notes

### Common Debugging Scenarios

**Scenario 1: Node Registered but No Services Deploy**
1. Check node policy: `hzn policy list`
2. List deployment policies: `hzn exchange deployment listpolicy`
3. Verify constraints match
4. Check eventlog for errors: `hzn eventlog list | grep -i error`
5. Verify service exists: `hzn exchange service list`

**Scenario 2: Service Container Keeps Restarting**
1. Check container logs: `docker logs <container-id>`
2. Verify image exists: `docker images | grep my-service`
3. Check resource limits: `docker stats`
4. Test service locally: `docker run -it myorg/my-service:1.0.0`
5. Check for port conflicts: `netstat -tulpn | grep 8080`

**Scenario 3: Agreement Forms but Service Doesn't Start**
1. Check agreement status: `hzn agreement list`
2. Verify image pull: `docker images`
3. Check container status: `docker ps -a`
4. View container logs: `docker logs <container-id>`
5. Check agent logs: `sudo journalctl -u horizon -n 100`

**Scenario 4: Service Update Not Happening**
1. Verify new version published: `hzn exchange service list`
2. Check deployment policy updated: `hzn exchange deployment listpolicy`
3. View agreement priority: `hzn agreement list | jq '.[].agreement_protocol'`
4. Force update: `hzn agreement cancel -a`
5. Monitor new agreement: `hzn eventlog list -f`

### Best Practices

1. **Systematic Approach**: Follow debugging workflows step-by-step
2. **Log Everything**: Capture logs before making changes
3. **Test Incrementally**: Change one thing at a time
4. **Document Findings**: Keep notes on what worked/didn't work
5. **Check Basics First**: Connectivity, credentials, configuration
6. **Use Eventlog**: Primary source for agreement lifecycle events
7. **Monitor Resources**: Check CPU, memory, disk space
8. **Validate Policies**: Test constraint logic before deploying

### Authorization Requirements

**Local Debugging Operations** (no Exchange permissions required):
- View agent logs (requires OS-level log access)
- List running service containers
- View container logs
- Check container resource usage
- Inspect agent configuration files

**Node-Scoped Debugging Operations** (requires node owner OR org member):
- View node status and configuration
- List agreements on node (node owner)
- View agreement details (node owner)
- Check node policy (node owner or org member)
- View eventlog for node (node owner)

**Organization-Scoped Debugging Operations** (requires org member):
- List services in organization (read-only)
- View service definitions (read-only)
- List deployment policies (read-only)
- List patterns (read-only)
- Query node list in organization (may be restricted)

**Administrative Debugging Operations** (requires `admin: true`):
- View agreements for any node in organization
- Access eventlog for any node
- Force cancel agreements on any node
- View detailed node information for any node

### Troubleshooting Tools

**Essential Commands**
```bash
# Quick health check
hzn node list && hzn exchange status && hzn agreement list

# Full diagnostic
hzn node list
hzn exchange status
hzn policy list
hzn agreement list
hzn eventlog list -n 50
docker ps
sudo journalctl -u horizon -n 100

# Export diagnostic bundle
mkdir horizon-debug
hzn node list > horizon-debug/node.txt
hzn agreement list > horizon-debug/agreements.txt
hzn eventlog list > horizon-debug/eventlog.txt
docker ps -a > horizon-debug/containers.txt
sudo journalctl -u horizon -n 500 > horizon-debug/agent-logs.txt
tar -czf horizon-debug.tar.gz horizon-debug/
```

**Log Analysis Tips**
- Look for patterns in timestamps (repeated errors)
- Check for correlation between events (agreement cancelled → service stopped)
- Search for specific error codes (401, 403, 500)
- Filter by severity (ERROR, WARN, INFO)
- Export logs for offline analysis with grep, awk, jq

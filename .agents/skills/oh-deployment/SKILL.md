---
name: oh-deployment
description: Expert guidance for managing Open Horizon service deployments through policies and patterns. Use when creating deployment policies with constraints, publishing patterns, configuring node policies, monitoring agreement formation, troubleshooting deployment failures, or managing service upgrade and rollback strategies.
---

# Deployment Management

## Purpose

Enable developers to effectively deploy and manage edge services across distributed nodes using policy-based or pattern-based approaches. Reduce deployment failures through proper constraint configuration and provide clear troubleshooting workflows for agreement formation issues.

## Security Guidelines

**CRITICAL: Credential Protection**

When managing Open Horizon deployments, especially when working with `HZN_EXCHANGE_USER_AUTH`:
- **NEVER** print or display the actual value of `HZN_EXCHANGE_USER_AUTH` to the screen
- **ALWAYS** mask credential values when displaying commands or output
- Use `${HZN_EXCHANGE_USER_AUTH}` in examples and documentation
- When showing command output that includes credentials, replace with `***MASKED***` or similar
- This applies to all deployment policies, patterns, and registration commands

Example of proper credential handling:
```bash
# CORRECT - uses variable reference
hzn register -o myorg -u myorg/${HZN_EXCHANGE_USER_AUTH} -p warehouse-pattern

# CORRECT - masked in output
HZN_EXCHANGE_USER_AUTH=***MASKED***

# INCORRECT - never do this
hzn register -o myorg -u myorg/admin:actualpassword123 -p warehouse-pattern
```

## Core Rules

### 1. Deployment Policy Creation

**Basic Deployment Policy Template** (`deployment.policy.json`)
```json
{
  "label": "Deployment Policy for My Service",
  "description": "Deploys my-service to warehouse nodes",
  "service": {
    "name": "my-service",
    "org": "myorg",
    "arch": "amd64",
    "serviceVersions": [
      {
        "version": "1.0.0",
        "priority": {},
        "upgradePolicy": {}
      }
    ],
    "nodeHealth": {
      "missing_heartbeat_interval": 600,
      "check_agreement_status": 120
    }
  },
  "properties": [
    {
      "name": "purpose",
      "value": "production"
    }
  ],
  "constraints": [
    "location == \"warehouse\"",
    "memory >= 1024"
  ],
  "userInput": [
    {
      "serviceOrgid": "myorg",
      "serviceUrl": "my-service",
      "serviceVersionRange": "[1.0.0,2.0.0)",
      "inputs": [
        {
          "name": "MY_VAR",
          "value": "production-value"
        }
      ]
    }
  ]
}
```

**Constraint Expressions**
```
# Property comparisons
location == "warehouse"
arch == "amd64"
memory >= 2048
cpu_count > 2

# Boolean properties
has_gpu == true
is_production == true

# String operations
location in ["warehouse-1", "warehouse-2"]
region != "test"

# Logical operators
location == "warehouse" AND memory >= 1024
arch == "amd64" OR arch == "arm64"
```

**Publish Deployment Policy**
```bash
# Publish policy to Exchange
hzn exchange deployment addpolicy \
  -f deployment.policy.json \
  my-service-policy

# Verify publication
hzn exchange deployment listpolicy

# View specific policy
hzn exchange deployment listpolicy my-service-policy
```

**Update Deployment Policy**
```bash
# Modify policy file, then update
hzn exchange deployment updatepolicy \
  -f deployment.policy.json \
  my-service-policy
```

### 2. Deployment Pattern Management

**Basic Pattern Template** (`pattern.json`)
```json
{
  "label": "Warehouse Pattern",
  "description": "Standard services for warehouse edge nodes",
  "public": false,
  "services": [
    {
      "serviceUrl": "my-service",
      "serviceOrgid": "myorg",
      "serviceArch": "amd64",
      "serviceVersions": [
        {
          "version": "1.0.0",
          "priority": {},
          "upgradePolicy": {}
        }
      ],
      "dataVerification": {},
      "nodeHealth": {}
    },
    {
      "serviceUrl": "gps-service",
      "serviceOrgid": "myorg",
      "serviceArch": "amd64",
      "serviceVersions": [
        {
          "version": "2.1.0"
        }
      ]
    }
  ],
  "userInput": [
    {
      "serviceOrgid": "myorg",
      "serviceUrl": "my-service",
      "serviceVersionRange": "1.0.0",
      "inputs": [
        {
          "name": "MY_VAR",
          "value": "pattern-value"
        }
      ]
    }
  ]
}
```

**Publish Pattern**
```bash
# Publish pattern to Exchange
hzn exchange pattern publish \
  -f pattern.json \
  -p warehouse-pattern

# List patterns
hzn exchange pattern list

# View pattern details
hzn exchange pattern list myorg/warehouse-pattern
```

**Register Node with Pattern**
```bash
hzn register -o myorg \
  -u myorg/admin:password \
  -p warehouse-pattern \
  -n node-id:node-token
```

### 3. Node Policy Configuration

**Basic Node Policy Template** (`node.policy.json`)
```json
{
  "properties": [
    {
      "name": "location",
      "value": "warehouse-1"
    },
    {
      "name": "arch",
      "value": "amd64"
    },
    {
      "name": "memory",
      "value": 4096
    },
    {
      "name": "purpose",
      "value": "production"
    },
    {
      "name": "has_gpu",
      "value": false
    }
  ],
  "constraints": [
    "purpose == production"
  ]
}
```

**Create Node Policy During Registration**
```bash
hzn register -o myorg \
  -u myorg/admin:password \
  --policy node.policy.json \
  -n node-id:node-token
```

**Update Node Policy on Running Node**
```bash
# Update policy file, then apply
hzn policy update -f node.policy.json

# Verify update
hzn policy list
```

**View Current Node Policy**
```bash
# Show node policy
hzn policy list

# Show in JSON format
hzn policy list -j
```

### 4. Monitor Service Deployments

**List Active Agreements**
```bash
# Show all agreements on node
hzn agreement list

# Show detailed agreement info
hzn agreement list -r

# Filter by service
hzn agreement list | grep my-service
```

**Check Agreement Status**
```bash
# View specific agreement
hzn agreement list <agreement-id>

# Check agreement state
# States: negotiating, formed, finalized, archived
```

**Monitor Agreement Formation**
```bash
# Watch eventlog for agreement events
hzn eventlog list -f

# Filter for agreement events
hzn eventlog list | grep agreement

# Show recent agreement activity
hzn eventlog list -t agreement -s
```

**Check Service Container Status**
```bash
# List running service containers
docker ps | grep horizon

# Check specific service
docker ps | grep my-service

# View container logs
docker logs <container-id>
```

### 5. Handle Deployment Failures

**Diagnose Missing Agreements**

**Step 1: Verify Node Registration**
```bash
# Check node is registered
hzn node list

# Verify Exchange connectivity
hzn exchange status
```

**Step 2: Check Policy Compatibility**
```bash
# View node policy
hzn policy list

# List deployment policies
hzn exchange deployment listpolicy

# Check if constraints match
# Node properties must satisfy deployment policy constraints
```

**Step 3: Verify Service Availability**
```bash
# Check service exists in Exchange
hzn exchange service list | grep my-service

# Verify service version matches policy
hzn exchange service list myorg/my-service_1.0.0_amd64
```

**Step 4: Check Eventlog for Errors**
```bash
# View recent errors
hzn eventlog list | grep -i error

# Look for policy evaluation failures
hzn eventlog list | grep -i policy

# Check for service download issues
hzn eventlog list | grep -i download
```

**Common Failure Reasons**
1. **Constraint Mismatch**: Node properties don't satisfy deployment constraints
2. **Service Not Found**: Service version doesn't exist in Exchange
3. **Architecture Mismatch**: Service arch doesn't match node arch
4. **Image Pull Failure**: Container image not accessible from node
5. **Resource Constraints**: Node lacks memory/CPU for service

**Force Agreement Cancellation**
```bash
# Cancel specific agreement
hzn agreement cancel <agreement-id>

# Cancel all agreements (forces re-negotiation)
hzn agreement cancel -a
```

### 6. Service Upgrade Strategies

**Rolling Update with Version Range**
```json
{
  "service": {
    "serviceVersions": [
      {
        "version": "1.1.0",
        "priority": {
          "priority_value": 100,
          "retries": 3,
          "retry_durations": 300
        }
      },
      {
        "version": "1.0.0",
        "priority": {
          "priority_value": 50
        }
      }
    ]
  }
}
```

**Upgrade Process**
1. Publish new service version to Exchange
2. Update deployment policy to include new version with higher priority
3. Agreements will naturally upgrade as they renew
4. Monitor agreement formation for new version
5. Remove old version from policy after all nodes upgraded

**Immediate Upgrade (Force)**
```bash
# Cancel existing agreements to force immediate upgrade
hzn agreement cancel -a

# New agreements will form with latest version
```

**Gradual Rollout Strategy**
```bash
# Create separate policies for different node groups
# Policy 1: Early adopters (test nodes)
hzn exchange deployment addpolicy -f policy-test.json my-service-test

# Policy 2: Production nodes (after validation)
hzn exchange deployment addpolicy -f policy-prod.json my-service-prod

# Use node properties to target different groups
# Test nodes: purpose == "test"
# Prod nodes: purpose == "production"
```

**Rollback to Previous Version**
```bash
# Update deployment policy to reference stable version
# Edit deployment.policy.json to set serviceVersions[0].version to rollback target
# Then update policy
hzn exchange deployment updatepolicy -f deployment.policy.json my-service-policy

# Cancel agreements to force rollback
hzn agreement cancel -a
```

### 7. Policy Best Practices

**Constraint Design**
- Use specific, testable constraints
- Avoid overly restrictive constraints that limit deployment
- Include architecture constraint: `arch == "amd64"`
- Use property ranges for flexibility: `memory >= 1024`

**Property Naming**
- Use lowercase with underscores: `has_gpu`, `cpu_count`
- Be consistent across organization
- Document property meanings
- Use boolean properties for capabilities: `has_camera`, `is_production`

**Version Management**
- Use version ranges for flexibility: `[1.0.0,2.0.0)`
- Pin critical services to exact versions
- Test upgrades in non-production first
- Maintain backward compatibility within major versions

**Policy Organization**
- One policy per service or service group
- Use descriptive policy names: `warehouse-monitoring-policy`
- Document policy purpose and constraints
- Version control policy files

## Notes

### Common Pitfalls

1. **Constraint Typos**: Property names must match exactly (case-sensitive)
2. **Missing Properties**: Node must have all properties referenced in constraints
3. **Version Mismatches**: Service version in policy must exist in Exchange
4. **Circular Dependencies**: Service A requires B, B requires A
5. **Resource Overcommitment**: Multiple services exceed node resources

### Best Practices

1. **Test Policies Locally**: Validate constraint logic before publishing
2. **Monitor Agreement Formation**: Watch eventlog during initial deployment
3. **Gradual Rollouts**: Deploy to test nodes before production
4. **Document Constraints**: Explain why each constraint exists
5. **Version Pinning**: Use ranges for flexibility, exact versions for stability
6. **Health Checks**: Configure nodeHealth settings for automatic recovery
7. **Rollback Plans**: Always have a rollback strategy before upgrades

### Authorization Requirements

**Policy Management** (requires `admin: true` OR policy creator role):
- Create deployment policy
- Update deployment policy
- Remove deployment policy
- Publish deployment policy to Exchange

**Pattern Management** (requires `admin: true` OR pattern publisher role):
- Create deployment pattern
- Publish pattern to Exchange
- Update existing pattern
- Remove pattern from Exchange

**Node Policy Operations** (requires node owner OR `admin: true`):
- Create node policy (node owner)
- Update node policy on registered node (node owner)
- View node policy (node owner or org member)
- Update another user's node policy (admin only)

**Monitoring Operations** (read-only, requires node owner OR org member):
- List agreements on node (node owner)
- View agreement details (node owner)
- List deployment policies in org (org member)
- List patterns in org (org member)

### Troubleshooting Checklist

**Agreement Not Forming**
- [ ] Node is registered: `hzn node list`
- [ ] Exchange connectivity: `hzn exchange status`
- [ ] Service exists: `hzn exchange service list`
- [ ] Architecture matches: Check service arch vs node arch
- [ ] Constraints satisfied: Compare node properties vs policy constraints
- [ ] No eventlog errors: `hzn eventlog list | grep -i error`

**Service Not Starting**
- [ ] Agreement formed: `hzn agreement list`
- [ ] Container image accessible: Check registry connectivity
- [ ] Sufficient resources: Check memory/CPU availability
- [ ] No port conflicts: Check if ports already in use
- [ ] Container logs: `docker logs <container-id>`

**Upgrade Not Happening**
- [ ] New version published: `hzn exchange service list`
- [ ] Policy updated: `hzn exchange deployment listpolicy`
- [ ] Agreement priority: Check version priorities in policy
- [ ] Force upgrade if needed: `hzn agreement cancel -a`

---
name: oh-hub-admin
description: Expert guidance for administering the Open Horizon Exchange hub. Use when managing users and organizations, querying Exchange resources, monitoring Exchange health, administering node lifecycle, auditing Exchange activity, or managing credentials and API keys. Covers both organization admin and hub admin workflows.
---

# Hub Administration

## Purpose

Enable administrators to effectively manage Exchange resources, users, and organizations. Provide clear workflows for common administrative tasks while respecting authorization boundaries and security best practices.

## Security Guidelines

**CRITICAL: Credential Protection**

When administering the Open Horizon Exchange, especially when working with `HZN_EXCHANGE_USER_AUTH`:
- **NEVER** print or display the actual value of `HZN_EXCHANGE_USER_AUTH` to the screen
- **ALWAYS** mask credential values when displaying commands or output
- Use `${HZN_EXCHANGE_USER_AUTH}` or variable references in examples and documentation
- When showing command output that includes credentials, replace with `***MASKED***` or similar
- This applies to all user management, API calls, and administrative operations
- When generating API keys, mask the returned key value in output

Example of proper credential handling:
```bash
# CORRECT - uses variable reference
hzn exchange user list -o myorg -u admin:${HZN_EXCHANGE_USER_AUTH}

# CORRECT - masked in output
HZN_EXCHANGE_USER_AUTH=***MASKED***
curl -sS -u "myorg/admin:***MASKED***" ${HZN_EXCHANGE_URL}/orgs/myorg/users

# INCORRECT - never do this
hzn exchange user list -o myorg -u admin:actualpassword123
curl -sS -u "myorg/admin:actualpassword123" ${HZN_EXCHANGE_URL}/orgs/myorg/users
```

## Core Rules

### 1. Exchange User Management

**Create New User**
```bash
# Create user with password
hzn exchange user create -o myorg -u admin:adminpw -A username password

# Create user with admin privileges
hzn exchange user create -o myorg -u admin:adminpw -A username password true

# Create user with API key
hzn exchange user create -o myorg -u admin:adminpw -A username "" true
# (empty password generates API key)
```

**List Organization Users**
```bash
# List users in organization (CLI - may only show current user)
hzn exchange user list -o myorg -u admin:adminpw

# List ALL users via Exchange API
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/users | jq .
```

**Update User Permissions**
```bash
# Update user to admin
hzn exchange user update -o myorg -u admin:adminpw username -A true

# Remove admin privileges
hzn exchange user update -o myorg -u admin:adminpw username -A false

# Update user password
hzn exchange user update -o myorg -u admin:adminpw username -p newpassword
```

**Remove User**
```bash
# Remove user from organization
hzn exchange user remove -o myorg -u admin:adminpw username

# Force removal (if user has resources)
hzn exchange user remove -o myorg -u admin:adminpw -f username
```

**Generate API Key**
```bash
# Create new API key for user
hzn exchange user create -o myorg -u admin:adminpw username "" false

# User generates own API key
hzn exchange user create -o myorg -u username:password username "" false
```

### 2. Exchange Organization Management

**Create New Organization** (requires hubAdmin)
```bash
# Create organization
hzn exchange org create -o root -u root:rootpw \
  neworg "Organization Description"

# Create with specific settings
hzn exchange org create -o root -u root:rootpw \
  neworg "Description" \
  --heartbeatmin 10 \
  --heartbeatmax 120
```

**List All Organizations** (requires hubAdmin)
```bash
# List organizations (CLI - limited visibility)
hzn exchange org list -o root -u root:rootpw

# List ALL organizations via Exchange API
curl -sS -u "root/root:rootpw" \
  ${HZN_EXCHANGE_URL}/orgs | jq .
```

**Update Organization Settings**
```bash
# Update organization description
hzn exchange org update -o myorg -u admin:adminpw \
  --description "Updated description"

# Update heartbeat settings
hzn exchange org update -o myorg -u admin:adminpw \
  --heartbeatmin 15 \
  --heartbeatmax 180
```

**View Organization Details**
```bash
# Show organization info
hzn exchange org list myorg -o myorg -u admin:adminpw

# Via API for more details
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg | jq .
```

### 3. Query Exchange Resources

**List All Nodes in Organization**
```bash
# List nodes (CLI)
hzn exchange node list -o myorg -u admin:adminpw

# List nodes via API with details
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | jq .

# Count total nodes
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | jq '.nodes | length'
```

**View Node Details**
```bash
# Show specific node
hzn exchange node list node-id -o myorg -u admin:adminpw

# Via API for complete details
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes/node-id | jq .

# Check node heartbeat
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes/node-id | \
  jq '.nodes[].lastHeartbeat'
```

**List Services in Organization**
```bash
# List all services
hzn exchange service list -o myorg -u admin:adminpw

# Filter by service URL
hzn exchange service list -o myorg -u admin:adminpw | grep my-service

# Count services
hzn exchange service list -o myorg -u admin:adminpw | wc -l
```

**List Deployment Policies**
```bash
# List all deployment policies
hzn exchange deployment listpolicy -o myorg -u admin:adminpw

# View specific policy
hzn exchange deployment listpolicy policy-name -o myorg -u admin:adminpw

# Via API
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/business/policies | jq .
```

**List Patterns**
```bash
# List all patterns
hzn exchange pattern list -o myorg -u admin:adminpw

# View specific pattern
hzn exchange pattern list pattern-name -o myorg -u admin:adminpw

# Via API
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/patterns | jq .
```

### 4. Monitor Exchange Health

**Check Exchange Status**
```bash
# Test Exchange connectivity
hzn exchange status -o myorg -u admin:adminpw

# Verify authentication works
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/admin/status | jq .
```

**Verify Exchange Version**
```bash
# Check Exchange version
hzn exchange version

# Via API
curl -sS ${HZN_EXCHANGE_URL}/admin/version | jq .
```

**Test API Connectivity**
```bash
# Test basic connectivity
curl -sS ${HZN_EXCHANGE_URL}/admin/version

# Test authenticated endpoint
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/status

# Check response time
time curl -sS ${HZN_EXCHANGE_URL}/admin/version
```

**Monitor Node Heartbeats**
```bash
# List nodes with last heartbeat
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | \
  jq '.nodes | to_entries[] | {id: .key, heartbeat: .value.lastHeartbeat}'

# Find stale nodes (no heartbeat in 1 hour)
HOUR_AGO=$(date -u -d '1 hour ago' +%s)
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | \
  jq --arg hour "$HOUR_AGO" '.nodes | to_entries[] | 
    select(.value.lastHeartbeat < $hour) | .key'
```

### 5. Node Lifecycle Management

**View Node Registration Status**
```bash
# Check if node is registered
hzn exchange node list node-id -o myorg -u admin:adminpw

# Check node pattern or policy
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes/node-id | \
  jq '.nodes[].pattern, .nodes[].userInput'
```

**Force Node Unregistration** (admin only)
```bash
# Remove node from Exchange
hzn exchange node remove node-id -o myorg -u admin:adminpw

# Force removal
hzn exchange node remove -f node-id -o myorg -u admin:adminpw
```

**Update Node Configuration** (admin only)
```bash
# Update node pattern
curl -X PATCH -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes/node-id \
  -H "Content-Type: application/json" \
  -d '{"pattern": "myorg/new-pattern"}'

# Update node policy
curl -X PUT -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes/node-id/policy \
  -H "Content-Type: application/json" \
  -d @node.policy.json
```

**Bulk Node Operations**
```bash
# List all nodes
NODES=$(curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | jq -r '.nodes | keys[]')

# Remove stale nodes (example: no heartbeat in 7 days)
WEEK_AGO=$(date -u -d '7 days ago' +%s)
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | \
  jq -r --arg week "$WEEK_AGO" '.nodes | to_entries[] | 
    select(.value.lastHeartbeat < $week) | .key' | \
  while read node; do
    hzn exchange node remove -f "$node" -o myorg -u admin:adminpw
  done
```

### 6. Audit Exchange Activity

**View Recent Node Registrations**
```bash
# List nodes sorted by registration time
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/nodes | \
  jq '.nodes | to_entries | sort_by(.value.lastUpdated) | reverse | 
    .[0:10] | .[] | {id: .key, registered: .value.lastUpdated}'
```

**Check Service Publication History**
```bash
# List services with last updated time
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/services | \
  jq '.services | to_entries | sort_by(.value.lastUpdated) | reverse | 
    .[0:10] | .[] | {id: .key, updated: .value.lastUpdated}'
```

**Review Policy Changes**
```bash
# List deployment policies with timestamps
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/business/policies | \
  jq '.businessPolicy | to_entries | 
    .[] | {id: .key, updated: .value.lastUpdated}'
```

**Monitor User Activity**
```bash
# List users with last updated time
curl -sS -u "myorg/admin:adminpw" \
  ${HZN_EXCHANGE_URL}/orgs/myorg/users | \
  jq '.users | to_entries | 
    .[] | {id: .key, updated: .value.lastUpdated}'
```

### 7. Manage Exchange Credentials

**Generate API Key for User**
```bash
# Create API key (returns key in response)
hzn exchange user create -o myorg -u admin:adminpw username "" false

# User generates own API key
hzn exchange user create -o myorg -u username:password username "" false
```

**Rotate User Credentials**
```bash
# Update user password
hzn exchange user update -o myorg -u admin:adminpw \
  username -p new-password

# Generate new API key (invalidates old one)
hzn exchange user create -o myorg -u admin:adminpw \
  username "" false
```

**Configure Credential Storage**
```bash
# Store credentials in environment file
cat > ~/.hzn/credentials.env <<EOF
export HZN_EXCHANGE_URL=http://exchange.example.com:3090/v1
export HZN_ORG_ID=myorg
export HZN_EXCHANGE_USER_AUTH=username:password
EOF

# Secure the file
chmod 600 ~/.hzn/credentials.env

# Source in shell
source ~/.hzn/credentials.env
```

**Credential Security Best Practices**
```bash
# Use API keys instead of passwords
hzn exchange user create -o myorg -u admin:adminpw username "" false

# Store credentials with restricted permissions
chmod 600 ~/.hzn/credentials.env

# Use environment variables, not command-line arguments
# ❌ Bad: hzn exchange user list -u myorg/admin:password
# ✅ Good: export HZN_EXCHANGE_USER_AUTH=admin:password
#          hzn exchange user list

# Rotate credentials regularly
# Set reminder to update passwords/API keys every 90 days

# Use separate credentials for different environments
# dev-credentials.env, staging-credentials.env, prod-credentials.env
```

## Notes

### Common Administrative Tasks

**Onboard New User**
1. Create user account: `hzn exchange user create`
2. Generate API key for automation
3. Provide Exchange URL and organization ID
4. Test credentials: `hzn exchange user list`
5. Document user's permissions

**Clean Up Stale Nodes**
1. List nodes with old heartbeats
2. Verify nodes are truly offline
3. Remove from Exchange: `hzn exchange node remove`
4. Document removal for audit trail

**Audit Organization Resources**
1. Count nodes: `curl .../nodes | jq '.nodes | length'`
2. Count services: `hzn exchange service list | wc -l`
3. List policies: `hzn exchange deployment listpolicy`
4. Review user list: `curl .../users | jq .`
5. Generate report with timestamps

### Best Practices

1. **Principle of Least Privilege**: Grant minimum permissions needed
2. **API Keys for Automation**: Use API keys instead of passwords for scripts
3. **Regular Audits**: Review users, nodes, and resources monthly
4. **Credential Rotation**: Update passwords/API keys every 90 days
5. **Secure Storage**: Protect credential files with chmod 600
6. **Separate Environments**: Use different credentials for dev/staging/prod
7. **Document Changes**: Keep audit log of administrative actions
8. **Test Before Production**: Validate commands in test environment first

### Authorization Requirements

**Hub Admin Operations** (requires `hubAdmin: true`):
- Create/update/delete organizations
- List all organizations
- Cross-organization user management
- Cross-organization resource queries

**Organization Admin Operations** (requires `admin: true` in target org):
- Create/update/delete users in own organization
- Manage services in own organization
- Manage policies in own organization
- Force node unregistration in own organization
- Generate API keys for users

**Regular User Operations** (no special permissions):
- List services in organization (read-only)
- List nodes in organization (may be restricted)
- View own user information
- Update own password
- Generate own API key

### Security Best Practices

**Credential Management**
- Never commit credentials to version control
- Use `.gitignore` for credential files
- Rotate credentials after personnel changes
- Use API keys for service accounts
- Monitor for unauthorized access attempts

**Access Control**
- Review user permissions quarterly
- Remove inactive users promptly
- Use admin privileges only when needed
- Audit admin actions regularly
- Implement approval process for admin changes

**Network Security**
- Use HTTPS for Exchange connections
- Restrict Exchange access by IP if possible
- Monitor for unusual API activity
- Implement rate limiting
- Keep Exchange software updated

### Troubleshooting Admin Issues

**Cannot List All Users**
- CLI `hzn exchange user list` only shows current user
- Use Exchange API directly: `curl .../orgs/myorg/users`
- Requires admin or hubAdmin permissions

**Cannot Create Organization**
- Requires hubAdmin privileges
- Use root credentials: `-o root -u root:rootpw`
- Verify root credentials are correct

**Node Removal Fails**
- Node may have active agreements
- Use force flag: `hzn exchange node remove -f`
- Check if node is still heartbeating

**Permission Denied Errors**
- Verify user has admin flag: `curl .../users/username`
- Check organization matches: `-o myorg`
- Ensure credentials are correct
- Try with hubAdmin credentials if available

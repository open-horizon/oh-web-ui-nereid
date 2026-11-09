---
name: oh-service-lifecycle
description: Expert guidance for creating, building, testing, publishing, and managing Open Horizon edge services. Use when writing service definition JSON, testing services locally with hzn dev, publishing to the Exchange, managing semantic versioning, handling service dependencies, or deprecating old service versions.
---

# Service Lifecycle Management

## Purpose

Enable developers to efficiently develop and publish edge services with proper versioning, dependencies, and deployment configurations. Reduce errors in service definitions and provide clear workflows for the complete service lifecycle from creation to deprecation.

## Security Guidelines

**CRITICAL: Credential Protection**

When managing Open Horizon service lifecycle, especially when working with `HZN_EXCHANGE_USER_AUTH`:
- **NEVER** print or display the actual value of `HZN_EXCHANGE_USER_AUTH` to the screen
- **ALWAYS** mask credential values when displaying commands or output
- Use `${HZN_EXCHANGE_USER_AUTH}` in examples and documentation
- When showing command output that includes credentials, replace with `***MASKED***` or similar
- This applies to service publishing, registry credentials, and all Exchange operations
- When using private registry credentials with `-r` flag, mask the password portion

Example of proper credential handling:
```bash
# CORRECT - uses variable reference
hzn exchange service publish -f service.definition.json

# CORRECT - masked registry credentials
hzn exchange service publish -f service.definition.json -r "registry.example.com:myuser:***MASKED***"

# INCORRECT - never do this
hzn exchange service publish -f service.definition.json -r "registry.example.com:myuser:actualpassword123"
```

## Core Rules

### 1. Service Definition Creation

**Basic Service Definition Template** (`service.definition.json`)
```json
{
  "org": "myorg",
  "label": "My Edge Service",
  "description": "Description of what this service does",
  "public": false,
  "documentation": "https://github.com/myorg/my-service",
  "url": "my-service",
  "version": "1.0.0",
  "arch": "amd64",
  "sharable": "multiple",
  "requiredServices": [],
  "userInput": [],
  "deployment": {
    "services": {
      "my-service": {
        "image": "myorg/my-service:1.0.0",
        "privileged": false,
        "ports": [
          {
            "HostPort": "8080:8080/tcp",
            "HostIP": "0.0.0.0"
          }
        ],
        "environment": [
          "LOG_LEVEL=info"
        ]
      }
    }
  }
}
```

**Service URL Naming Convention**
- Use lowercase, hyphen-separated names: `my-edge-service`
- URL should be unique within organization
- Avoid version numbers in URL (use version field instead)
- Keep URLs short and descriptive

**Architecture Values**
- `amd64`: x86_64 / Intel/AMD 64-bit
- `arm64`: ARM 64-bit (e.g., Raspberry Pi 4)
- `arm`: ARM 32-bit (e.g., Raspberry Pi 3)
- `ppc64le`: IBM POWER8/POWER9

**Sharable Options**
- `exclusive`: Only one instance per node
- `single`: One instance, but can be shared by multiple agreements
- `multiple`: Multiple instances allowed

### 2. Service User Inputs

**Define Configuration Variables**
```json
{
  "userInput": [
    {
      "name": "MY_VAR",
      "label": "My Configuration Variable",
      "type": "string",
      "defaultValue": "default-value"
    },
    {
      "name": "API_KEY",
      "label": "API Key for External Service",
      "type": "string",
      "defaultValue": ""
    },
    {
      "name": "POLL_INTERVAL",
      "label": "Polling Interval (seconds)",
      "type": "int",
      "defaultValue": "60"
    },
    {
      "name": "ENABLE_DEBUG",
      "label": "Enable Debug Logging",
      "type": "boolean",
      "defaultValue": "false"
    }
  ]
}
```

**Supported Types**
- `string`: Text values
- `int`: Integer numbers
- `float`: Decimal numbers
- `boolean`: true/false values
- `list of strings`: Array of text values

### 3. Service Dependencies

**Define Required Services**
```json
{
  "requiredServices": [
    {
      "org": "myorg",
      "url": "gps-service",
      "versionRange": "[1.0.0,2.0.0)",
      "arch": "amd64"
    },
    {
      "org": "IBM",
      "url": "ibm.helloworld",
      "versionRange": "1.0.0",
      "arch": "amd64"
    }
  ]
}
```

**Version Range Syntax**
- `1.0.0`: Exact version match
- `[1.0.0,2.0.0)`: Version >= 1.0.0 and < 2.0.0
- `[1.0.0,INFINITY)`: Version >= 1.0.0
- `1.0.x`: Any patch version of 1.0

**Verify Dependencies Exist**
```bash
# List available services in organization
hzn exchange service list

# Check specific service
hzn exchange service list myorg/gps-service
```

### 4. Local Service Build and Testing

**Build Service Container**
```bash
# Build Docker image
docker build -t myorg/my-service:1.0.0 .

# Or using podman
podman build -t myorg/my-service:1.0.0 .

# Tag for registry
docker tag myorg/my-service:1.0.0 registry.example.com/myorg/my-service:1.0.0
```

**Test Service Locally with hzn dev**
```bash
# Start service with test inputs
hzn dev service start -S

# View service logs
hzn dev service log -f my-service

# Test with custom user inputs
cat > userinput.json <<EOF
{
  "services": [
    {
      "org": "myorg",
      "url": "my-service",
      "versionRange": "1.0.0",
      "variables": {
        "MY_VAR": "test-value",
        "API_KEY": "test-key"
      }
    }
  ]
}
EOF

hzn dev service start -S -f userinput.json

# Stop test service
hzn dev service stop
```

**Verify Service Behavior**
```bash
# Check container is running
docker ps | grep my-service

# Test service endpoints
curl http://localhost:8080/health

# View container logs
docker logs <container-id>
```

### 5. Service Publishing to Exchange

**Generate Signing Keys** (first time only)
```bash
# Create RSA key pair
hzn key create myorg my-email@example.com

# List keys
ls -la ~/.hzn/keys/
```

**Publish Service**
```bash
# Publish service definition with signing
hzn exchange service publish -f service.definition.json

# Verify publication
hzn exchange service list | grep my-service

# View published service details
hzn exchange service list myorg/my-service_1.0.0_amd64
```

**Publish with Private Registry**
```bash
# If using private registry, include credentials
hzn exchange service publish \
  -f service.definition.json \
  -r "registry.example.com:myuser:mypassword"
```

**Update Existing Service**
```bash
# Increment version in service.definition.json
# Then publish new version
hzn exchange service publish -f service.definition.json --overwrite
```

### 6. Semantic Versioning

**Version Format**: `MAJOR.MINOR.PATCH`

**When to Increment**
- **PATCH** (x.y.Z): Backward-compatible bug fixes
  - Bug fixes that don't change API
  - Performance improvements
  - Internal refactoring
  - Example: 1.0.0 → 1.0.1

- **MINOR** (x.Y.z): Backward-compatible new features
  - New functionality added
  - New optional parameters
  - Deprecation of features (but still functional)
  - Example: 1.0.1 → 1.1.0

- **MAJOR** (X.y.z): Breaking changes
  - Incompatible API changes
  - Removed functionality
  - Changed behavior that breaks existing deployments
  - Example: 1.1.0 → 2.0.0

**Version in Service Definition**
```json
{
  "version": "1.2.3",
  "url": "my-service"
}
```

**Version Ranges in Dependencies**
```json
{
  "requiredServices": [
    {
      "url": "dependency-service",
      "versionRange": "[1.0.0,2.0.0)"
    }
  ]
}
```

### 7. Service Removal and Deprecation

**Check Service Usage Before Removal**
```bash
# List deployment policies referencing service
hzn exchange deployment listpolicy | grep my-service

# List patterns using service
hzn exchange pattern list | grep my-service

# Check active agreements
hzn exchange service listkey myorg/my-service_1.0.0_amd64
```

**Remove Service Version**
```bash
# Remove specific version
hzn exchange service remove myorg/my-service_1.0.0_amd64

# Force removal (if referenced by policies)
hzn exchange service remove -f myorg/my-service_1.0.0_amd64
```

**Deprecation Strategy**
1. Publish new version with fixes/features
2. Update deployment policies to reference new version
3. Wait for all nodes to upgrade (monitor agreements)
4. Remove old version from Exchange

**Graceful Deprecation**
- Mark service as deprecated in documentation
- Publish final patch version with deprecation notice in logs
- Provide migration guide to new version
- Set timeline for removal (e.g., 90 days)

## Notes

### Common Pitfalls

1. **Image Not Pushed**: Service definition references image that doesn't exist in registry
2. **Version Conflicts**: Publishing same version twice requires `--overwrite` flag
3. **Missing Dependencies**: Required services not published before dependent service
4. **Architecture Mismatch**: Service arch doesn't match target node architecture
5. **Signing Key Missing**: Must create signing keys before first publish

### Best Practices

1. **Test Locally First**: Always test with `hzn dev service start` before publishing
2. **Semantic Versioning**: Follow semver strictly for predictable dependency management
3. **Minimal Images**: Use minimal base images (alpine, distroless) for smaller deployments
4. **Health Checks**: Include health check endpoints in services
5. **Logging**: Use structured logging with configurable log levels
6. **Documentation**: Keep service documentation URL updated in definition
7. **Registry Organization**: Use consistent image naming: `org/service:version`

### Authorization Requirements

**Service Publishing** (requires `admin: true` OR service publisher role):
- Publish new service to Exchange
- Update existing service version
- Remove service from Exchange
- Sign service definitions

**Service Development** (no special permissions):
- Create service definition files locally
- Build service containers locally
- Test services locally with `hzn dev service`
- View service definitions in Exchange (read-only)

**Service Dependency Operations** (read-only):
- List available services in organization
- Query service metadata and versions
- Check service availability for dependencies

### Versioning Guidelines

**Pre-release Versions**
- Use for testing: `1.0.0-beta.1`, `1.0.0-rc.1`
- Not recommended for production deployments
- Version ranges typically exclude pre-release versions

**Version Pinning**
- Production: Pin to specific minor version range `[1.2.0,1.3.0)`
- Development: Allow broader ranges `[1.0.0,2.0.0)`
- Critical services: Pin to exact version `1.2.3`

**Backward Compatibility**
- Maintain backward compatibility within major version
- Provide migration guides for major version upgrades
- Test upgrades with existing deployments before publishing

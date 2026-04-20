# OpenSandbox Helm Chart Scripts

This directory contains utility scripts for OpenSandbox Controller deployment and testing.

## Script List

### 1. install.sh - Installation Script

Interactive installation of OpenSandbox Controller to Kubernetes cluster.

**Features:**
- Automatic detection of sudo privilege requirements
- Validation of dependency tools (helm, kubectl)
- Cluster connection verification
- Support for multiple deployment environments:
  - Default configuration (values.yaml)
  - E2E testing (values-e2e.yaml)
  - Custom configuration (via --set or custom values file)
- Helm Chart validation
- Display verification commands after deployment

**Usage:**
```bash
cd scripts
./install.sh
```

**Environment Variables:**
- `IMAGE_REPO` - Override controller image repository
- `IMAGE_TAG` - Override controller image tag
- `SERVER_IMAGE_REPO` - Override server image repository
- `SERVER_IMAGE_TAG` - Override server image tag

**Example:**
```bash
# Using custom images
IMAGE_REPO=myregistry.com/controller \
IMAGE_TAG=v1.0.0 \
SERVER_IMAGE_REPO=myregistry.com/server \
SERVER_IMAGE_TAG=v0.1.0 \
./install.sh
```

### 2. uninstall.sh - Uninstallation Script

Uninstall OpenSandbox Controller and clean up related resources.

**Features:**
- Check running BatchSandbox and Pool resources
- Display Controller and Server deployment status
- Optional CRD deletion
- Optional namespace deletion
- Post-uninstall cleanup verification

**Usage:**
```bash
cd scripts
./uninstall.sh
```

**Environment Variables:**
- `RELEASE_NAME` - Release name (default: opensandbox-controller)
- `NAMESPACE` - Namespace (default: opensandbox)

**Example:**
```bash
# Uninstall specific release
RELEASE_NAME=my-release NAMESPACE=my-namespace ./uninstall.sh
```

### 3. e2e-test.sh - End-to-End Test Script

Execute complete end-to-end test workflow.

**Test Workflow:**
1. Helm Install (using values-e2e.yaml)
2. Verify Controller and Server deployment
3. Verify Pool deployment
4. Verify SDK calls
5. Helm Uninstall

**Features:**
- Automatic Server port-forward setup
- Server API health check validation
- Pool Pod execd process verification
- SDK integration test execution
- Automatic resource cleanup (including port-forward processes)

**Usage:**
```bash
cd scripts
./e2e-test.sh [VALUES_FILE]

# Using default values-e2e.yaml
./e2e-test.sh

# Using custom values file
./e2e-test.sh custom-values.yaml
```

**Prerequisites:**
- Required Docker images must be loaded:
  - opensandbox/controller:dev
  - opensandbox/server:v0.1.0
  - opensandbox/task-executor:dev
  - opensandbox/execd:v1.0.5
  - nginx:latest
- Python SDK installed (using uv)
- Cluster has sufficient resources to run test Pods

## General Instructions

### Sudo Privileges

All scripts automatically detect whether sudo privileges are required to execute kubectl and helm commands.

### Script Paths

Scripts use relative paths to locate the Chart directory and can be invoked from any location:
```bash
# From chart root directory
./scripts/install.sh

# From scripts directory
cd scripts
./install.sh

# From other directory
/path/to/opensandbox-controller/scripts/install.sh
```

### Colored Output

Scripts use ANSI color codes to enhance readability:
- 🟢 Green - Success messages
- 🟡 Yellow - Warnings and step titles
- 🔴 Red - Error messages

### Error Handling

All scripts use `set -e`, exiting immediately on errors. The e2e-test.sh uses trap to ensure cleanup functions execute on exit.

## Troubleshooting

### install.sh

**Issue: Cannot connect to Kubernetes cluster**
```bash
# Check kubeconfig
kubectl cluster-info

# Check context
kubectl config current-context
```

**Issue: Chart validation fails**
```bash
# Manual validation
helm lint ../
```

### uninstall.sh

**Issue: Resources are still running**
```bash
# View all BatchSandbox
kubectl get batchsandboxes -A

# View all Pool
kubectl get pools -A

# Delete all resources
kubectl delete batchsandboxes --all -A
kubectl delete pools --all -A
```

### e2e-test.sh

**Issue: Port-forward fails**
```bash
# Check if any process is using port 8080
lsof -i :8080

# Manual port-forward test
kubectl port-forward -n opensandbox svc/opensandbox-controller-server 8080:8080
```

**Issue: SDK test fails**
```bash
# Check Server logs
kubectl logs -n opensandbox -l app.kubernetes.io/component=server

# Check Pool Pod logs
kubectl logs -n opensandbox -l pool=agent-pool

# Test Server API
curl http://localhost:8080/health
```

**Issue: Image not found**
```bash
# Check if images are loaded
docker images | grep opensandbox

# Reload images
docker load -i /path/to/image.tar
```

## Development Guide

### Modifying Scripts

After modifying scripts, ensure:
1. Maintain consistent error handling
2. Update related documentation
3. Use meaningful colored output
4. Add appropriate validation steps

### Adding New Scripts

New scripts should follow these conventions:
- Use `#!/bin/bash` shebang
- Use `set -e` to enable exit-on-error
- Implement automatic sudo detection
- Add colored output for readability
- Add documentation in this README

## License

Apache License 2.0

# Changelog

All notable changes to the OpenSandbox Helm Chart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Initial Release

### Added

#### Core Features
- OpenSandbox Kubernetes Controller Helm chart
- **OpenSandbox Server deployment with FastAPI control plane for SDK integration**
- Support for deploying controller with configurable replicas and resources
- BatchSandbox and Pool CRD definitions
- RBAC resources (ClusterRole, ClusterRoleBinding, ServiceAccount)
- Leader election configuration for high availability

#### Server Features
- Server Deployment with configurable replicas and resources
- Server Service with ClusterIP/NodePort/LoadBalancer support
- ConfigMap-based configuration management
- Optional Ingress support for external access
- Health probes for liveness and readiness checks
- In-cluster Kubernetes configuration
- API key authentication support (optional)
- SDK-compatible REST API on port 8080

#### Pool Management
- Default agent-pool with execd and task-executor sidecar
- Pool template support for creating pre-warmed Pod pools
- Configurable Pool capacity (bufferMin, bufferMax, poolMin, poolMax)
- SDK-compatible Pool configuration with execd on port 44772

#### Multiple Values Files
- `values.yaml` - Default configuration with agent-pool enabled
- `values-e2e.yaml` - End-to-end testing with minimal resources (2-5 pods)
- Use `--set` or custom values files for production/development overrides

#### Templates
- `deployment.yaml` - Controller manager deployment
- **`server-deployment.yaml` - Server deployment**
- **`server-service.yaml` - Server service**
- **`server-configmap.yaml` - Server configuration**
- **`server-ingress.yaml` - Server ingress (optional)**
- `pools.yaml` - Dynamic Pool resource generation from values
- `serviceaccount.yaml` - Service account for controller
- `clusterrole.yaml` - RBAC cluster role
- `clusterrolebinding.yaml` - RBAC cluster role binding
- `leader-election-role.yaml` - Leader election RBAC
- `leader-election-rolebinding.yaml` - Leader election binding
- `metrics-service.yaml` - Metrics service endpoint
- `metrics-rbac.yaml` - Metrics RBAC resources
- `servicemonitor.yaml` - Prometheus ServiceMonitor (optional)
- `extra-roles.yaml` - User management roles (viewer, editor)
- `poddisruptionbudget.yaml` - High availability Pod disruption budget
- `NOTES.txt` - Post-installation guidance
- `_helpers.tpl` - Template helper functions

#### Scripts
- `scripts/install.sh` - Interactive installation wizard with environment selection
- `scripts/uninstall.sh` - Safe uninstallation with resource cleanup
- `scripts/e2e-test.sh` - End-to-end validation (Install → Server → Pool → SDK → Uninstall)
- `scripts/README.md` - Comprehensive script documentation and troubleshooting guide

#### Configuration Options
- `nameOverride` and `fullnameOverride` for custom resource naming
- **`server.enabled` - Enable/disable server deployment (default: true)**
- **`server.service.type` - Service type (ClusterIP/NodePort/LoadBalancer)**
- **`server.service.nodePort` - NodePort value (optional)**
- **`server.ingress.enabled` - Enable Ingress for external access**
- **`server.config.server.apiKey` - Optional API key authentication**
- `healthProbePort` - Configurable health check port (default: 8081)
- `healthProbes.liveness` - Liveness probe timing configuration
- `healthProbes.readiness` - Readiness probe timing configuration
- `podDisruptionBudget.enabled` - Optional PDB for HA deployments
- `namespaceOverride` - Custom namespace (default: opensandbox)

#### Documentation
- Comprehensive README.md with installation and configuration guide
- examples/README.md with usage scenarios and best practices
- examples/pool-agent-production.yaml with production-ready Pool configuration
- examples/DIRECTORY_STRUCTURE.md explaining file organization
- Example YAML files for Pool and BatchSandbox resources

### Configuration Defaults
- Controller image: `opensandbox/controller:dev`
- **Server image: `opensandbox/server:v0.1.0`**
- Task executor image: `opensandbox/task-executor:dev`
- Image pull policy: `Never` (for local development)
- Namespace: `opensandbox`
- Controller replicas: 1 (3 in production values)
- **Server replicas: 1**
- **Server enabled: true (required for SDK usage)**
- Default Pool enabled: `agent-pool` with 2-5 pods (E2E) or 10-100 pods (default)

### Notes
- This is the initial release of the Helm chart
- All templates have been tested with `helm lint` and E2E validation
- Chart supports Kubernetes 1.19+

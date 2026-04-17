# OpenSandbox Controller Helm Chart

This Helm chart deploys the OpenSandbox Kubernetes Controller, which manages sandbox environments through custom resources.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Container runtime (Docker, containerd, etc.)
- **Three container images required**:
  1. **Controller image**: The main controller manager
  2. **Server image**: FastAPI control plane for SDK usage
  3. **Task Executor image**: Sidecar container for task execution (optional but required for task features)

## Important: Image Requirements

OpenSandbox requires **three separate images**:

### 1. Controller Image
The main controller that manages BatchSandbox and Pool resources.

```bash
# Build controller image
make docker-build IMG=your-registry/opensandbox-controller:v1.0.0
docker push your-registry/opensandbox-controller:v1.0.0
```

### 2. Server Image
FastAPI control plane that exposes REST API for SDK usage. **This is the entry point for SDK clients**.

```bash
# Build server image (from server directory)
cd ../../../server
TAG=v1.0.0 ./build.sh
# Or manually:
docker build -t your-registry/opensandbox-server:v1.0.0 .
docker push your-registry/opensandbox-server:v1.0.0
```

**Note**: The server is **required for SDK usage**. If you only use `kubectl` to manage CRDs directly, you can disable it by setting `server.enabled=false`.

### 3. Task Executor Image
A sidecar container injected into Pool pods for task execution. **This is not deployed as a separate Deployment**, but configured in Pool resources.

```bash
# Build task-executor image
make docker-build-task-executor TASK_EXECUTOR_IMG=your-registry/opensandbox-task-executor:v1.0.0
docker push your-registry/opensandbox-task-executor:v1.0.0
```

**Note**: The task-executor image is only needed if you want to use task execution features. For basic sandbox management without tasks, only the controller and server images are required.

## Features

- **SDK Control Plane**: FastAPI server for Python SDK integration
- **Batch Sandbox Management**: Create and manage multiple identical sandbox environments
- **Resource Pooling**: Maintain pre-warmed resource pools for rapid provisioning
- **Task Orchestration**: Optional integrated task execution engine
- **High Availability**: Leader election support for multiple replicas
- **Metrics & Monitoring**: Prometheus metrics endpoint with optional ServiceMonitor
- **Flexible Access**: ClusterIP, NodePort, or Ingress support for server access

## Installation

### Quick Start

```bash
# Add the chart repository (if published)
helm repo add opensandbox https://charts.opensandbox.io
helm repo update

# Install the chart with all images
helm install opensandbox-controller opensandbox/opensandbox-controller \
  --set controllerManager.image.repository=your-registry/opensandbox-controller \
  --set controllerManager.image.tag=v1.0.0 \
  --set server.image.repository=your-registry/opensandbox-server \
  --set server.image.tag=v1.0.0 \
  --set taskExecutor.image.repository=your-registry/opensandbox-task-executor \
  --set taskExecutor.image.tag=v1.0.0

# Or install from local directory
helm install opensandbox-controller ./opensandbox-controller \
  --set controllerManager.image.repository=your-registry/opensandbox-controller \
  --set controllerManager.image.tag=v1.0.0 \
  --set server.image.repository=your-registry/opensandbox-server \
  --set server.image.tag=v1.0.0 \
  --set taskExecutor.image.repository=your-registry/opensandbox-task-executor \
  --set taskExecutor.image.tag=v1.0.0
```

### Custom Installation

```bash
# Install with custom values
helm install opensandbox-controller ./opensandbox-controller \
  --set controllerManager.image.repository=your-registry/sandbox-controller \
  --set controllerManager.image.tag=v1.0.0 \
  --namespace opensandbox \
  --create-namespace

# Install with values file
helm install opensandbox-controller ./opensandbox-controller \
  -f custom-values.yaml
```

## Configuration

The following table lists the configurable parameters of the chart and their default values.

### Controller Manager Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `controllerManager.image.repository` | Controller image repository | `opensandbox/controller` |
| `controllerManager.image.tag` | Controller image tag | `dev` |
| `controllerManager.image.pullPolicy` | Image pull policy | `Never` |
| `controllerManager.replicas` | Number of controller replicas | `1` |
| `controllerManager.resources.limits.cpu` | CPU limit | `500m` |
| `controllerManager.resources.limits.memory` | Memory limit | `128Mi` |
| `controllerManager.resources.requests.cpu` | CPU request | `10m` |
| `controllerManager.resources.requests.memory` | Memory request | `64Mi` |
| `controllerManager.leaderElect` | Enable leader election | `true` |
| `controllerManager.logLevel` | Log verbosity level | `3` |

### Task Executor Configuration

**Important**: The task-executor is not deployed as a separate service. It is configured as a sidecar container in Pool resources. These settings provide the default image and resource configurations for reference when creating Pools.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `taskExecutor.image.repository` | Task Executor image repository | `opensandbox/task-executor` |
| `taskExecutor.image.tag` | Task Executor image tag | `dev` |
| `taskExecutor.image.pullPolicy` | Image pull policy | `Never` |
| `taskExecutor.resources.limits.cpu` | Recommended CPU limit for sidecar | `500m` |
| `taskExecutor.resources.limits.memory` | Recommended memory limit for sidecar | `256Mi` |
| `taskExecutor.resources.requests.cpu` | Recommended CPU request for sidecar | `100m` |
| `taskExecutor.resources.requests.memory` | Recommended memory request for sidecar | `128Mi` |

### Server Configuration

**Important**: The server is a FastAPI control plane that exposes REST API for SDK usage. It is **required for SDK integration** but can be disabled if you only use `kubectl` to manage CRDs.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `server.enabled` | Enable server deployment | `true` |
| `server.image.repository` | Server image repository | `opensandbox/server` |
| `server.image.tag` | Server image tag | `v0.1.0` |
| `server.image.pullPolicy` | Image pull policy | `Never` |
| `server.replicas` | Number of server replicas | `1` |
| `server.resources.limits.cpu` | CPU limit | `1` |
| `server.resources.limits.memory` | Memory limit | `512Mi` |
| `server.resources.requests.cpu` | CPU request | `100m` |
| `server.resources.requests.memory` | Memory request | `256Mi` |
| `server.config.server.host` | Server listen host | `0.0.0.0` |
| `server.config.server.port` | Server listen port | `8080` |
| `server.config.server.logLevel` | Log level (INFO/DEBUG/WARNING/ERROR) | `INFO` |
| `server.config.server.apiKey` | Optional API key for authentication | `""` |
| `server.config.runtime.type` | Runtime type (kubernetes/docker) | `kubernetes` |
| `server.config.runtime.execdImage` | execd image for non-pool mode | `opensandbox/execd:v1.0.5` |
| `server.config.kubernetes.workloadProvider` | Workload provider type | `batchsandbox` |
| `server.service.type` | Service type (ClusterIP/NodePort/LoadBalancer) | `ClusterIP` |
| `server.service.port` | Service port | `8080` |
| `server.service.nodePort` | NodePort (when type=NodePort) | `""` |
| `server.ingress.enabled` | Enable Ingress | `false` |
| `server.ingress.className` | Ingress class name | `""` |
| `server.ingress.hosts` | Ingress host configuration | `[]` |

### Namespace Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `namespaceOverride` | Override the default namespace name | `"opensandbox"` |

**Note**: Both the controller, server, and user resources (Pool, BatchSandbox) use the same namespace for simplicity.

The server automatically uses in-cluster Kubernetes configuration and reads the namespace from the Helm chart configuration.

### Accessing the Server

#### Option 1: Port Forward (Development)

```bash
# Forward local port to server
kubectl port-forward -n opensandbox svc/opensandbox-controller-server 8080:8080

# Test connection
curl http://localhost:8080/health
```

#### Option 2: NodePort (Local Development)

```bash
# Install with NodePort
helm install opensandbox-controller ./opensandbox-controller \
  --set server.service.type=NodePort \
  --set server.service.nodePort=30080

# Access via node IP
curl http://<node-ip>:30080/health
```

#### Option 3: Ingress (Production)

```bash
# Install with Ingress
helm install opensandbox-controller ./opensandbox-controller \
  --set server.ingress.enabled=true \
  --set server.ingress.className=nginx \
  --set server.ingress.hosts[0].host=opensandbox.example.com \
  --set server.ingress.hosts[0].paths[0].path=/ \
  --set server.ingress.hosts[0].paths[0].pathType=Prefix

# Access via domain
curl https://opensandbox.example.com/health
```

### RBAC Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `rbac.create` | Create RBAC resources | `true` |
| `rbac.serviceAccount.create` | Create ServiceAccount | `true` |
| `rbac.serviceAccount.name` | ServiceAccount name (if not created) | `""` |

### Metrics Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `metrics.enabled` | Enable metrics service | `true` |
| `metrics.service.type` | Metrics service type | `ClusterIP` |
| `metrics.service.port` | Metrics service port | `8443` |
| `metrics.serviceMonitor.enabled` | Create ServiceMonitor (Prometheus Operator) | `false` |
| `metrics.serviceMonitor.interval` | Scrape interval | `30s` |

### CRD Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `crds.install` | Install CRDs | `true` |

### Extra Roles Configuration

| Parameter | Description | Default |
|-----------|-------------|---------|
| `extraRoles.batchsandboxEditor.enabled` | Create BatchSandbox editor role | `true` |
| `extraRoles.batchsandboxViewer.enabled` | Create BatchSandbox viewer role | `true` |
| `extraRoles.poolEditor.enabled` | Create Pool editor role | `true` |
| `extraRoles.poolViewer.enabled` | Create Pool viewer role | `true` |

## Usage Examples

### Example 1: Install with Custom Image

```bash
helm install opensandbox-controller ./opensandbox-controller \
  --set controllerManager.image.repository=myregistry.com/sandbox-controller \
  --set controllerManager.image.tag=latest
```

### Example 2: Install with High Availability

```bash
helm install opensandbox-controller ./opensandbox-controller \
  --set controllerManager.replicas=3 \
  --set controllerManager.resources.requests.cpu=100m \
  --set controllerManager.resources.requests.memory=256Mi
```

### Example 3: Install with Prometheus Monitoring

```bash
helm install opensandbox-controller ./opensandbox-controller \
  --set metrics.serviceMonitor.enabled=true
```

### Example 4: Install without CRDs (for upgrades)

```bash
helm upgrade opensandbox-controller ./opensandbox-controller \
  --set crds.install=false
```

## Creating Resources

After installation, you can create OpenSandbox resources:

### Create a Pool

```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: Pool
metadata:
  name: example-pool
spec:
  minBufferSize: 2
  maxBufferSize: 5
  capacity: 10
  sandboxTemplate:
    spec:
      image: ubuntu:latest
      command: ["sleep", "infinity"]
```

### Create a BatchSandbox

```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: BatchSandbox
metadata:
  name: example-batchsandbox
spec:
  replicas: 3
  ttlSecondsAfterFinished: 3600
  sandboxTemplate:
    spec:
      image: ubuntu:latest
      command: ["sleep", "infinity"]
```

## Using with SDK

The OpenSandbox Python SDK connects to the server to manage sandboxes. The server must be accessible from where you run the SDK.

### Access Methods

#### 1. Port Forward (Recommended for Development)

```bash
# Forward local port to server
kubectl port-forward -n opensandbox svc/opensandbox-controller-server 8080:8080
```

Then use SDK with `localhost:8080`:

```python
from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig

sandbox = await Sandbox.create(
    "ubuntu:latest",
    entrypoint=["sleep", "infinity"],
    connection_config=ConnectionConfig(domain="localhost:8080"),
    extensions={"poolRef": "agent-pool"}
)
```

#### 2. In-Cluster Access

If running SDK inside the same Kubernetes cluster:

```python
sandbox = await Sandbox.create(
    "ubuntu:latest",
    entrypoint=["sleep", "infinity"],
    connection_config=ConnectionConfig(
        domain="opensandbox-controller-server.opensandbox.svc.cluster.local:8080"
    ),
    extensions={"poolRef": "agent-pool"}
)
```

#### 3. NodePort / LoadBalancer / Ingress

For external access, configure the service type accordingly and use the appropriate domain.

### SDK Usage Examples

The OpenSandbox Python SDK supports two creation modes:

### Pooled Mode (Recommended)

Fast creation using pre-warmed pools. **Image must match the Pool's configuration**:

```python
from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig

sandbox = await Sandbox.create(
    "ubuntu:latest",  # Must match Pool's image
    entrypoint=["sleep", "infinity"],
    connection_config=ConnectionConfig(domain="localhost:8080"),  # Server address
    extensions={"poolRef": "agent-pool"}  # Reference to Pool name
)
```

**Important**: When using `poolRef`, the SDK's `image` parameter will be **ignored** - the Pool's pre-configured image is used instead. Only `entrypoint` and `env` can be customized.

### Non-pooled Mode

Direct creation with custom image and resources:

```python
sandbox = await Sandbox.create(
    "python:3.11",  # Any image
    resource={"cpu": "1", "memory": "500Mi"},
    connection_config=ConnectionConfig(domain="localhost:8080")
    # No poolRef specified
)
```

### Connect to Existing Sandbox

```python
# List all sandboxes
from opensandbox import SandboxManager
manager = SandboxManager(connection_config=ConnectionConfig(domain="localhost:8080"))
sandboxes = await manager.list_sandbox_infos(SandboxFilter())

# Connect to existing
sandbox = await Sandbox.connect(
    sandbox_id="<sandbox-id>",
    connection_config=ConnectionConfig(domain="localhost:8080")
)
```

For detailed SDK integration guide including troubleshooting, see [examples/README.md](examples/README.md)

## Upgrading

```bash
# Upgrade to a new version
helm upgrade opensandbox-controller ./opensandbox-controller \
  --set controllerManager.image.tag=v1.1.0

# Upgrade with new values
helm upgrade opensandbox-controller ./opensandbox-controller \
  -f new-values.yaml
```

## Uninstalling

```bash
# Uninstall the release
helm uninstall opensandbox-controller

# Note: CRDs are not automatically deleted. To remove them:
kubectl delete crd batchsandboxes.sandbox.opensandbox.io
kubectl delete crd pools.sandbox.opensandbox.io
```

## Troubleshooting

### Check Controller Status

```bash
# Check deployment
kubectl get deployment -n opensandbox

# Check pods
kubectl get pods -n opensandbox

# Check logs
kubectl logs -n opensandbox -l control-plane=controller-manager
```

### Verify CRDs

```bash
# List CRDs
kubectl get crds | grep sandbox.opensandbox.io

# Describe CRD
kubectl describe crd batchsandboxes.sandbox.opensandbox.io
```

### Check RBAC

```bash
# Check ServiceAccount
kubectl get sa -n opensandbox

# Check ClusterRoles
kubectl get clusterrole | grep sandbox-k8s

# Check ClusterRoleBindings
kubectl get clusterrolebinding | grep sandbox-k8s
```

## Development

### Quick Start Scripts

The chart includes utility scripts in the `scripts/` directory:

- **`scripts/install.sh`** - Interactive installation wizard
- **`scripts/uninstall.sh`** - Safe uninstallation with cleanup
- **`scripts/e2e-test.sh`** - End-to-end validation

See [scripts/README.md](scripts/README.md) for detailed documentation.

### Linting the Chart

```bash
helm lint ./opensandbox-controller
```

### Testing the Chart

```bash
# Dry run
helm install opensandbox-controller ./opensandbox-controller --dry-run --debug

# Template rendering
helm template opensandbox-controller ./opensandbox-controller
```

### Package the Chart

```bash
helm package ./opensandbox-controller
```

## Contributing

Please refer to the main [OpenSandbox repository](https://github.com/alibaba/OpenSandbox) for contribution guidelines.

## License

Apache License 2.0

## Support

- Documentation: https://github.com/alibaba/OpenSandbox
- Issues: https://github.com/alibaba/OpenSandbox/issues

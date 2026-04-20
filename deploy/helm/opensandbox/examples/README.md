# OpenSandbox Examples

This directory contains various usage examples and best practices for the OpenSandbox Kubernetes Controller.

## 🎉 Important Update

**Starting from version v0.2.0, the Helm chart deploys an agent-pool by default** without manual creation!

```bash
# Default installation automatically creates agent-pool
helm install opensandbox opensandbox-controller

# View the automatically created Pool
kubectl get pools -n opensandbox
```

If you don't need the Pool, you can disable it:
```bash
helm install opensandbox opensandbox-controller --set pools[0].enabled=false
```

## 📁 File List

### Pool Examples

| File | SDK Compatible | Custom Entrypoint | Purpose |
|------|----------------|-------------------|---------|
| `pool-sdk-compatible.yaml` | ✅ Supported | ❌ Not Supported | SDK Basic Mode (execd only)|
| `pool-sdk-with-tasks.yaml` | ✅ Supported | ✅ Supported | SDK Complete Mode (execd + task-executor)|
| **`pool-agent-production.yaml`** | ✅ Supported | ✅ Supported | **🌟 Production-Grade Agent Pool (Recommended)** |

### BatchSandbox Examples

| File | Mode | Purpose |
|------|------|---------|
| `batchsandbox-basic.yaml` | Non-pooled | Direct Pod creation without using Pool |
| `batchsandbox-with-tasks.yaml` | Pooled | Batch heterogeneous task example |

### Documentation

| File | Content |
|------|---------|
| `README.md` | This document |
| `pool-examples.md` | Detailed Pool configuration guide |

## 🎯 Core Concepts

### ❌ Common Misconceptions

> **Misconception 1**: Pool is a pre-created pool of Sandboxes that Agents can reuse
> **Correct**: Pool is a **Pod pool**, not a Sandbox pool

> **Misconception 2**: Need to pre-create BatchSandbox during Helm deployment for Agent use
> **Correct**: SDK creates a **new BatchSandbox** with each create() call, no pre-creation needed

> **Misconception 3**: Pool without execd can work with SDK
> **Correct**: SDK **requires** Pool to contain execd (port 44772)

### ✅ Correct Understanding

```
During Helm deployment:
└─> Only create Pool (long-running, maintains pre-warmed Pods)

During SDK runtime:
├─> Agent-1: SDK.create() → Creates BatchSandbox-1 (allocates Pod-1)
├─> Agent-2: SDK.create() → Creates BatchSandbox-2 (allocates Pod-2)
└─> Agent-1: SDK.kill()  → Deletes BatchSandbox-1 (Pod-1 returns to Pool)

Next request:
└─> Agent-3: SDK.create() → Creates BatchSandbox-3 (reuses Pod-1) ← Fast!
```

**Key Points**:
- ✅ Pool maintains **Pods** (pre-warmed containers)
- ✅ Each SDK.create() creates a **new BatchSandbox**
- ✅ Pods are reused, BatchSandboxes are not
- ❌ Don't pre-create BatchSandboxes

## 🚀 Quick Start

### Scenario A: Multi-Agent Concurrent Usage (Recommended)

**Use Cases**: Agent services, Code Interpreter, dynamic workflows

```bash
# 1. Install Helm chart (automatically creates agent-pool)
helm install opensandbox opensandbox-controller

# 2. Verify deployment
kubectl get deployment -n opensandbox
kubectl get pool -n opensandbox

# 3. Check Pool status
kubectl get pool agent-pool -n opensandbox -o jsonpath='{.status}' | jq
# Example output:
# {
#   "total": 10,      # Total Pods
#   "allocated": 0,   # Allocated
#   "available": 10   # Available
# }

# 4. View Pool Pods
kubectl get pods -l pool=agent-pool -n opensandbox
```

**SDK Usage**:

```python
from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig
from datetime import timedelta

async def handle_agent_request(agent_id: str, task: str):
    """Create a new sandbox for each Agent request"""
    # SDK.create() will allocate a Pod from agent-pool
    sandbox = await Sandbox.create(
        "nginx:latest",  # Will be ignored, uses image from Pool
        entrypoint=["/bin/sh", "-c", "sleep infinity"],
        env={"AGENT_ID": agent_id},
        timeout=timedelta(hours=1),
        connection_config=ConnectionConfig(domain="<server-ip>:8088"),
        extensions={"poolRef": "agent-pool"}  # Use default agent-pool
    )

    try:
        # Use sandbox
        result = await sandbox.commands.run(task)
        return result
    finally:
        # Delete BatchSandbox, Pod returns to Pool
        await sandbox.kill()
```

### Scenario B: Custom Pool Capacity (High Concurrency Scenarios)

If you need higher concurrency capacity, override default capacity parameters using `--set`:

```bash
# Use configuration optimized for multiple Agents (bufferMin: 50, poolMax: 300)
helm install opensandbox opensandbox-controller \
  --set pools[0].capacitySpec.bufferMin=50 \
  --set pools[0].capacitySpec.bufferMax=100 \
  --set pools[0].capacitySpec.poolMin=50 \
  --set pools[0].capacitySpec.poolMax=300
```

### Scenario C: Batch Task Execution (kubectl)

**Use Cases**: RL training, stress testing, batch data processing

```bash
# 1. Ensure Pool is deployed (automatically created by default)
kubectl get pool agent-pool -n opensandbox

# 2. Create BatchSandbox to execute batch tasks
kubectl apply -f batchsandbox-with-tasks.yaml

# 3. View task execution status
kubectl get batchsandbox task-batch-sandbox -n opensandbox -o wide

# 4. View task logs
POD_NAME=$(kubectl get pods -l batchsandbox=task-batch-sandbox -n opensandbox -o jsonpath='{.items[0].metadata.name}')
kubectl logs $POD_NAME -c sandbox-container -n opensandbox
kubectl logs $POD_NAME -c task-executor -n opensandbox

# 5. Automatic cleanup after task completion (ttlSecondsAfterFinished)
```

### Scenario D: Non-pooled Direct Creation

**Use Cases**: Testing environments, special image requirements

```bash
# Directly create BatchSandbox (without using Pool)
kubectl apply -f batchsandbox-basic.yaml

# View created Pods
kubectl get pods -l batchsandbox=basic-batch-sandbox -n opensandbox
```

## 📊 Pool Configuration Type Comparison

### Type 1: SDK Pool (Basic) - pool-sdk-compatible.yaml

```yaml
# ✅ SDK compatible - contains execd only
# ❌ Does not support custom entrypoint
initContainers:
- name: execd-installer
  image: opensandbox/execd:v1.0.5
containers:
- name: sandbox-container
  command: ["/opt/opensandbox/bin/bootstrap.sh", "nginx", "-g", "daemon off;"]
  ports:
  - containerPort: 44772
    name: execd
```

**SDK Usage**:
```python
sandbox = await Sandbox.create(
    "nginx:latest",
    # ❌ Cannot pass entrypoint
    env={"VAR": "value"},  # ✅ Can pass environment variables
    extensions={"poolRef": "sdk-pool"}
)
```

### Type 2: Task Pool (Complete) - pool-agent-production.yaml (Recommended)

```yaml
# ✅ SDK compatible - contains execd + task-executor
# ✅ Supports custom entrypoint
spec:
  shareProcessNamespace: true  # Required by task-executor
  initContainers:
  - name: execd-installer
    image: opensandbox/execd:v1.0.5
  containers:
  - name: sandbox-container
    command: ["/opt/opensandbox/bin/bootstrap.sh", "sleep", "infinity"]
    ports:
    - containerPort: 44772
      name: execd
  - name: task-executor  # Add task-executor sidecar
    image: opensandbox/task-executor:dev
    securityContext:
      capabilities:
        add: ["SYS_PTRACE"]
```

**SDK Usage** (with custom entrypoint):
```python
sandbox = await Sandbox.create(
    "nginx:latest",
    entrypoint=["/bin/sh", "-c", "custom command"],  # ✅ Can customize
    env={"VAR": "value"},
    extensions={"poolRef": "agent-pool"}
)
```

## 🔍 Monitoring and Debugging

### Monitor Pool Utilization

```bash
# Real-time monitoring
watch kubectl get pool agent-pool -o jsonpath='{.status}' | jq

# View detailed information
kubectl describe pool agent-pool

# View Pool Pod list
kubectl get pods -l pool=agent-pool -o wide
```

**Optimization Recommendations**:
- If `available` is frequently 0 → Increase `bufferMax`
- If `available` is always close to `total` → Decrease `bufferMin`
- If `total` frequently reaches `poolMax` → Increase `poolMax` or optimize Agent usage

### Verify Pool Configuration

```bash
# Check if Pod contains execd
kubectl exec -it <pod-name> -c sandbox-container -- ps aux | grep execd

# Check execd port
kubectl exec -it <pod-name> -c sandbox-container -- nc -zv localhost 44772

# Check task-executor (if present)
kubectl get pods -l pool=agent-pool -o jsonpath='{.items[0].spec.containers[*].name}'
# Output should include: sandbox-container task-executor
```

### View BatchSandbox Status

```bash
# List all BatchSandboxes
kubectl get batchsandboxes

# View detailed status
kubectl describe batchsandbox <name>

# View task execution statistics
kubectl get batchsandbox -o custom-columns=\
NAME:.metadata.name,\
REPLICAS:.spec.replicas,\
RUNNING:.status.taskRunning,\
SUCCEED:.status.taskSucceed,\
FAILED:.status.taskFailed
```

## 🛠️ Troubleshooting

### Pool Pod Fails to Start

```bash
# View Pod events
kubectl describe pod <pod-name>

# View container logs
kubectl logs <pod-name> -c sandbox-container
kubectl logs <pod-name> -c task-executor  # If present

# Check image pull
kubectl describe pod <pod-name> | grep -A 5 Events
```

### SDK Sandbox Creation Timeout

**Symptom**: SDK error `Health check timeout`

**Possible Causes**:
1. Pool doesn't have execd → Use `pool-agent-production.yaml`
2. execd not started → Check execd process in Pod
3. Network issues → Check network connectivity between Server and Pod

**Troubleshooting Steps**:
```bash
# 1. Confirm Pool contains execd
kubectl get pool agent-pool -o yaml | grep -A 10 initContainers

# 2. Check execd process
kubectl exec -it <pod-name> -c sandbox-container -- ps aux | grep execd

# 3. Check execd port
kubectl exec -it <pod-name> -c sandbox-container -- nc -zv localhost 44772

# 4. View Server logs
kubectl logs -l app=opensandbox-server -n opensandbox
```

### task-executor Permission Issues

```bash
# Check security context
kubectl get pod <pod-name> -o yaml | grep -A 10 securityContext

# Should contain:
# capabilities:
#   add: ["SYS_PTRACE"]

# Check process namespace sharing
kubectl get pod <pod-name> -o jsonpath='{.spec.shareProcessNamespace}'
# Should output: true
```

## 📦 Capacity Planning Recommendations

Plan Pool capacity based on concurrent Agent count:

| Concurrent Agents | bufferMin | bufferMax | poolMin | poolMax | Description |
|------------------|-----------|-----------|---------|---------|-------------|
| 1-10             | 2         | 5         | 2       | 20      | Small-scale testing |
| 10-50            | 10        | 20        | 10      | 100     | Small to medium applications |
| 50-200           | 50        | 100       | 50      | 300     | Medium to large applications |
| 200+             | 100       | 200       | 100     | 500     | Large-scale production |

**Parameter Descriptions**:
- `bufferMin`: Minimum buffer, ensures fast response
- `bufferMax`: Maximum buffer, controls pre-warming cost
- `poolMin`: Minimum capacity during low traffic periods
- `poolMax`: Maximum capacity during peak periods

**Cost Optimization**:
- Low traffic periods: Pool scales down to `poolMin`, saving resources
- Peak periods: Pool expands to `poolMax`, ensuring response speed
- Buffer zone: `bufferMin` ensures fast response, `bufferMax` avoids excessive pre-warming

## 📚 Related Documentation

### In-depth Analysis Documents

- **Pool Usage Guide**: `/data/home/cz/sandbox-test/pool-analysis/opensandbox_pool_usage_guide.md`
- **Architecture Diagrams**: `/data/home/cz/sandbox-test/pool-analysis/pool_architecture.txt`
- **Verification Test Scripts**: `/data/home/cz/sandbox-test/pool-analysis/test_pool_behavior.py`

### Helm Deployment Configuration

- **Main values configuration**: `/data/home/cz/OpenSandbox/kubernetes/helm-chart/values.yaml`
- **E2E test configuration**: `/data/home/cz/OpenSandbox/kubernetes/helm-chart/values-e2e.yaml`
- **Main README**: `/data/home/cz/OpenSandbox/kubernetes/README.md`

### API Reference

```bash
# View Pool CRD definition
kubectl explain pool
kubectl explain pool.spec
kubectl explain pool.spec.capacitySpec

# View BatchSandbox CRD definition
kubectl explain batchsandbox
kubectl explain batchsandbox.spec
kubectl explain batchsandbox.spec.taskTemplate
```

## 🧹 Resource Cleanup

```bash
# Delete BatchSandbox
kubectl delete batchsandbox --all -n default

# Delete Pool (automatically cleans up related Pods)
kubectl delete pool --all -n default

# Delete all resources in namespace
kubectl delete all --all -n default
```

## 💡 Best Practices Summary

1. **Pool is a Pod pool, not a Sandbox pool**
2. **SDK creates a new BatchSandbox with each create() call**
3. **No need to pre-create BatchSandboxes for reuse**
4. **Only create Pool during Helm deployment**
5. **Dynamically create/delete BatchSandboxes at runtime**
6. **Configure Pool capacity parameters appropriately to optimize cost and performance**
7. **Use `pool-agent-production.yaml` as production environment template**

## 🔗 More Examples

- **Detailed Pool configuration guide**: See `pool-examples.md`
- **SDK integration examples**: See "Quick Start" section in this document
- **Helm Chart configuration**: See `values.yaml` and `values-e2e.yaml`
